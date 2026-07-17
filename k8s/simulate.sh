#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Demo Banking App — Error Simulation Script
# Triggers each chaos scenario and shows how to observe it in Instana
# ══════════════════════════════════════════════════════════════════════════════

NS="banking-demo"
BACKEND_SVC="backend:4000"

# Confirms a local port is actually talking to OUR pod, not some unrelated
# service that happened to already be listening there. kubectl port-forward
# fails silently if the local port is taken — it still launches a process
# and returns a PID, it just never binds, so curl ends up hitting whatever
# else was already on that port. This checks for a fingerprint unique to our
# own app before any scenario is allowed to trust the tunnel.
wait_for_port() {
  local port=$1 path=$2 fingerprint=$3 label=$4
  for i in $(seq 1 10); do
    body=$(curl -s --max-time 2 "http://localhost:${port}${path}" 2>/dev/null)
    if echo "$body" | grep -q "$fingerprint"; then
      echo "  $label tunnel confirmed (localhost:$port)."
      return 0
    fi
    sleep 1
  done
  echo "  ✗ $label tunnel on localhost:$port did NOT respond as expected."
  echo "    Something else may already be listening on that port on this node."
  echo "    Check with: ss -tlnp | grep :$port   (or: sudo lsof -i :$port)"
  return 1
}

# Port-forward helper (run in background)
pf() {
  kubectl port-forward -n $NS svc/backend 4000:4000 &>/tmp/pf-backend.log &
  PF_PID=$!
  sleep 2
  echo "Port-forward active (PID $PF_PID)"
  wait_for_port 4000 /health "DemoBanking API" "Backend"
}

cleanup_pf() {
  [ -n "$PF_PID" ] && kill $PF_PID 2>/dev/null
  [ -n "$PF_FE_PID" ] && kill $PF_FE_PID 2>/dev/null
}

trap cleanup_pf EXIT

# Port-forward the frontend Service (nginx) — separate from pf() above, which
# talks to the backend directly and bypasses nginx entirely. Uses 18080
# rather than the much more commonly-already-taken 8080.
pf_frontend() {
  kubectl port-forward -n $NS svc/frontend 18080:80 &>/tmp/pf-frontend.log &
  PF_FE_PID=$!
  sleep 2
  echo "Frontend port-forward active (PID $PF_FE_PID)"
  wait_for_port 18080 / "DemoBank" "Frontend"
}

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

# ── SCENARIO 4b: Postgres OOM Kill → real CrashLoopBackOff ────────────────────
# Unlike scenario_kill_db (clean scale-to-zero, no restart count, no OOM
# event), this reproduces an actual "container ran out of memory" failure —
# the signature Instana shows as OOMKilled + climbing restart count, not
# just an absence. No trigger step needed: the tight limit alone does it.
scenario_postgres_oom() {
  header "SCENARIO 4b: POSTGRES OOM KILL → CRASHLOOPBACKOFF"
  echo "Applying tight memory limit to postgres (16Mi, below its own"
  echo "postgresql.conf shared_buffers=32MB setting)..."
  kubectl apply -f "$(dirname "$0")/errors/06-postgres-oom.yaml"

  echo ""
  echo "Watching pod state (look for OOMKilled → CrashLoopBackOff):"
  kubectl get pods -n $NS -l app=postgres -w &
  sleep 30
  kill %1 2>/dev/null

  echo ""
  echo "Pod describe (shows OOMKilled events):"
  kubectl describe pods -n $NS -l app=postgres | grep -A5 "OOM\|Exit Code\|Restart\|Reason"

  echo ""
  echo "Cleanup (restore normal limits):"
  echo "  kubectl apply -f $(dirname "$0")/postgres/statefulset.yaml"
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

# ── SCENARIO 6: Full Cascade — DB crash → backend log errors → frontend errors ─
# One command, whole chain, hit through the real frontend Service (not a
# backend port-forward) so nginx's actual proxy path gets exercised.
#
# Expected Instana alerts:
#   ▸ Kubernetes: postgres StatefulSet not-ready / restart event
#   ▸ Application: banking-backend error rate + call-volume drop
#   ▸ Backend pod logs: Prisma connection errors (real, not simulated)
#
# Known nuance, not a script bug: authenticated calls during the outage come
# back 401 "Invalid or expired token," not 500/503. The auth middleware's
# catch block treats a DB failure the same as a bad token — so that 401 IS
# the DB outage, just mislabeled. Watch the backend logs (tailed below) to
# see the real Prisma error underneath it.
CHAOS_USER_EMAIL="chaos-demo@example.com"
CHAOS_USER_PASS="ChaosDemo123!"

scenario_cascade() {
  local mode="${1:-scale}"   # scale (clean absence) or oom (real CrashLoopBackOff)
  header "SCENARIO 6: FULL CASCADE — DB → BACKEND LOGS → FRONTEND ERRORS ($mode)"

  echo "── Step 1/4: register a throwaway user while the DB is still up (need a real token) ──"
  pf_frontend
  if [ $? -ne 0 ]; then
    echo ""
    echo "Aborting — traffic sent to an unverified tunnel would be meaningless."
    echo "See /tmp/pf-frontend.log for the raw kubectl port-forward output."
    cleanup_pf
    return 1
  fi

  REGISTER_RESP=$(curl -s -X POST http://localhost:18080/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$CHAOS_USER_EMAIL\",\"password\":\"$CHAOS_USER_PASS\",\"firstName\":\"Chaos\",\"lastName\":\"Demo\"}")
  TOKEN=$(echo "$REGISTER_RESP" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')

  if [ -z "$TOKEN" ]; then
    echo "  Already registered — logging in instead."
    LOGIN_RESP=$(curl -s -X POST http://localhost:18080/api/auth/login \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$CHAOS_USER_EMAIL\",\"password\":\"$CHAOS_USER_PASS\"}")
    TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
  fi

  if [ -z "$TOKEN" ]; then
    echo "  Could not get a token even via login — raw response was:"
    echo "  $LOGIN_RESP"
    echo "  Continuing with unauthenticated traffic only."
  else
    echo "  Got a token (${#TOKEN} chars)."
  fi

  echo ""
  echo "── Step 2/4: tail backend logs in the background (Ctrl-C stops the whole script) ──"
  kubectl logs -n $NS -l app=backend -f --tail=0 --prefix &
  LOGS_PID=$!

  echo ""
  if [ "$mode" = "oom" ]; then
    echo "── Step 3/4: crash the database (OOM → real CrashLoopBackOff) ──"
    kubectl apply -f "$(dirname "$0")/errors/06-postgres-oom.yaml"
    echo "  Waiting for the OOM/restart cycle to kick in..."
    sleep 12
    echo "  Postgres pod state right now:"
    kubectl get pods -n $NS -l app=postgres
  else
    echo "── Step 3/4: crash the database (clean scale-to-zero) ──"
    kubectl scale statefulset postgres --replicas=0 -n $NS
    echo "  Waiting for the backend readinessProbe to notice..."
    sleep 8
  fi

  echo ""
  echo "── Step 4/4: fire mixed traffic through the real frontend Service ──"

  echo "  /health — nginx doesn't proxy this path (only /api/ is proxied), so"
  echo "  this one goes straight to the backend, same as the other scenarios:"
  pf
  if [ $? -eq 0 ]; then
    curl -s http://localhost:4000/health -w "  → HTTP %{http_code}\n" -o /dev/null
  else
    echo "  Skipped — backend tunnel didn't verify. See /tmp/pf-backend.log."
  fi
  kill $PF_PID 2>/dev/null
  unset PF_PID

  echo ""
  echo "  Protected endpoint, NO token (genuine 401, unrelated to the DB):"
  curl -s http://localhost:18080/api/accounts -w "  → HTTP %{http_code}\n" -o /dev/null

  echo ""
  echo "  Protected endpoint, WITH token (401 — this one IS the DB outage, mislabeled):"
  for ep in /api/accounts /api/cards /api/transactions; do
    curl -s http://localhost:18080$ep -H "Authorization: Bearer $TOKEN" \
      -w "    $ep → HTTP %{http_code}\n" -o /dev/null
  done

  echo ""
  echo "  Nonexistent path (genuine 404, Express's default handler):"
  curl -s http://localhost:18080/api/this-route-does-not-exist \
    -w "  → HTTP %{http_code}\n" -o /dev/null

  echo ""
  echo "  Repeating the authenticated hits a few more times for a visible spike..."
  for i in $(seq 1 15); do
    curl -s http://localhost:18080/api/transactions -H "Authorization: Bearer $TOKEN" \
      -w "[$i] HTTP %{http_code}\n" -o /dev/null &
  done
  wait

  kill $LOGS_PID 2>/dev/null

  echo ""
  echo "Restore:"
  if [ "$mode" = "oom" ]; then
    echo "  kubectl apply -f $(dirname "$0")/postgres/statefulset.yaml"
  else
    echo "  kubectl scale statefulset postgres --replicas=1 -n $NS"
  fi
  echo "  (or: $0 reset)"
}

# ── Reset Everything ──────────────────────────────────────────────────────────
reset_all() {
  header "RESET ALL CHAOS"
  kubectl delete job fill-disk-job load-spike-job -n $NS 2>/dev/null || true
  kubectl delete networkpolicy block-postgres-ingress -n $NS 2>/dev/null || true
  # Restores postgres's real resource limits too, not just replica count —
  # postgres-oom / cascade oom patch the StatefulSet spec itself, which a
  # bare `scale` never touches, so the crash loop would otherwise continue.
  kubectl apply -f "$(dirname "$0")/postgres/statefulset.yaml"
  kubectl scale statefulset postgres --replicas=1 -n $NS
  kubectl apply -f "$(dirname "$0")/backend/deployment.yaml"
  pf
  kubectl exec -n $NS postgres-0 -- psql -U bankadmin -d demobankingdb \
    -c "DELETE FROM chaos_filler; VACUUM FULL;" 2>/dev/null || true
  echo "Reset complete. Waiting for pods to be ready..."
  kubectl wait --for=condition=ready pod -l app=backend -n $NS --timeout=120s
  backend_ok=$?
  # 150s, not 60s — recovering FROM a crash loop takes longer than a fresh
  # start: Kubernetes' exponential backoff from the prior CrashLoopBackOff
  # is often still counting up before the corrected pod is even attempted.
  kubectl wait --for=condition=ready pod -l app=postgres -n $NS --timeout=150s
  postgres_ok=$?

  if [ $backend_ok -eq 0 ] && [ $postgres_ok -eq 0 ]; then
    echo "All services restored."
  else
    echo "⚠ Reset commands were issued, but not everything confirmed ready in time:"
    [ $backend_ok -ne 0 ]  && echo "  - backend did not reach Ready"
    [ $postgres_ok -ne 0 ] && echo "  - postgres did not reach Ready"
    echo "  Check manually: kubectl get pods -n $NS"
    echo "  (it may just need more time — recheck in ~30s before assuming failure)"
    return 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-}" in
  status)            status ;;
  disk-full)         scenario_disk_full ;;
  pool-exhaustion)   scenario_pool_exhaustion ;;
  oom)               scenario_oom ;;
  kill-db)           scenario_kill_db ;;
  postgres-oom)      scenario_postgres_oom ;;
  network-partition) scenario_network_partition ;;
  cascade)           scenario_cascade scale ;;
  cascade-oom)       scenario_cascade oom ;;
  reset)             reset_all ;;
  *)
    echo "Usage: $0 {status|disk-full|pool-exhaustion|oom|kill-db|postgres-oom|network-partition|cascade|cascade-oom|reset}"
    echo ""
    echo "Scenarios:"
    echo "  status            — check pod/service/PVC status + backend health"
    echo "  disk-full         — fill postgres PVC → DB write errors → backend 503"
    echo "  pool-exhaustion   — exhaust DB connection pool → Prisma P2024 → 503"
    echo "  oom               — OOMKill backend pod → CrashLoopBackOff → 502"
    echo "  kill-db           — scale postgres to 0 → ECONNREFUSED → 503"
    echo "                      (clean absence — no restart count, no OOM event)"
    echo "  postgres-oom      — OOMKill postgres pod → real CrashLoopBackOff"
    echo "                      (restart count + OOMKilled events, distinct signature)"
    echo "  network-partition — NetworkPolicy blocks DB → connection timeout → 503"
    echo "  cascade           — ONE command: DB scale-to-zero → backend log errors →"
    echo "                      real frontend-Service traffic (401/404/500 mix)"
    echo "  cascade-oom       — same as cascade, but DB dies via OOM/CrashLoopBackOff"
    echo "                      instead of scale-to-zero"
    echo "  reset             — restore all services to normal (also undoes any"
    echo "                      OOM memory-limit patches, not just replica count)"
    ;;
esac
