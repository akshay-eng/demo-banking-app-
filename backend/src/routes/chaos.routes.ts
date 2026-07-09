/**
 * Chaos engineering endpoints for Instana demo.
 * These endpoints intentionally trigger failure conditions so we can observe
 * them in Instana's distributed tracing, error analytics, and K8s sensor.
 *
 * Available at /api/chaos/* (no auth required for demo convenience)
 */
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// ── Scenario 1: DB Disk Fill ──────────────────────────────────────────────────
// Writes large blobs to Postgres until the PVC runs out of space.
// Triggers:
//   - PostgreSQL: "could not write to file ... No space left on device" (SQLSTATE 58P01)
//   - Prisma: PrismaClientKnownRequestError with code P2002 / raw DB error
//   - HTTP: 503 on all subsequent write endpoints
router.post('/fill-disk', async (req: Request, res: Response) => {
  const rows = parseInt(String(req.body?.rows ?? 5000));
  console.warn(`[CHAOS:fill-disk] Starting — will write ${rows} rows of ~8KB each`);
  res.json({
    scenario: 'disk-fill',
    status: 'started',
    rows,
    message: `Writing ${rows} × 8KB rows to exhaust DB storage. Watch /health degrade.`,
  });

  const chunk = 'BANKDEMO_CHAOS_'.repeat(533); // ~8 KB
  let written = 0;

  for (let i = 0; i < rows; i++) {
    try {
      // Write into the Transaction table using a clearly marked type/description
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Transaction" (id, amount, currency, type, description, status, "createdAt")
         VALUES (gen_random_uuid()::text, 0.01, 'USD', 'CHAOS_FILL', $1, 'CHAOS', NOW())`,
        chunk,
      );
      written++;
      if (written % 500 === 0) {
        console.warn(`[CHAOS:fill-disk] ${written} rows written`);
      }
    } catch (err: any) {
      console.error(
        `[CHAOS:fill-disk] FAILED at row ${written} — ${err.message}`,
        { code: err.code, meta: err.meta },
      );
      break;
    }
  }
  console.warn(`[CHAOS:fill-disk] Finished. Wrote ${written} rows before failure.`);
});

// ── Scenario 2a: Connection Pool Exhaustion ───────────────────────────────────
// Acquires many long-running DB connections simultaneously.
// Triggers:
//   - Prisma: "Timed out fetching a new connection from the pool" (P2024)
//   - HTTP 503 on any endpoint that needs a DB connection
router.post('/exhaust-pool', async (req: Request, res: Response) => {
  const seconds = Math.min(parseInt(String(req.body?.seconds ?? 30)), 60);
  console.warn(`[CHAOS:exhaust-pool] Holding ${seconds} slow queries for ${seconds}s`);
  res.json({
    scenario: 'pool-exhaustion',
    status: 'started',
    seconds,
    message: `Running 15 concurrent pg_sleep(${seconds}) queries. New DB requests will timeout.`,
  });

  // Fire-and-forget: 15 concurrent long queries to hold pool connections
  const queries = Array.from({ length: 15 }, (_, i) =>
    prisma.$executeRawUnsafe(`SELECT pg_sleep(${seconds}) /* chaos-pool-hold-${i} */`)
      .catch((e: Error) => console.error(`[CHAOS:exhaust-pool] query ${i} error: ${e.message}`)),
  );
  Promise.all(queries).catch(() => {});
});

// ── Scenario 2b: Transfer stress (used by load-spike-job) ────────────────────
// Fires a DB-heavy transfer operation designed to queue behind pool waits.
router.post('/transfer-stress', async (req: Request, res: Response) => {
  try {
    // Attempt a heavy aggregation query + write to stress the pool
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Transaction"
    `;
    const count = Number(result[0]?.count ?? 0);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Transaction" (id, amount, currency, type, description, status, "createdAt")
       VALUES (gen_random_uuid()::text, 1.00, 'USD', 'CHAOS_STRESS', $1, 'STRESS', NOW())`,
      `stress-${Date.now()}`,
    );

    res.json({ status: 'ok', totalTransactions: count });
  } catch (err: any) {
    console.error(`[CHAOS:transfer-stress] DB error: ${err.message}`, { code: err.code });
    res.status(503).json({
      error: 'Database pool or write error',
      detail: err.message,
      code: err.code,
    });
  }
});

// ── Scenario 3: OOM Kill ──────────────────────────────────────────────────────
// Allocates 50MB Node.js Buffers on each tick until K8s OOMKills the pod.
// K8s will restart → if memory limit is < baseline usage → CrashLoopBackOff.
// Triggers:
//   - Pod: exit code 137 (OOMKilled)
//   - K8s event: "OOMKilling" → CrashLoopBackOff
//   - Frontend: 502 Bad Gateway (nginx can't reach backend)
router.post('/oom', (_req: Request, res: Response) => {
  console.warn('[CHAOS:oom] Allocating memory until OOMKilled by K8s...');
  res.json({
    scenario: 'oom-kill',
    status: 'started',
    message: 'Allocating 50MB/tick until OOMKilled. Pod will restart (CrashLoopBackOff if memory limit is too low).',
  });

  setTimeout(() => {
    const allocated: Buffer[] = [];
    const interval = setInterval(() => {
      try {
        allocated.push(Buffer.alloc(50 * 1024 * 1024)); // 50 MB per tick
        console.warn(`[CHAOS:oom] Allocated ~${allocated.length * 50}MB`);
      } catch (e) {
        clearInterval(interval);
        console.error('[CHAOS:oom] Allocation error — forcing exit:', (e as Error).message);
        process.exit(137);
      }
    }, 400);
  }, 300);
});

// ── Scenario 4a: Slow Query (latency spike) ───────────────────────────────────
// Runs pg_sleep to simulate a slow/blocked DB query.
// Observable in Instana as a latency spike on backend DB calls.
router.post('/slow-query', async (req: Request, res: Response) => {
  const seconds = Math.min(parseInt(String(req.body?.seconds ?? 10)), 60);
  console.warn(`[CHAOS:slow-query] Running pg_sleep(${seconds})`);
  const t0 = Date.now();
  try {
    await prisma.$executeRawUnsafe(`SELECT pg_sleep(${seconds}) /* chaos-slow-query */`);
    const elapsed = Date.now() - t0;
    console.warn(`[CHAOS:slow-query] Done in ${elapsed}ms`);
    res.json({ scenario: 'slow-query', status: 'done', elapsedMs: elapsed });
  } catch (err: any) {
    console.error(`[CHAOS:slow-query] Error: ${err.message}`);
    res.status(500).json({ error: err.message, code: err.code });
  }
});

// ── Scenario 4b: Process crash (CrashLoopBackOff) ────────────────────────────
// Immediately exits the Node.js process. K8s will restart it. Repeated calls
// (e.g. from a liveness probe trigger) will put it into CrashLoopBackOff.
router.post('/crash', (_req: Request, res: Response) => {
  console.error('[CHAOS:crash] Intentional crash — process.exit(1) in 400ms');
  res.json({
    scenario: 'crash',
    status: 'crashing',
    message: 'Process exits in 400ms. K8s will restart the pod.',
  });
  setTimeout(() => process.exit(1), 400);
});

// ── Status endpoint ───────────────────────────────────────────────────────────
// Shows current DB connectivity + memory usage so you can watch degradation.
router.get('/status', async (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  let dbOk = false;
  let dbLatencyMs = -1;
  let dbError = '';

  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbLatencyMs = Date.now() - t0;
  } catch (e: any) {
    dbError = e.message;
    dbLatencyMs = Date.now() - t0;
  }

  res.json({
    db: { connected: dbOk, latencyMs: dbLatencyMs, error: dbError || undefined },
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    uptime: Math.round(process.uptime()),
    pid: process.pid,
  });
});

export default router;
