import { db } from '../db';

export function parseEmailAddress(value: string | undefined) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    return { email: match[2].trim(), name: name || undefined };
  }
  return { email: raw };
}

export function getActiveEmailProvider(): string {
  return String(
    process.env.EMAIL_PROVIDER ||
      (process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : 'none')
  )
    .trim()
    .toLowerCase();
}

export function emailDailySendCap(): number {
  const n = Number(process.env.EMAIL_DAILY_SEND_CAP || 250);
  if (!Number.isFinite(n) || n < 1) return 250;
  return Math.min(Math.floor(n), 1000);
}

export function emailBatchSize(): number {
  const n = Number(process.env.EMAIL_BATCH_SIZE || 25);
  if (!Number.isFinite(n) || n < 1) return 25;
  return Math.min(Math.floor(n), 100);
}

export async function emailSentTodayCount(): Promise<number> {
  const row = (
    await db.execute(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE status = 'sent'
        AND date(sent_at) = date('now', '+7 hours')
    `)
  ).rows[0] as any;
  return Number(row?.count || 0);
}

export async function createNotification(input: {
  recipient_user_id?: number | null;
  recipient_email: string;
  phd_student_id?: number | null;
  type?: string;
  subject: string;
  body: string;
  delivery_mode?: 'website_and_email' | 'website_only';
  dedupe_key?: string | null;
  created_by_user_id?: number | null;
  sendNow?: boolean;
}) {
  const email = String(input.recipient_email || '').trim().toLowerCase();
  if (!email) return null;

  if (input.dedupe_key) {
    const existing = (
      await db.execute({
        sql: 'SELECT id FROM notifications WHERE dedupe_key = ? LIMIT 1',
        args: [input.dedupe_key],
      })
    ).rows[0];
    if (existing) return null;
  }

  let recipientUserId = input.recipient_user_id ?? null;
  if (!recipientUserId) {
    const userRow = (
      await db.execute({
        sql: 'SELECT id FROM users WHERE lower(email) = ? LIMIT 1',
        args: [email],
      })
    ).rows[0] as any;
    if (userRow?.id) recipientUserId = Number(userRow.id);
  }

  const mode = input.delivery_mode || 'website_and_email';
  const initialStatus = mode === 'website_only' ? 'website_only' : 'queued';

  const result = await db.execute({
    sql: `INSERT INTO notifications (
            recipient_user_id, recipient_email, phd_student_id, type, subject, body,
            delivery_mode, status, dedupe_key, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      recipientUserId,
      email,
      input.phd_student_id ?? null,
      input.type || 'general',
      input.subject,
      input.body,
      mode,
      initialStatus,
      input.dedupe_key ?? null,
      input.created_by_user_id ?? null,
    ],
  });

  const id = Number(result.lastInsertRowid);
  const immediate = input.sendNow ?? process.env.EMAIL_SEND_IMMEDIATE === 'true';
  if (mode === 'website_and_email' && immediate && getActiveEmailProvider() !== 'none') {
    await sendNotificationEmail(id, {
      recipient_email: email,
      subject: input.subject,
      body: input.body,
    });
  }
  return id;
}

export async function sendNotificationEmail(
  notificationId: number,
  data: { recipient_email: string; subject: string; body: string }
): Promise<'sent' | 'queued' | 'failed'> {
  const provider = getActiveEmailProvider();
  const from = process.env.EMAIL_FROM || process.env.NOTIFICATION_EMAIL_FROM;
  if (!from || provider === 'none' || !notificationId) return 'queued';
  if ((await emailSentTodayCount()) >= emailDailySendCap()) return 'queued';

  try {
    let response: Response;
    const plainText = data.body.replace(/<[^>]+>/g, '');

    if (provider === 'brevo') {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) return 'queued';
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: parseEmailAddress(from),
          to: [parseEmailAddress(data.recipient_email)],
          subject: data.subject,
          textContent: plainText,
        }),
      });
    } else if (provider === 'resend') {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) return 'queued';
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [data.recipient_email],
          subject: data.subject,
          text: plainText,
        }),
      });
    } else {
      return 'queued';
    }

    const text = await response.text();
    if (response.status === 429) {
      await db.execute({
        sql: `UPDATE notifications SET error = ?, provider = ?, last_attempt_at = datetime('now', '+7 hours') WHERE id = ?`,
        args: ['Vượt tốc độ gửi của provider; giữ trong hàng đợi.', provider, notificationId],
      });
      return 'queued';
    }
    if (!response.ok) throw new Error(text.slice(0, 1000));

    let msgId: string | null = null;
    try {
      const parsed = JSON.parse(text);
      msgId = parsed.messageId || parsed.id || null;
    } catch {}

    await db.execute({
      sql: `UPDATE notifications
            SET status = 'sent', sent_at = datetime('now', '+7 hours'), error = NULL,
                provider = ?, provider_message_id = ?,
                attempt_count = COALESCE(attempt_count, 0) + 1,
                last_attempt_at = datetime('now', '+7 hours')
            WHERE id = ?`,
      args: [provider, msgId, notificationId],
    });
    return 'sent';
  } catch (err: any) {
    await db.execute({
      sql: `UPDATE notifications
            SET status = 'failed', error = ?, provider = ?,
                attempt_count = COALESCE(attempt_count, 0) + 1,
                last_attempt_at = datetime('now', '+7 hours')
            WHERE id = ?`,
      args: [String(err?.message || err).slice(0, 1000), provider, notificationId],
    });
    return 'failed';
  }
}

export async function sendQueuedNotificationBatch(options: { requestedLimit?: number; ignoreBatchSize?: boolean } = {}) {
  const provider = getActiveEmailProvider();
  const sentToday = await emailSentTodayCount();
  const remainingToday = Math.max(0, emailDailySendCap() - sentToday);
  const batchLimit = options.ignoreBatchSize ? remainingToday : emailBatchSize();
  const limit = Math.max(
    0,
    Math.min(options.requestedLimit ?? batchLimit, batchLimit, remainingToday)
  );

  if (provider === 'none') {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      remaining_today: remainingToday,
      provider,
      message: 'Chế độ EMAIL_PROVIDER=none (chỉ lưu thông báo web, chưa cấu hình gửi email thật).',
    };
  }
  if (limit === 0) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      remaining_today: remainingToday,
      provider,
      message: remainingToday === 0 ? 'Đã đạt giới hạn gửi email trong ngày.' : 'Không có email cần gửi.',
    };
  }

  const rows = (
    await db.execute({
      sql: `SELECT id, recipient_email, subject, body
            FROM notifications
            WHERE status = 'queued'
            ORDER BY created_at ASC, id ASC
            LIMIT ?`,
      args: [limit],
    })
  ).rows as any[];

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await sendNotificationEmail(Number(row.id), {
      recipient_email: row.recipient_email,
      subject: row.subject,
      body: row.body,
    });
    if (result === 'sent') sent++;
    else if (result === 'failed') failed++;
    else break;
  }

  return {
    sent,
    failed,
    skipped: Math.max(0, rows.length - sent - failed),
    remaining_today: Math.max(0, remainingToday - sent),
    provider,
  };
}
