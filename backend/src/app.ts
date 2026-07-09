// Instana auto-instrumentation must be the very first import
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { (require('@instana/collector') as () => void)(); } catch (_) { /* agent not present in local dev */ }

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import cardRoutes from './routes/card.routes';
import transactionRoutes from './routes/transaction.routes';
import userRoutes from './routes/user.routes';
import chaosRoutes from './routes/chaos.routes';
import { errorHandler } from './middleware/errorHandler';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Enhanced health check — reports DB state so K8s readiness probe degrades correctly
app.get('/health', async (_req, res) => {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      service: 'DemoBanking API',
      db: 'connected',
      dbLatencyMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[HEALTH] DB probe failed:', err.message);
    res.status(503).json({
      status: 'degraded',
      service: 'DemoBanking API',
      db: 'unavailable',
      dbError: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
// Chaos engineering endpoints — exposes intentional failure triggers for Instana demo
app.use('/api/chaos', chaosRoutes);

app.use(errorHandler);

export default app;
