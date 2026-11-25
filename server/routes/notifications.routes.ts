import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requireRoles } from '../middlewares/auth';
import { recordAudit } from '../services/audit';
import {
  createNotification,
  emailDailySendCap,
  emailSentTodayCount,
  getActiveEmailProvider,
  sendQueuedNotificationBatch,
} from '../services/email';
import { scanAndQueueDeadlineReminders } from '../services/reminders';
import type { AuthedRequest } from '../types';

export const notificationsRouter = Router();

notificationsRouter.get('/api/notifications/my', authenticateToken, async (req: AuthedRequest, res) => {
  const email = req.user!.email.toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const rows = (
    await db.execute({
      sql: `SELECT id, type, subject, body, delivery_mode, status, is_read, phd_student_id, created_at
            FROM notifications
            WHERE lower(recipient_email) = ?
            ORDER BY id DESC
            LIMIT ?`,
      args: [email, limit],
    })
  ).rows;
  const unreadRow = (
    await db.execute({
      sql: 'SELECT COUNT(*) as c FROM notifications WHERE lower(recipient_email) = ? AND is_read = 0',
      args: [email],
    })
  ).rows[0] as any;
  res.json({ items: rows, unreadCount: Number(unreadRow?.c || 0) });
});

notificationsRouter.post('/api/notifications/:id/read', authenticateToken, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  await db.execute({
    sql: 'UPDATE notifications SET is_read = 1 WHERE id = ? AND lower(recipient_email) = ?',
    args: [id, req.user!.email.toLowerCase()],
  });
  res.json({ ok: true });
});

notificationsRouter.post('/api/notifications/read-all', authenticateToken, async (req: AuthedRequest, res) => {
  await db.execute({
    sql: 'UPDATE notifications SET is_read = 1 WHERE lower(recipient_email) = ? AND is_read = 0',
    args: [req.user!.email.toLowerCase()],
  });
  res.json({ ok: true });
});

notificationsRouter.get('/api/notifications/admin', authenticateToken, requireRoles('admin', 'staff'), async (_req: AuthedRequest, res) => {
  const [sentToday, countsRes, recentRes] = await Promise.all([
    emailSentTodayCount(),
    db.execute(`
      SELECT status, COUNT(*) as count
      FROM notifications
      GROUP BY status
    `),
    db.execute(`
      SELECT id, recipient_email, type, subject, body, delivery_mode, status, provider, error, sent_at, created_at
      FROM notifications
      ORDER BY id DESC
      LIMIT 100
    `),
  ]);

  const byStatus: Record<string, number> = {};
  for (const r of countsRes.rows as any[]) {
    byStatus[String(r.status)] = Number(r.count || 0);
  }
  const dailyCap = emailDailySendCap();
  res.json({
    stats: {
      provider: getActiveEmailProvider(),
      sentToday,
      dailyCap,
      remainingToday: Math.max(0, dailyCap - sentToday),
      queued: byStatus.queued || 0,
      sent: byStatus.sent || 0,
      failed: byStatus.failed || 0,
      websiteOnly: byStatus.website_only || 0,
    },
    items: recentRes.rows,
  });
});

notificationsRouter.post('/api/notifications/send', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const { targetGroup = 'custom', emails = [], subject, body, delivery_mode = 'website_and_email' } = req.body || {};
  if (!subject || !body) {
    return res.status(400).json({ error: 'Vui lòng nhập tiêu đề và nội dung thông báo.' });
  }

  const recipientSet = new Set<string>();
  if (targetGroup === 'all_active_phds') {
    const rows = (await db.execute("SELECT email FROM phd_students WHERE is_completed = 0 AND study_status IN ('studying','extended','ready_defense') AND email IS NOT NULL AND email != ''")).rows as any[];
    rows.forEach((r) => recipientSet.add(String(r.email).toLowerCase()));
  } else if (targetGroup === 'all_supervisors') {
    const rows = (await db.execute("SELECT email FROM scientists WHERE is_supervisor = 1 AND email IS NOT NULL AND email != ''")).rows as any[];
    rows.forEach((r) => recipientSet.add(String(r.email).toLowerCase()));
  } else if (targetGroup === 'all_staff') {
    const rows = (await db.execute("SELECT email FROM users WHERE role IN ('admin','staff') AND active = 1")).rows as any[];
    rows.forEach((r) => recipientSet.add(String(r.email).toLowerCase()));
  } else if (Array.isArray(emails)) {
    emails.forEach((e) => {
      const cleaned = String(e || '').trim().toLowerCase();
      if (cleaned.includes('@')) recipientSet.add(cleaned);
    });
  }

  if (recipientSet.size === 0) {
    return res.status(400).json({ error: 'Không có địa chỉ email người nhận hợp lệ.' });
  }

  let created = 0;
  for (const email of recipientSet) {
    const id = await createNotification({
      recipient_email: email,
      type: 'manual_announcement',
      subject: String(subject).trim(),
      body: String(body).trim(),
      delivery_mode: delivery_mode === 'website_only' ? 'website_only' : 'website_and_email',
      created_by_user_id: req.user!.id,
    });
    if (id) created++;
  }

  await recordAudit(req.user, 'send_notification', 'notifications', targetGroup, `Tạo ${created} thông báo "${subject}" (${delivery_mode})`);
  res.json({ created, delivery_mode });
});

notificationsRouter.post('/api/notifications/scan-deadlines', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const result = await scanAndQueueDeadlineReminders(req.user!.id);
  await recordAudit(req.user, 'scan_deadlines', 'notifications', 'manual', `Quét nhắc hạn NCS: tạo ${result.notificationsCreated} thông báo`);
  res.json(result);
});

notificationsRouter.post('/api/notifications/process-queue', authenticateToken, requireRoles('admin', 'staff'), async (req: AuthedRequest, res) => {
  const result = await sendQueuedNotificationBatch({ ignoreBatchSize: false });
  res.json(result);
});

// Cron endpoints for GitHub Actions (07:05 Vietnam daily)
function verifyCronSecret(req: any, res: any): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'];
  if (!expected || provided !== expected) {
    res.status(403).json({ error: 'Sai hoặc thiếu X-Cron-Secret.' });
    return false;
  }
  return true;
}

notificationsRouter.post('/api/cron/scan-deadlines', async (req, res) => {
  if (!verifyCronSecret(req, res)) return;
  const result = await scanAndQueueDeadlineReminders(null);
  res.json(result);
});

notificationsRouter.post('/api/cron/process-email-queue', async (req, res) => {
  if (!verifyCronSecret(req, res)) return;
  const scanResult = await scanAndQueueDeadlineReminders(null);
  const queueResult = await sendQueuedNotificationBatch({ ignoreBatchSize: true });
  res.json({ scanResult, queueResult });
});
