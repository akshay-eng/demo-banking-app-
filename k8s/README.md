# Demo Banking App — Kubernetes Setup

## Architecture

```
[Frontend (nginx)]  ──→  [Backend (Node.js/Express/Prisma)]  ──→  [PostgreSQL]
   port 80                       port 4000                           port 5432
   Deployment×1                  Deployment×2                        StatefulSet×1
                                                                       PVC: 512Mi
```

All pods run in the `banking-demo` namespace.
Instana agent runs as a DaemonSet in the `instana-agent` namespace.

## Prerequisites

- Kubernetes cluster (minikube / kind / EKS / GKE / AKS)
- `kubectl` configured
- Docker (to build images)
- Instana agent key (for observability)

## Quick Start

### 1. Build Docker images

```bash
# From repo root
docker build -t demobanking-backend ./backend
docker build -t demobanking-frontend ./frontend

# For minikube — load images directly instead of pushing to a registry
minikube image load demobanking-backend:latest
minikube image load demobanking-frontend:latest
```

### 2. Deploy the stack

```bash
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secret.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
```

### 3. Wait for everything to be ready

```bash
kubectl get pods -n banking-demo -w
# All should show Running/Ready within ~60s
```

### 4. Access the app

```bash
# minikube
minikube service frontend -n banking-demo

# or port-forward
kubectl port-forward svc/frontend 3000:80 -n banking-demo
# → open http://localhost:3000
```

### 5. Deploy Instana agent

Edit `k8s/instana/agent-daemonset.yaml` and fill in your keys:
- `INSTANA_AGENT_KEY`
- `INSTANA_DOWNLOAD_KEY`
- `INSTANA_AGENT_ENDPOINT_HOST`

```bash
kubectl apply -f k8s/instana/agent-daemonset.yaml
```

---

## Error Scenarios

Each scenario simulates a realistic failure chain observable end-to-end in Instana.

### Scenario 1 — DB Disk Full

**What breaks:** PostgreSQL PVC fills up → Postgres cannot write WAL/data →
all backend write operations return 503 → frontend transfers/logins fail.

```bash
kubectl apply -f k8s/errors/01-fill-disk-job.yaml

# Watch the Job
kubectl logs -n banking-demo -l scenario=disk-fill -f

# What to see in Instana:
#  • Postgres > Disk Used → 100%
#  • Backend  > Error Rate → spike to ~100%
#  • Backend  > HTTP 503 on /api/transactions, /api/accounts
#  • K8s      > postgres pod readiness probe fails → NotReady event
```

**Restore:**
```bash
kubectl delete job fill-disk-job -n banking-demo
kubectl exec -n banking-demo postgres-0 -- \
  psql -U bankadmin -d demobankingdb -c "DELETE FROM chaos_filler; VACUUM FULL;"
```

---

### Scenario 2 — Connection Pool Exhaustion

**What breaks:** Backend DB pool (5 connections) is saturated by concurrent
requests → new requests cannot get a connection → Prisma P2024 timeout →
HTTP 503 with `"Database pool or write error"`.

```bash
kubectl apply -f k8s/errors/02-load-spike-job.yaml

# Or trigger via curl:
kubectl port-forward svc/backend 4000:4000 -n banking-demo
curl -X POST http://localhost:4000/api/chaos/exhaust-pool \
  -H "Content-Type: application/json" -d '{"seconds":30}'

# What to see in Instana:
#  • Backend  > Latency P95 → 5000ms+
#  • Backend  > Error Rate → 100%
#  • Database > Active Connections → hit ceiling (DB_CONNECTION_LIMIT=5)
#  • Traces   > "Timed out fetching a new connection" spans
```

**Restore:** Wait 30 seconds (pool releases automatically).

---

### Scenario 3 — Backend OOM Kill → CrashLoopBackOff

**What breaks:** Backend pod gets OOMKilled (exit 137) by K8s → pod restarts
immediately and gets OOMKilled again → CrashLoopBackOff → nginx 502.

```bash
# Step 1: apply tight memory limit (96Mi — too low for Node.js + Prisma)
kubectl apply -f k8s/errors/03-backend-oom.yaml

# Step 2: trigger the OOM allocation
kubectl port-forward svc/backend 4000:4000 -n banking-demo
curl -X POST http://localhost:4000/api/chaos/oom

# Watch the crash loop
kubectl get pods -n banking-demo -w

# What to see in Instana:
#  • K8s > Events: "OOMKilling" → "BackOff"
#  • K8s > Pod restart count for backend → increasing
#  • Frontend: 100% 502 Bad Gateway errors
#  • Instana alert: "CrashLoopBackOff on banking-backend"
```

**Restore:**
```bash
kubectl apply -f k8s/backend/deployment.yaml
```

---

### Scenario 4 — Database Pod Killed

**What breaks:** Postgres StatefulSet scaled to 0 → DB service endpoints empty
→ backend ECONNREFUSED on every request → /health returns 503 → all API calls fail.

```bash
kubectl scale statefulset postgres --replicas=0 -n banking-demo

# What to see in Instana:
#  • Service 'banking-postgres' → DOWN
#  • Backend /health → HTTP 503 {"db":"unavailable"}
#  • Traces  > ECONNREFUSED errors on all DB spans
```

**Restore:**
```bash
kubectl scale statefulset postgres --replicas=1 -n banking-demo
```

---

### Scenario 5 — Network Partition (silent DB unreachable)

**What breaks:** NetworkPolicy blocks all ingress to postgres pod. The pod stays
Running/Ready in K8s, but TCP connections from backend time out silently.
This is the "sneaky" scenario — infra looks healthy, only Instana's distributed
tracing reveals the broken path.

```bash
kubectl apply -f k8s/errors/05-network-policy.yaml

# What to see in Instana (and ONLY in Instana):
#  • Postgres pod = Running ✓  (misleading — K8s health probes still pass internally)
#  • Backend traces: DB spans show connection timeout (not refused), latency ~5s
#  • This scenario cannot be diagnosed from K8s metrics alone — needs tracing
```

**Restore:**
```bash
kubectl delete networkpolicy block-postgres-ingress -n banking-demo
```

---

## Chaos Endpoints Reference

All available without auth at `http://<backend>:4000/api/chaos/`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/status` | DB connectivity + memory usage |
| `POST` | `/fill-disk` | Write large rows until PVC full |
| `POST` | `/exhaust-pool` | Hold DB connections for N seconds |
| `POST` | `/transfer-stress` | DB-heavy operation (used by load job) |
| `POST` | `/slow-query` | Run pg_sleep(N) — latency spike |
| `POST` | `/oom` | Allocate memory until OOMKilled |
| `POST` | `/crash` | process.exit(1) → pod restart |

---

## Simulate Script

```bash
chmod +x k8s/simulate.sh
./k8s/simulate.sh status
./k8s/simulate.sh disk-full
./k8s/simulate.sh pool-exhaustion
./k8s/simulate.sh oom
./k8s/simulate.sh kill-db
./k8s/simulate.sh network-partition
./k8s/simulate.sh reset     # restore everything
```
