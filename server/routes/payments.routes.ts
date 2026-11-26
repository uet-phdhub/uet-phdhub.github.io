import { Router } from 'express';
import type { FeeActivityType, PaymentItemRow } from '../../shared/types';
import { db } from '../db';
import { authenticateToken, requirePermission } from '../middlewares/auth';
import { recordAudit, recordSecretAccess } from '../services/audit';
import { exportPaymentBatchWorkbook, previewPaymentBatch } from '../services/payments';
import type { AuthedRequest } from '../types';
import { loadEnrichedScientists } from './scientists.routes';

export const paymentsRouter = Router();

/* ==================== FEE RATES (ĐƠN GIÁ THÙ LAO & THUẾ TNCN) ==================== */

paymentsRouter.get('/api/settings/fee-rates', authenticateToken, requirePermission('payment:manage'), async (_req, res) => {
  const rows = (await db.execute('SELECT * FROM fee_rates ORDER BY fiscal_year DESC, activity_type ASC, id ASC')).rows;
  res.json({ items: rows });
});

paymentsRouter.put('/api/settings/fee-rates', authenticateToken, requirePermission('payment:manage'), async (req: AuthedRequest, res) => {
  const { items, pit_tax_rate, pit_threshold } = req.body || {};
  if (Array.isArray(items)) {
    for (const r of items) {
      if (!r.id) continue;
      await db.execute({
        sql: `UPDATE fee_rates
              SET label = ?, unit_amount = ?, pit_tax_rate = ?, pit_threshold = ?, active = ?,
                  updated_at = datetime('now', '+7 hours')
              WHERE id = ?`,
        args: [
          String(r.label || '').trim(),
          Math.max(0, Number(r.unit_amount) || 0),
          pit_tax_rate !== undefined ? Number(pit_tax_rate) : Number(r.pit_tax_rate ?? 0.1),
          pit_threshold !== undefined ? Number(pit_threshold) : Number(r.pit_threshold ?? 2000000),
          r.active === 0 || r.active === false ? 0 : 1,
          Number(r.id),
        ],
      });
    }
  } else if (pit_tax_rate !== undefined || pit_threshold !== undefined) {
    await db.execute({
      sql: `UPDATE fee_rates SET pit_tax_rate = COALESCE(?, pit_tax_rate), pit_threshold = COALESCE(?, pit_threshold), updated_at = datetime('now', '+7 hours')`,
      args: [pit_tax_rate ?? null, pit_threshold ?? null],
    });
  }

  await recordAudit(req.user, 'update_fee_rates', 'fee_rates', 'batch', 'Cập nhật bảng đơn giá thù lao & quy tắc thuế TNCN');
  const updated = (await db.execute('SELECT * FROM fee_rates ORDER BY fiscal_year DESC, activity_type ASC, id ASC')).rows;
  res.json({ items: updated });
});

/* ==================== PAYMENT BATCHES (TỔNG HỢP & THANH TOÁN THÙ LAO) ==================== */

paymentsRouter.post('/api/payments/batches/preview', authenticateToken, requirePermission('payment:manage'), async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const result = await previewPaymentBatch({
    periodFrom: b.periodFrom,
    periodTo: b.periodTo,
    activities: Array.isArray(b.activities) ? (b.activities as FeeActivityType[]) : undefined,
    hideIrPhdIdentity: b.hideIrPhdIdentity !== false,
    fiscalYear: b.fiscalYear,
  });
  res.json(result);
});

paymentsRouter.get('/api/payments/batches', authenticateToken, requirePermission('payment:manage'), async (_req, res) => {
  const rows = (
    await db.execute(`
      SELECT pb.*,
             (SELECT COUNT(*) FROM payment_items pi WHERE pi.batch_id = pb.id) as item_count
      FROM payment_batches pb
      ORDER BY pb.id DESC
    `)
  ).rows;
  res.json({ items: rows });
});

paymentsRouter.get('/api/payments/batches/:id', authenticateToken, requirePermission('payment:manage'), async (req, res) => {
  const id = Number(req.params.id);
  const batch = (await db.execute({ sql: 'SELECT * FROM payment_batches WHERE id = ?', args: [id] })).rows[0];
  if (!batch) return res.status(404).json({ error: 'Không tìm thấy đợt thanh toán.' });

  const items = (
    await db.execute({
      sql: `SELECT pi.*, s.full_name as scientist_name, s.title_display, s.work_unit, s.is_internal,
                   s.cccd, s.tax_code, s.bank_account, s.bank_name
            FROM payment_items pi
            JOIN scientists s ON s.id = pi.scientist_id
            WHERE pi.batch_id = ?
            ORDER BY s.full_name ASC, pi.id ASC`,
      args: [id],
    })
  ).rows;
  res.json({ batch, items });
});

paymentsRouter.post('/api/payments/batches', authenticateToken, requirePermission('payment:manage'), async (req: AuthedRequest, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const rawItems: PaymentItemRow[] = Array.isArray(b.items) ? b.items : [];
  if (!title) return res.status(400).json({ error: 'Vui lòng nhập tiêu đề đợt thanh toán.' });
  if (rawItems.length === 0) return res.status(400).json({ error: 'Chưa có dòng thù lao nào để lập đợt thanh toán.' });

  // Double-check against already confirmed/paid source keys to guarantee no double payment
  const paidRes = await db.execute(`
    SELECT pi.source_type, pi.source_id
    FROM payment_items pi
    JOIN payment_batches pb ON pb.id = pi.batch_id
    WHERE pb.status IN ('confirmed', 'paid')
  `);
  const paidSet = new Set((paidRes.rows as any[]).map((r) => `${r.source_type}:${r.source_id}`));
  const dup = rawItems.find((it) => paidSet.has(`${it.source_type}:${it.source_id}`));
  if (dup) {
    return res.status(409).json({
      error: `Mục "${dup.description}" đã thuộc một đợt thanh toán đã chốt trước đó (chống chi trả trùng lặp).`,
    });
  }

  const batchCode = String(b.batch_code || `TT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`);
  const status = b.status === 'confirmed' ? 'confirmed' : 'draft';
  const totalGross = rawItems.reduce((s, i) => s + Number(i.gross_amount || 0), 0);
  const totalTax = rawItems.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const totalNet = rawItems.reduce((s, i) => s + Number(i.net_amount || 0), 0);

  const ins = await db.execute({
    sql: `INSERT INTO payment_batches (
            batch_code, title, period_from, period_to, hide_ir_phd_identity,
            status, voucher_no, total_gross, total_tax, total_net, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      batchCode,
      title,
      String(b.period_from || '').trim(),
      String(b.period_to || '').trim(),
      b.hide_ir_phd_identity === false || b.hide_ir_phd_identity === 0 ? 0 : 1,
      status,
      String(b.voucher_no || '').trim(),
      totalGross,
      totalTax,
      totalNet,
      req.user!.id,
    ],
  });
  const batchId = Number(ins.lastInsertRowid);

  for (const it of rawItems) {
    await db.execute({
      sql: `INSERT INTO payment_items (
              batch_id, scientist_id, source_type, source_id, role_code,
              phd_code, phd_name, description, quantity, unit_amount,
              gross_amount, tax_amount, net_amount, tax_exempt_declared
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        batchId,
        Number(it.scientist_id),
        String(it.source_type),
        String(it.source_id),
        String(it.role_code || ''),
        String(it.phd_code || ''),
        String(it.phd_name || ''),
        String(it.description || ''),
        Number(it.quantity || 1),
        Number(it.unit_amount || 0),
        Number(it.gross_amount || 0),
        Number(it.tax_amount || 0),
        Number(it.net_amount || 0),
        it.tax_exempt_declared ? 1 : 0,
      ],
    });
  }

  await recordAudit(req.user, 'create_payment_batch', 'payment_batches', batchId, `Lập đợt thanh toán ${batchCode}: ${rawItems.length} dòng, tổng thực nhận ${totalNet.toLocaleString('vi-VN')}đ`);
  const created = (await db.execute({ sql: 'SELECT * FROM payment_batches WHERE id = ?', args: [batchId] })).rows[0];
  res.status(201).json(created);
});

paymentsRouter.put('/api/payments/batches/:id', authenticateToken, requirePermission('payment:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM payment_batches WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy đợt thanh toán.' });

  const b = req.body || {};
  const nextStatus = ['draft', 'confirmed', 'paid'].includes(b.status) ? b.status : existing.status;

  // If moving from draft -> confirmed/paid, double-check duplicate payment lock
  if (existing.status === 'draft' && nextStatus !== 'draft') {
    const myItems = (await db.execute({ sql: 'SELECT source_type, source_id, description FROM payment_items WHERE batch_id = ?', args: [id] })).rows as any[];
    const paidOther = (
      await db.execute({
        sql: `SELECT pi.source_type, pi.source_id
              FROM payment_items pi
              JOIN payment_batches pb ON pb.id = pi.batch_id
              WHERE pb.status IN ('confirmed', 'paid') AND pb.id != ?`,
        args: [id],
      })
    ).rows as any[];
    const paidSet = new Set(paidOther.map((r) => `${r.source_type}:${r.source_id}`));
    const dup = myItems.find((it) => paidSet.has(`${it.source_type}:${it.source_id}`));
    if (dup) {
      return res.status(409).json({ error: `Không thể chốt vì "${dup.description}" đã thanh toán ở đợt khác.` });
    }
  }

  await db.execute({
    sql: `UPDATE payment_batches
          SET status = ?, voucher_no = ?, title = ?, revision = revision + 1, updated_at = datetime('now', '+7 hours')
          WHERE id = ?`,
    args: [nextStatus, String(b.voucher_no ?? existing.voucher_no).trim(), String(b.title ?? existing.title).trim(), id],
  });
  await recordAudit(req.user, 'update_payment_batch', 'payment_batches', id, `Cập nhật đợt thanh toán ${existing.batch_code} -> ${nextStatus}`);
  const updated = (await db.execute({ sql: 'SELECT * FROM payment_batches WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

paymentsRouter.delete('/api/payments/batches/:id', authenticateToken, requirePermission('payment:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM payment_batches WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy đợt thanh toán.' });
  if (existing.status !== 'draft') {
    return res.status(409).json({ error: 'Chỉ có thể xóa đợt thanh toán ở trạng thái Nháp (draft).' });
  }
  await db.execute({ sql: 'DELETE FROM payment_batches WHERE id = ?', args: [id] });
  await recordAudit(req.user, 'delete_payment_batch', 'payment_batches', id, `Xóa đợt thanh toán nháp ${existing.batch_code}`);
  res.json({ ok: true });
});

paymentsRouter.get('/api/payments/batches/:id/export', authenticateToken, requirePermission('payment:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const batch = (await db.execute({ sql: 'SELECT * FROM payment_batches WHERE id = ?', args: [id] })).rows[0] as any;
  if (!batch) return res.status(404).json({ error: 'Không tìm thấy đợt thanh toán.' });

  const [itemsRes, supervisors] = await Promise.all([
    db.execute({
      sql: `SELECT pi.*, s.full_name as scientist_name, s.title_display, s.work_unit, s.is_internal,
                   s.cccd, s.tax_code, s.bank_account, s.bank_name
            FROM payment_items pi
            JOIN scientists s ON s.id = pi.scientist_id
            WHERE pi.batch_id = ?
            ORDER BY s.full_name ASC, pi.id ASC`,
      args: [id],
    }),
    loadEnrichedScientists({ listType: 'supervisor' }, req.user!),
  ]);

  await recordSecretAccess(req.user, 'payment_export', batch.batch_code, `Xuất bảng kê thanh toán Excel (${itemsRes.rows.length} dòng)`, req);
  const buf = exportPaymentBatchWorkbook(batch, itemsRes.rows as unknown as PaymentItemRow[], supervisors);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="UET_BangKe_ThuLao_${batch.batch_code}.xlsx"`);
  res.send(buf);
});
