#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Demo Banking App — Error Simulation Script
# Triggers each chaos scenario and shows how to observe it in Instana
# ══════════════════════════════════════════════════════════════════════════════

NS="banking-demo"
BACKEND_SVC="backend:4000"

# Port-forward helper (run in background)
pf() {
  kubectl port-forward -n $NS svc/backend 4000:4000 &>/dev/null &
  PF_PID=$!
  sleep 2
  echo "Port-forward active (PID $PF_PID)"
}

cleanup_pf() {
  [ -n "$PF_PID" ] && kill $PF_PID 2>/dev/null
}

trap cleanup_pf EXIT

header() {
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo "  $1"
  echo "════════════════════════════════════════════════════════"
}

watch_pods() {
  echo "→ Watching pods (Ctrl-C to stop):"
  kubectl get pods -n $NS -w
}

# ── SCENARIO 0: Status Check ──────────────────────────────────────────────────
status() {
  header "STATUS CHECK"
  echo "Pods:"
  kubectl get pods -n $NS
  echo ""
  echo "Services:"
  kubectl get svc -n $NS
  echo ""
  echo "PVC usage:"
  kubectl get pvc -n $NS
  echo ""
  echo "Backend health:"
  pf
  curl -s http://localhost:4000/health | python3 -m json.tool 2>/dev/null || \
  curl -s http://localhost:4000/health
  cleanup_pf
}

# ── SCENARIO 1: DB Disk Full ──────────────────────────────────────────────────
# Expected Instana alerts:
#   ▸ DB disk utilization → 100%
#   ▸ Backend error rate spike (503)
#   ▸ Postgres pod readiness → FAIL
scenario_disk_full() {
  header "SCENARIO 1: DB DISK FULL"
  echo "Applying fill-disk Job..."
  kubectl apply -f "$(dirname "$0")/errors/01-fill-disk-job.yaml"

  echo ""
  echo "Watching Job progress:"
  kubectl wait --for=condition=ready pod -l scenario=disk-full -n $NS --timeout=30s
  kubectl logs -n $NS -l scenario=disk-full -f &

  echo ""
  echo "Simultaneously hammering backend write endpoints..."
  pf
  for i in $(seq 1 20); do
    curl -s http://localhost:4000/api/chaos/transfer-stress \
      -w "  HTTP %{http_code}\n" -o /dev/null &
  done
  wait

  echo ""
  echo "Backend /health after fill:"
  curl -s http://localhost:4000/health | python3 -m json.tool 2>/dev/null || \
  curl -s http://localhost:4000/health

  echo ""
  echo "Cleanup:"
  echo "  kubectl delete job fill-disk-job -n $NS"
  echo "  kubectl exec -n $NS postgres-0 -- psql -U bankadmin -d demobankingdb -c 'DELETE FROM chaos_filler; VACUUM FULL;'"
}

# ── SCENARIO 2: Connection Pool Exhaustion ─────────────────────────────────────
# Expected Instana alerts:
#   ▸ Backend P95 latency > 5s
#   ▸ Backend error rate → 100%
#   ▸ Prisma P2024 errors in spans
scenario_pool_exhaustion() {
  header "SCENARIO 2: CONNECTION POOL EXHAUSTION"
  pf
  echo "Triggering pool hold (30s)..."
  curl -s -X POST http://localhost:4000/api/chaos/exhaust-pool \
    -H "Content-Type: application/json" \
    -d '{"seconds": 30}'
  echo ""

  echo "Firing 50 concurrent requests while pool is held..."
  for i in $(seq 1 50); do
    curl -s http://localhost:4000/api/chaos/transfer-stress \
      -w "[$i] HTTP %{http_code}  time=%{time_total}s\n" \
      -o /dev/null &
  done
  wait

  echo ""
  echo "Pool should recover after 30s."
  echo "Watch Instana: Backend service > Error Rate  +  Database > Active Connections"
}

# ── SCENARIO 3: Backend OOM Kill ──────────────────────────────────────────────
# Expected Instana alerts:
#   ▸ K8s event: OOMKilling
#   ▸ Pod restart count increasing
#   ▸ CrashLoopBackOff if memory < baseline
scenario_oom() {
  header "SCENARIO 3: BACKEND OOM KILL"
  echo "Applying tight memory limits to backend..."
  kubectl apply -f "$(dirname "$0")/errors/03-backend-oom.yaml"
  sleep 5

  echo "Triggering OOM via chaos endpoint..."
  pf
  curl -s -X POST http://localhost:4000/api/chaos/oom
  echo ""

  echo "Watching pod state (look for OOMKilled → CrashLoopBackOff):"
  kubectl get pods -n $NS -w &
  sleep 30
  kill %2 2>/dev/null

  echo ""
  echo "Pod describe (shows OOMKilled events):"
  kubectl describe pods -n $NS -l app=backend | grep -A5 "OOM\|Exit Code\|Restart\|Reason"

  echo ""
  echo "Cleanup (restore normal limits):"
  echo "  kubectl apply -f k8s/backend/deployment.yaml"
}

# ── SCENARIO 4: DB Killed ─────────────────────────────────────────────────────
# Expected Instana alerts:
#   ▸ Service 'banking-postgres' DOWN
#   ▸ Backend /health → 503 degraded
#   ▸ All /api/* endpoints fail
scenario_kill_db() {
  header "SCENARIO 4: DATABASE KILLED (scale to 0)"
  echo "Scaling postgres StatefulSet to 0..."
  kubectl scale statefulset postgres --replicas=0 -n $NS
  sleep 5

  echo "Checking backend health (should be 503):"
  pf
  curl -sv http://localhost:4000/health 2>&1 | grep -E "HTTP|status|db|error"
  echo ""

  echo "Firing API requests (should all fail):"
  for endpoint in /health /api/chaos/status; do
    echo -n "  $endpoint → "
    curl -s http://localhost:4000$endpoint | python3 -m json.tool 2>/dev/null || \
    curl -s http://localhost:4000$endpoint
    echo ""
  done

  echo ""
  echo "Restore:"
  echo "  kubectl scale statefulset postgres --replicas=1 -n $NS"
}

# ── SCENARIO 5: Network Partition ─────────────────────────────────────────────
# Expected Instana alerts:
#   ▸ Backend outbound connection timeouts (not refused — dropped)
#   ▸ Postgres pod = Running/Ready, but backend can't reach it
scenario_network_partition() {
  header "SCENARIO 5: NETWORK PARTITION (DB unreachable)"
  echo "Applying NetworkPolicy to block backend → postgres..."
  kubectl apply -f "$(dirname "$0")/errors/05-network-policy.yaml"
  sleep 3

  echo "Checking: postgres pod should still be Running..."
  kubectl get pods -n $NS -l app=postgres

  echo ""
  echo "Checking: backend health (DB latency will spike / timeout):"
  pf
  curl -sv --max-time 10 http://localhost:4000/health 2>&1 | grep -E "HTTP|status|db|latency|error"

  echo ""
  echo "Restore:"
  echo "  kubectl delete networkpolicy block-postgres-ingress -n $NS"
}

# ── Reset Everything ──────────────────────────────────────────────────────────
reset_all() {
  header "RESET ALL CHAOS"
  kubectl delete job fill-disk-job load-spike-job -n $NS 2>/dev/null || true
  kubectl delete networkpolicy block-postgres-ingress -n $NS 2>/dev/null || true
  kubectl scale statefulset postgres --replicas=1 -n $NS
  kubectl apply -f "$(dirname "$0")/backend/deployment.yaml"
  pf
  kubectl exec -n $NS postgres-0 -- psql -U bankadmin -d demobankingdb \
    -c "DELETE FROM chaos_filler; VACUUM FULL;" 2>/dev/null || true
  echo "Reset complete. Waiting for pods to be ready..."
  kubectl wait --for=condition=ready pod -l app=backend -n $NS --timeout=120s
  kubectl wait --for=condition=ready pod -l app=postgres -n $NS --timeout=60s
  echo "All services restored."
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-}" in
  status)            status ;;
  disk-full)         scenario_disk_full ;;
  pool-exhaustion)   scenario_pool_exhaustion ;;
  oom)               scenario_oom ;;
  kill-db)           scenario_kill_db ;;
  network-partition) scenario_network_partition ;;
  reset)             reset_all ;;
  *)
    echo "Usage: $0 {status|disk-full|pool-exhaustion|oom|kill-db|network-partition|reset}"
    echo ""
    echo "Scenarios:"
    echo "  status            — check pod/service/PVC status + backend health"
    echo "  disk-full         — fill postgres PVC → DB write errors → backend 503"
    echo "  pool-exhaustion   — exhaust DB connection pool → Prisma P2024 → 503"
    echo "  oom               — OOMKill backend pod → CrashLoopBackOff → 502"
    echo "  kill-db           — scale postgres to 0 → ECONNREFUSED → 503"
    echo "  network-partition — NetworkPolicy blocks DB → connection timeout → 503"
    echo "  reset             — restore all services to normal"
    ;;
esac
