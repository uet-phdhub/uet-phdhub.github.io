import cors from 'cors';
import express from 'express';
import { join } from 'path';
import { createCorsOptions, getAllowedOrigins, isCorsAllowed } from './middlewares/cors';
import { authRouter } from './routes/auth.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { documentsRouter } from './routes/documents.routes';
import { excelRouter } from './routes/excel.routes';
import { healthRouter } from './routes/health.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { phdRouter } from './routes/phd.routes';
import { scientistsRouter } from './routes/scientists.routes';
import { settingsRouter } from './routes/settings.routes';

export async function createApp(options: { vite?: boolean } = {}) {
  const app = express();
  app.set('trust proxy', 1);

  const allowedOrigins = getAllowedOrigins();
  const corsOptions = createCorsOptions();
  app.use(cors(corsOptions));
  app.options('/api/*', cors(corsOptions));

  app.use((req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (req.path?.startsWith('/api/') && !isCorsAllowed(origin, allowedOrigins)) {
      return res.status(403).json({ error: 'Origin không được phép truy cập API.' });
    }
    next();
  });

  app.use(express.json({ limit: '5mb' }));

  app.use(healthRouter);
  app.use(authRouter);
  app.use(dashboardRouter);
  app.use(phdRouter);
  app.use(scientistsRouter);
  app.use(documentsRouter);
  app.use(excelRouter);
  app.use(notificationsRouter);
  app.use(settingsRouter);

  app.use((err: any, req: any, res: any, next: any) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Tệp tải lên vượt quá dung lượng cho phép (tối đa 15 MB).' });
    }
    if (err?.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'Origin không được phép truy cập API.' });
    }
    if (req.path?.startsWith('/api/')) {
      console.error('[api error]', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Lỗi hệ thống nội bộ.' });
    }
    next(err);
  });

  const attachVite = options.vite ?? process.env.NODE_ENV !== 'production';
  if (attachVite && process.env.NODE_ENV !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }

  return app;
}
