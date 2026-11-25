import { Router } from 'express';
import { activeDbProvider, db } from '../db';

export const healthRouter = Router();

healthRouter.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'uet-phdhub',
    provider: activeDbProvider,
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/api/ready', async (_req, res) => {
  try {
    await db.execute('SELECT 1 as ok');
    res.json({
      ok: true,
      provider: activeDbProvider,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      error: 'Cơ sở dữ liệu tạm thời chưa sẵn sàng.',
      details: err?.message || String(err),
    });
  }
});
