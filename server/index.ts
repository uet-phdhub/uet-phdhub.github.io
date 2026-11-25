import { createApp } from './app';
import { initDb } from './db/initDb';
import { seedDemoDataIfEmpty } from './db/seedData';
import { getActiveEmailProvider, sendQueuedNotificationBatch } from './services/email';

export async function startServer() {
  await initDb();
  const shouldSeed = process.env.SEED_DEMO ? process.env.SEED_DEMO === 'true' : process.env.NODE_ENV !== 'production';
  if (shouldSeed) {
    await seedDemoDataIfEmpty();
  }
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[UET PhDHub] Server running on http://localhost:${PORT}`);
  });

  // Auto-drain email queue every 30 minutes when email provider is configured
  const drainQueue = async () => {
    if (getActiveEmailProvider() === 'none') return;
    try {
      const res = await sendQueuedNotificationBatch({ ignoreBatchSize: false });
      if (res.sent > 0 || res.failed > 0) {
        console.log(`[UET PhDHub EmailQueue] sent=${res.sent}, failed=${res.failed}, remaining=${res.remaining_today}`);
      }
    } catch (err: any) {
      console.error('[UET PhDHub EmailQueue] error:', err?.message || err);
    }
  };
  setTimeout(drainQueue, 15_000);
  setInterval(drainQueue, 30 * 60 * 1000);
}

startServer().catch((err) => {
  console.error('[UET PhDHub] Failed to start server:', err);
  process.exit(1);
});
