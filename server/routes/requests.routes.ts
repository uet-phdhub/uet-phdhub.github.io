import { Router } from 'express';
import type { ChangeRequestType } from '../../shared/types';
import { db } from '../db';
import { authenticateToken, isAdminOrStaff, requirePermission } from '../middlewares/auth';
import { recordAudit } from '../services/audit';
import { createNotification } from '../services/email';
import { renderEmailTemplate } from '../services/settings';
import type { AuthedRequest } from '../types';

export const requestsRouter = Router();

const REQUEST_TYPE_LABELS: Record<ChangeRequestType, string> = {
  extension: 'Gia hạn thời gian đào tạo',
  deferral: 'Bảo lưu / Tạm dừng đào tạo',
  topic_change: 'Điều chỉnh tên đề tài LATS',
  supervisor_change: 'Thay đổi Cán bộ hướng dẫn',
  special_quota: 'Đề nghị tăng định mức hướng dẫn (Quota)',
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  submitted: 'Chờ xử lý',
  supervisor_approved: 'CBHD đã xác nhận — Chờ CTSV duyệt',
  needs_revision: 'Yêu cầu bổ sung',
  approved: 'Đã phê duyệt',
  rejected: 'Từ chối',
};

function safeJson<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ==================== ELECTRONIC APPROVAL WORKFLOWS ==================== */

requestsRouter.get('/api/requests', authenticateToken, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
  const typeFilter = typeof req.query.requestType === 'string' ? req.query.requestType : 'all';

  const where: string[] = [];
  const args: any[] = [];

  if (!isAdminOrStaff(user)) {
    if (user.role === 'phd_student' && user.phd_student_id) {
      where.push('r.phd_student_id = ?');
      args.push(user.phd_student_id);
    } else if (user.scientist_id) {
      where.push(
        '(r.scientist_id = ? OR r.created_by_user_id = ? OR EXISTS (SELECT 1 FROM phd_supervisions ps WHERE ps.phd_student_id = r.phd_student_id AND ps.scientist_id = ?))'
      );
      args.push(user.scientist_id, user.id, user.scientist_id);
    } else {
      where.push('r.created_by_user_id = ?');
      args.push(user.id);
    }
  }

  if (statusFilter !== 'all') {
    where.push('r.status = ?');
    args.push(statusFilter);
  }
  if (typeFilter !== 'all') {
    where.push('r.request_type = ?');
    args.push(typeFilter);
  }

  const rows = (
    await db.execute({
      sql: `SELECT r.*,
                   p.phd_code, p.full_name as phd_name, p.standard_deadline, p.max_deadline,
                   s.full_name as scientist_name, s.title_display as scientist_title,
                   u.name as created_by_name, u.email as created_by_email
            FROM change_requests r
            LEFT JOIN phd_students p ON p.id = r.phd_student_id
            LEFT JOIN scientists s ON s.id = r.scientist_id
            LEFT JOIN users u ON u.id = r.created_by_user_id
            ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            ORDER BY CASE r.status WHEN 'supervisor_approved' THEN 1 WHEN 'submitted' THEN 2 WHEN 'needs_revision' THEN 3 ELSE 4 END, r.id DESC`,
      args,
    })
  ).rows as any[];

  const items = rows.map((r) => ({
    ...r,
    payload: safeJson<Record<string, any>>(r.payload_json, {}),
    typeLabel: REQUEST_TYPE_LABELS[r.request_type as ChangeRequestType] || r.request_type,
    statusLabel: REQUEST_STATUS_LABELS[r.status] || r.status,
  }));

  const pendingCount = items.filter((it) => it.status === 'submitted' || it.status === 'supervisor_approved').length;
  res.json({ items, pendingCount });
});

requestsRouter.post('/api/requests', authenticateToken, requirePermission('request:create'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const requestType = String(b.request_type || '') as ChangeRequestType;
  if (!REQUEST_TYPE_LABELS[requestType]) {
    return res.status(400).json({ error: 'Loại yêu cầu không hợp lệ.' });
  }
  const reason = String(b.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ error: 'Vui lòng nhập lý do đề xuất.' });
  }

  let phdStudentId: number | null = b.phd_student_id ? Number(b.phd_student_id) : null;
  let scientistId: number | null = b.scientist_id ? Number(b.scientist_id) : null;

  if (requestType === 'special_quota') {
    if (!isAdminOrStaff(user)) {
      if (!user.scientist_id) return res.status(403).json({ error: 'Tài khoản chưa liên kết hồ sơ Cán bộ hướng dẫn.' });
      scientistId = user.scientist_id;
    } else if (!scientistId) {
      return res.status(400).json({ error: 'Vui lòng chọn Cán bộ hướng dẫn cần đề nghị tăng định mức.' });
    }
    phdStudentId = null;
  } else {
    if (user.role === 'phd_student') {
      phdStudentId = user.phd_student_id ?? null;
    } else if (!isAdminOrStaff(user) && user.scientist_id) {
      if (!phdStudentId) return res.status(400).json({ error: 'Vui lòng chọn Nghiên cứu sinh.' });
      const sup = (
        await db.execute({
          sql: 'SELECT 1 FROM phd_supervisions WHERE phd_student_id = ? AND scientist_id = ? LIMIT 1',
          args: [phdStudentId, user.scientist_id],
        })
      ).rows[0];
      if (!sup) return res.status(403).json({ error: 'Bạn chỉ có thể tạo đề xuất cho NCS đang phụ trách hướng dẫn.' });
    }
    if (!phdStudentId) {
      return res.status(400).json({ error: 'Vui lòng chọn hồ sơ Nghiên cứu sinh.' });
    }
  }

  // If submitted directly by supervisor or admin, skip supervisor confirmation step
  const initialStatus =
    requestType === 'special_quota' || isAdminOrStaff(user) || user.role === 'supervisor'
      ? 'supervisor_approved'
      : 'submitted';

  const payload = typeof b.payload === 'object' && b.payload ? b.payload : {};
  const ins = await db.execute({
    sql: `INSERT INTO change_requests (
            request_type, phd_student_id, scientist_id, created_by_user_id,
            payload_json, reason, evidence_url, status,
            supervisor_approved_by, supervisor_approved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      requestType,
      phdStudentId,
      scientistId,
      user.id,
      JSON.stringify(payload),
      reason,
      String(b.evidence_url || '').trim(),
      initialStatus,
      initialStatus === 'supervisor_approved' && user.scientist_id ? user.scientist_id : null,
      initialStatus === 'supervisor_approved' ? new Date().toISOString() : null,
    ],
  });

  const reqId = Number(ins.lastInsertRowid);
  await recordAudit(user, 'create_request', 'change_requests', reqId, `Tạo yêu cầu ${REQUEST_TYPE_LABELS[requestType]}`, null, {
    requestType,
    phdStudentId,
    scientistId,
    payload,
  });

  // Notify relevant reviewer (supervisor if PhD submitted, else CTSV admins)
  if (initialStatus === 'submitted' && phdStudentId) {
    const sups = (
      await db.execute({
        sql: `SELECT s.email FROM phd_supervisions ps JOIN scientists s ON s.id = ps.scientist_id
              WHERE ps.phd_student_id = ? AND s.email IS NOT NULL AND s.email != ''`,
        args: [phdStudentId],
      })
    ).rows as any[];
    for (const s of sups) {
      await createNotification({
        recipient_email: s.email,
        phd_student_id: phdStudentId,
        type: 'request_pending',
        subject: `[UET PhDHub] Yêu cầu mới cần xác nhận: ${REQUEST_TYPE_LABELS[requestType]}`,
        body: `${user.name} vừa gửi yêu cầu "${REQUEST_TYPE_LABELS[requestType]}". Lý do: ${reason}`,
        delivery_mode: 'website_and_email',
        created_by_user_id: user.id,
      });
    }
  } else {
    const admins = (await db.execute("SELECT email FROM users WHERE role IN ('admin','staff') AND active = 1")).rows as any[];
    for (const a of admins) {
      if (String(a.email).toLowerCase() === user.email.toLowerCase()) continue;
      await createNotification({
        recipient_email: a.email,
        phd_student_id: phdStudentId,
        type: 'request_pending',
        subject: `[UET PhDHub] Yêu cầu mới chờ phê duyệt: ${REQUEST_TYPE_LABELS[requestType]}`,
        body: `${user.name} vừa gửi yêu cầu "${REQUEST_TYPE_LABELS[requestType]}". Lý do: ${reason}`,
        delivery_mode: 'website_and_email',
        created_by_user_id: user.id,
      });
    }
  }

  const created = (await db.execute({ sql: 'SELECT * FROM change_requests WHERE id = ?', args: [reqId] })).rows[0] as any;
  res.status(201).json({ ...created, payload });
});

requestsRouter.put(
  '/api/requests/:id/supervisor-review',
  authenticateToken,
  requirePermission('request:supervisor_review'),
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.user!;
    const existing = (await db.execute({ sql: 'SELECT * FROM change_requests WHERE id = ?', args: [id] })).rows[0] as any;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
    if (existing.status === 'approved' || existing.status === 'rejected') {
      return res.status(409).json({ error: 'Yêu cầu đã được chốt kết quả, không thể thay đổi.' });
    }

    if (!isAdminOrStaff(user)) {
      if (!existing.phd_student_id || !user.scientist_id) {
        return res.status(403).json({ error: 'Không có quyền xác nhận yêu cầu này.' });
      }
      const sup = (
        await db.execute({
          sql: 'SELECT 1 FROM phd_supervisions WHERE phd_student_id = ? AND scientist_id = ? LIMIT 1',
          args: [existing.phd_student_id, user.scientist_id],
        })
      ).rows[0];
      if (!sup) return res.status(403).json({ error: 'Bạn không phải CBHD của nghiên cứu sinh này.' });
    }

    const action = req.body?.action === 'needs_revision' ? 'needs_revision' : 'supervisor_approved';
    const comment = String(req.body?.comment || '').trim();

    await db.execute({
      sql: `UPDATE change_requests
            SET status = ?, supervisor_comment = ?, supervisor_approved_by = ?,
                supervisor_approved_at = datetime('now', '+7 hours'),
                updated_at = datetime('now', '+7 hours')
            WHERE id = ?`,
      args: [action, comment, user.scientist_id ?? user.id, id],
    });

    await recordAudit(user, 'supervisor_review_request', 'change_requests', id, `CBHD ${action} yêu cầu #${id}`);

    // Notify admins when ready for final approval
    if (action === 'supervisor_approved') {
      const admins = (await db.execute("SELECT email FROM users WHERE role IN ('admin','staff') AND active = 1")).rows as any[];
      for (const a of admins) {
        await createNotification({
          recipient_email: a.email,
          phd_student_id: existing.phd_student_id ?? null,
          type: 'request_ready_approval',
          subject: `[UET PhDHub] CBHD đã xác nhận yêu cầu #${id} — Chờ Phòng CTSV phê duyệt`,
          body: `${user.name} đã xác nhận yêu cầu "${REQUEST_TYPE_LABELS[existing.request_type as ChangeRequestType] || existing.request_type}". ${comment}`,
          delivery_mode: 'website_and_email',
          created_by_user_id: user.id,
        });
      }
    }

    const updated = (await db.execute({ sql: 'SELECT * FROM change_requests WHERE id = ?', args: [id] })).rows[0];
    res.json(updated);
  }
);

requestsRouter.put(
  '/api/requests/:id/decision',
  authenticateToken,
  requirePermission('request:approve'),
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.user!;
    const existing = (await db.execute({ sql: 'SELECT * FROM change_requests WHERE id = ?', args: [id] })).rows[0] as any;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
    if (existing.status === 'approved' || existing.status === 'rejected') {
      return res.status(409).json({ error: 'Yêu cầu đã được phê duyệt hoặc từ chối trước đó.' });
    }

    const decision = String(req.body?.decision || '');
    if (!['approved', 'rejected', 'needs_revision'].includes(decision)) {
      return res.status(400).json({ error: 'Quyết định không hợp lệ (approved | rejected | needs_revision).' });
    }

    const adminComment = String(req.body?.admin_comment || '').trim();
    const decisionNo = String(req.body?.decision_no || '').trim();
    const decisionDate = String(req.body?.decision_date || new Date().toISOString().slice(0, 10)).trim();
    const payload = {
      ...safeJson<Record<string, any>>(existing.payload_json, {}),
      ...(typeof req.body?.payload === 'object' && req.body.payload ? req.body.payload : {}),
    };

    // Apply automatic side-effects when approved
    let appliedSummary = '';
    if (decision === 'approved') {
      if (existing.request_type === 'special_quota' && existing.scientist_id) {
        const newLimit = Number(payload.requested_quota_limit || payload.special_quota_limit || 0) || null;
        await db.execute({
          sql: `UPDATE scientists
                SET special_quota_approved = 1,
                    special_quota_limit = COALESCE(?, special_quota_limit),
                    special_quota_decision = ?,
                    special_quota_reason = ?,
                    revision = revision + 1,
                    updated_at = datetime('now', '+7 hours')
                WHERE id = ?`,
          args: [newLimit, decisionNo, existing.reason, existing.scientist_id],
        });
        appliedSummary = `Đã mở trần Quota đặc cách = ${newLimit ?? 'theo QĐ'} (${decisionNo}).`;
      } else if (existing.phd_student_id) {
        const phd = (await db.execute({ sql: 'SELECT * FROM phd_students WHERE id = ?', args: [existing.phd_student_id] })).rows[0] as any;
        if (phd) {
          const changes = safeJson<any[]>(phd.training_changes_json, []);
          changes.push({
            date: decisionDate,
            changeType: REQUEST_TYPE_LABELS[existing.request_type as ChangeRequestType] || existing.request_type,
            decisionNo,
            description: `${existing.reason}${adminComment ? ' — ' + adminComment : ''}`,
          });

          if (existing.request_type === 'extension' || existing.request_type === 'deferral') {
            const nextStatus = existing.request_type === 'extension' ? 'extended' : 'deferred';
            const newDeadline = String(payload.new_standard_deadline || '').trim() || phd.standard_deadline;
            await db.execute({
              sql: `UPDATE phd_students
                    SET study_status = ?, standard_deadline = ?, training_changes_json = ?,
                        revision = revision + 1, updated_at = datetime('now', '+7 hours')
                    WHERE id = ?`,
              args: [nextStatus, newDeadline, JSON.stringify(changes), phd.id],
            });
            appliedSummary = `Cập nhật trạng thái -> ${nextStatus}, hạn chuẩn -> ${newDeadline}.`;
          } else if (existing.request_type === 'topic_change') {
            const newTitle = String(payload.new_dissertation_title || '').trim();
            await db.execute({
              sql: `UPDATE phd_students
                    SET adjusted_dissertation_title = COALESCE(NULLIF(?, ''), adjusted_dissertation_title),
                        title_change_decision_no = COALESCE(NULLIF(?, ''), title_change_decision_no),
                        training_changes_json = ?,
                        revision = revision + 1, updated_at = datetime('now', '+7 hours')
                    WHERE id = ?`,
              args: [newTitle, decisionNo, JSON.stringify(changes), phd.id],
            });
            appliedSummary = `Cập nhật tên đề tài điều chỉnh (${decisionNo}).`;
          } else if (existing.request_type === 'supervisor_change') {
            if (Array.isArray(payload.supervisions) && payload.supervisions.length > 0) {
              await db.execute({ sql: 'DELETE FROM phd_supervisions WHERE phd_student_id = ?', args: [phd.id] });
              for (const s of payload.supervisions) {
                if (!s.scientist_id) continue;
                await db.execute({
                  sql: `INSERT INTO phd_supervisions (phd_student_id, scientist_id, role, decision_no, assigned_date, is_active)
                        VALUES (?, ?, ?, ?, ?, 1)`,
                  args: [phd.id, Number(s.scientist_id), s.role || 'primary', decisionNo, decisionDate],
                });
              }
            }
            await db.execute({
              sql: `UPDATE phd_students SET training_changes_json = ?, revision = revision + 1, updated_at = datetime('now', '+7 hours') WHERE id = ?`,
              args: [JSON.stringify(changes), phd.id],
            });
            appliedSummary = `Cập nhật thay đổi CBHD (${decisionNo}).`;
          }
        }
      }
    }

    await db.execute({
      sql: `UPDATE change_requests
            SET status = ?, payload_json = ?, admin_comment = ?, decision_no = ?, decision_date = ?,
                approved_by_user_id = ?, approved_at = datetime('now', '+7 hours'),
                updated_at = datetime('now', '+7 hours')
            WHERE id = ?`,
      args: [decision, JSON.stringify(payload), adminComment, decisionNo, decisionDate, user.id, id],
    });

    await recordAudit(
      user,
      `request_${decision}`,
      'change_requests',
      id,
      `Phê duyệt yêu cầu #${id} (${existing.request_type}) -> ${decision}. ${appliedSummary}`,
      { status: existing.status },
      { status: decision, decisionNo, appliedSummary }
    );

    // Notify requester using email template
    const creator = (await db.execute({ sql: 'SELECT email, name FROM users WHERE id = ?', args: [existing.created_by_user_id] })).rows[0] as any;
    if (creator?.email) {
      const rendered = await renderEmailTemplate(
        'request_status',
        {
          request_label: REQUEST_TYPE_LABELS[existing.request_type as ChangeRequestType] || existing.request_type,
          status_label: REQUEST_STATUS_LABELS[decision] || decision,
          full_name: creator.name || creator.email,
          comment: [decisionNo ? `Số QĐ: ${decisionNo}.` : '', adminComment, appliedSummary].filter(Boolean).join(' '),
        },
        {
          subject: `[UET PhDHub] Cập nhật yêu cầu: ${REQUEST_STATUS_LABELS[decision] || decision}`,
          body: `Yêu cầu #${id} đã chuyển trạng thái: ${REQUEST_STATUS_LABELS[decision] || decision}. ${adminComment} ${appliedSummary}`,
        }
      );
      await createNotification({
        recipient_email: creator.email,
        phd_student_id: existing.phd_student_id ?? null,
        type: 'request_decision',
        subject: rendered.subject,
        body: rendered.body,
        delivery_mode: 'website_and_email',
        created_by_user_id: user.id,
      });
    }

    const updated = (await db.execute({ sql: 'SELECT * FROM change_requests WHERE id = ?', args: [id] })).rows[0];
    res.json({ ...updated, appliedSummary });
  }
);

/* ==================== REPORTING CYCLES (KỲ BÁO CÁO TIẾN ĐỘ) ==================== */

requestsRouter.get('/api/reporting-cycles', authenticateToken, async (_req, res) => {
  const rows = (await db.execute('SELECT * FROM reporting_cycles ORDER BY id DESC')).rows as any[];
  res.json({ items: rows });
});

requestsRouter.post('/api/reporting-cycles', authenticateToken, requirePermission('phd:write_all'), async (req: AuthedRequest, res) => {
  const { term_code, title, open_date, due_date, notes = '' } = req.body || {};
  if (!term_code || !title || !open_date || !due_date) {
    return res.status(400).json({ error: 'Vui lòng nhập Mã kỳ, Tiêu đề, Ngày mở và Hạn nộp.' });
  }
  try {
    const ins = await db.execute({
      sql: `INSERT INTO reporting_cycles (term_code, title, open_date, due_date, status, notes, created_by_user_id)
            VALUES (?, ?, ?, ?, 'open', ?, ?)`,
      args: [String(term_code).trim(), String(title).trim(), String(open_date).trim(), String(due_date).trim(), String(notes).trim(), req.user!.id],
    });
    const created = (await db.execute({ sql: 'SELECT * FROM reporting_cycles WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
    await recordAudit(req.user, 'create_reporting_cycle', 'reporting_cycles', Number(ins.lastInsertRowid), `Mở đợt báo cáo tiến độ ${term_code}`);
    res.status(201).json(created);
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Mã kỳ báo cáo đã tồn tại.' });
    throw err;
  }
});

requestsRouter.put('/api/reporting-cycles/:id', authenticateToken, requirePermission('phd:write_all'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM reporting_cycles WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy đợt báo cáo.' });
  const b = req.body || {};
  await db.execute({
    sql: `UPDATE reporting_cycles
          SET title = ?, open_date = ?, due_date = ?, status = ?, notes = ?, updated_at = datetime('now', '+7 hours')
          WHERE id = ?`,
    args: [
      String(b.title ?? existing.title).trim(),
      String(b.open_date ?? existing.open_date).trim(),
      String(b.due_date ?? existing.due_date).trim(),
      b.status === 'closed' ? 'closed' : 'open',
      String(b.notes ?? existing.notes).trim(),
      id,
    ],
  });
  const updated = (await db.execute({ sql: 'SELECT * FROM reporting_cycles WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

requestsRouter.get('/api/reporting-cycles/:id/summary', authenticateToken, requirePermission('phd:read_all'), async (req, res) => {
  const id = Number(req.params.id);
  const cycle = (await db.execute({ sql: 'SELECT * FROM reporting_cycles WHERE id = ?', args: [id] })).rows[0] as any;
  if (!cycle) return res.status(404).json({ error: 'Không tìm thấy đợt báo cáo.' });

  const [activePhds, reports] = await Promise.all([
    db.execute(`
      SELECT p.id, p.phd_code, p.full_name, p.email, f.short_name as faculty_short_name
      FROM phd_students p
      LEFT JOIN faculties f ON f.id = p.faculty_id
      WHERE p.is_completed = 0 AND p.study_status IN ('studying', 'extended', 'ready_defense')
      ORDER BY p.phd_code ASC
    `),
    db.execute({
      sql: `SELECT * FROM phd_progress_reports
            WHERE cycle_id = ? OR lower(trim(academic_term)) = lower(trim(?))
            ORDER BY id DESC`,
      args: [id, cycle.term_code],
    }),
  ]);

  const reportByPhd = new Map<number, any>();
  for (const r of reports.rows as any[]) {
    const pid = Number(r.phd_student_id);
    if (!reportByPhd.has(pid)) reportByPhd.set(pid, r);
  }

  const submitted: any[] = [];
  const missing: any[] = [];
  let approvedCount = 0;

  for (const p of activePhds.rows as any[]) {
    const rep = reportByPhd.get(Number(p.id));
    if (rep) {
      if (rep.supervisor_status === 'approved') approvedCount++;
      submitted.push({
        phd_id: Number(p.id),
        phd_code: p.phd_code,
        full_name: p.full_name,
        faculty_short_name: p.faculty_short_name,
        report_id: Number(rep.id),
        report_date: rep.report_date,
        thesis_progress_percent: rep.thesis_progress_percent,
        supervisor_status: rep.supervisor_status,
      });
    } else {
      missing.push({
        phd_id: Number(p.id),
        phd_code: p.phd_code,
        full_name: p.full_name,
        email: p.email,
        faculty_short_name: p.faculty_short_name,
      });
    }
  }

  res.json({
    cycle,
    stats: {
      totalActive: activePhds.rows.length,
      submittedCount: submitted.length,
      missingCount: missing.length,
      approvedCount,
      pendingSupervisorCount: submitted.length - approvedCount,
    },
    submitted,
    missing,
  });
});

requestsRouter.post('/api/reporting-cycles/:id/remind', authenticateToken, requirePermission('phd:write_all'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const cycle = (await db.execute({ sql: 'SELECT * FROM reporting_cycles WHERE id = ?', args: [id] })).rows[0] as any;
  if (!cycle) return res.status(404).json({ error: 'Không tìm thấy đợt báo cáo.' });

  const [activePhds, reports] = await Promise.all([
    db.execute(`
      SELECT id, phd_code, full_name, email
      FROM phd_students
      WHERE is_completed = 0 AND study_status IN ('studying', 'extended', 'ready_defense')
        AND email IS NOT NULL AND email != ''
    `),
    db.execute({
      sql: 'SELECT DISTINCT phd_student_id FROM phd_progress_reports WHERE cycle_id = ? OR lower(trim(academic_term)) = lower(trim(?))',
      args: [id, cycle.term_code],
    }),
  ]);

  const submittedIds = new Set((reports.rows as any[]).map((r) => Number(r.phd_student_id)));
  const todayIso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  let sentCount = 0;

  for (const p of activePhds.rows as any[]) {
    if (submittedIds.has(Number(p.id))) continue;
    const rendered = await renderEmailTemplate(
      'progress_cycle',
      {
        full_name: p.full_name,
        phd_code: p.phd_code,
        cycle_title: cycle.title,
        due_date: cycle.due_date,
      },
      {
        subject: `[UET PhDHub] Nhắc nộp ${cycle.title} — Hạn ${cycle.due_date}`,
        body: `Kính gửi ${p.full_name} (${p.phd_code}), vui lòng hoàn thiện báo cáo tiến độ cho ${cycle.title} trước ngày ${cycle.due_date}.`,
      }
    );
    const created = await createNotification({
      recipient_email: p.email,
      phd_student_id: Number(p.id),
      type: 'progress_cycle_reminder',
      subject: rendered.subject,
      body: rendered.body,
      delivery_mode: 'website_and_email',
      dedupe_key: `cycle:${id}:phd:${p.id}:${todayIso}`,
      created_by_user_id: req.user!.id,
    });
    if (created) sentCount++;
  }

  await recordAudit(req.user, 'remind_reporting_cycle', 'reporting_cycles', id, `Gửi nhắc nộp báo cáo tiến độ kỳ ${cycle.term_code}: ${sentCount} NCS`);
  res.json({ reminded: sentCount });
});
