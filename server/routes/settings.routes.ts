import { Router } from 'express';
import { evaluatePhdPublications, mergeRegulationConfig } from '../../shared/regulation3638';
import { activeDbProvider, db } from '../db';
import { authenticateToken, isAdminOrStaff, requirePermission, requireRoles } from '../middlewares/auth';
import { recordAudit, recordAuthEvent, recordSecretAccess } from '../services/audit';
import {
  cleanupOrphanStorageDocuments,
  createDatabaseBackupSnapshot,
  scanOrphanStorageDocuments,
} from '../services/backup';
import { createNotification, emailDailySendCap, emailSentTodayCount, getActiveEmailProvider } from '../services/email';
import {
  getRegulationConfig,
  getSystemBannerConfig,
  renderEmailTemplate,
  saveRegulationConfig,
  saveSystemBannerConfig,
} from '../services/settings';
import { getR2Config, listBackupObjects, streamBackupObject } from '../services/storage';
import type { AuthedRequest } from '../types';

export const settingsRouter = Router();

settingsRouter.get('/api/catalogs', authenticateToken, async (_req, res) => {
  const [facs, majors, regulationConfig, regVersions, cohorts, systemBanner] = await Promise.all([
    db.execute('SELECT * FROM faculties ORDER BY id ASC'),
    db.execute(`
      SELECT m.*, f.name as faculty_name, f.code as faculty_code
      FROM majors m
      LEFT JOIN faculties f ON f.id = m.faculty_id
      ORDER BY m.faculty_id ASC, m.id ASC
    `),
    getRegulationConfig(),
    db.execute('SELECT * FROM regulation_versions ORDER BY is_default DESC, id DESC'),
    db.execute(`
      SELECT c.*, rv.code as regulation_code
      FROM cohorts c
      LEFT JOIN regulation_versions rv ON rv.id = c.regulation_version_id
      ORDER BY c.code DESC
    `),
    getSystemBannerConfig(),
  ]);

  res.json({
    faculties: facs.rows,
    majors: majors.rows,
    regulationConfig,
    regulationVersions: (regVersions.rows as any[]).map((r) => ({
      ...r,
      config: (() => {
        try {
          return mergeRegulationConfig(JSON.parse(r.config_json));
        } catch {
          return regulationConfig;
        }
      })(),
    })),
    cohorts: cohorts.rows,
    systemBanner,
  });
});

/* ==================== REGULATION 3638 & VERSIONS ==================== */

settingsRouter.put('/api/settings/regulation-3638', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const before = await getRegulationConfig(true);
  const updated = await saveRegulationConfig(req.body || {});
  await recordAudit(req.user, 'update_regulation_3638', 'settings', 'regulation_3638_config', 'Cập nhật cấu hình bảng điểm & định mức Quy chế 3638', before, updated);
  res.json({ regulationConfig: updated });
});

settingsRouter.get('/api/settings/regulation-versions', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const rows = (await db.execute('SELECT * FROM regulation_versions ORDER BY is_default DESC, id DESC')).rows as any[];
  res.json({
    items: rows.map((r) => ({
      ...r,
      config: (() => {
        try {
          return mergeRegulationConfig(JSON.parse(r.config_json));
        } catch {
          return mergeRegulationConfig(null);
        }
      })(),
    })),
  });
});

settingsRouter.post('/api/settings/regulation-versions', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const { code, name, effective_from = '', config, is_default = false } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'Vui lòng nhập Mã phiên bản và Tên quy chế.' });
  const merged = mergeRegulationConfig(config || (await getRegulationConfig()));
  try {
    if (is_default) {
      await db.execute('UPDATE regulation_versions SET is_default = 0');
    }
    const ins = await db.execute({
      sql: `INSERT INTO regulation_versions (code, name, effective_from, config_json, is_default)
            VALUES (?, ?, ?, ?, ?)`,
      args: [String(code).trim(), String(name).trim(), String(effective_from).trim(), JSON.stringify(merged), is_default ? 1 : 0],
    });
    if (is_default) {
      await saveRegulationConfig(merged);
    }
    await recordAudit(req.user, 'create_regulation_version', 'regulation_versions', Number(ins.lastInsertRowid), `Tạo phiên bản quy chế ${code}`);
    const created = (await db.execute({ sql: 'SELECT * FROM regulation_versions WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0] as any;
    res.status(201).json({ ...created, config: merged });
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Mã phiên bản quy chế đã tồn tại.' });
    throw err;
  }
});

settingsRouter.put('/api/settings/regulation-versions/:id', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM regulation_versions WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiên bản quy chế.' });

  const b = req.body || {};
  const currentCfg = (() => {
    try {
      return mergeRegulationConfig(JSON.parse(existing.config_json));
    } catch {
      return mergeRegulationConfig(null);
    }
  })();
  const merged = b.config ? mergeRegulationConfig({ ...currentCfg, ...b.config }) : currentCfg;
  const makeDefault = b.is_default === true || b.is_default === 1;
  if (makeDefault) {
    await db.execute('UPDATE regulation_versions SET is_default = 0');
  }

  await db.execute({
    sql: `UPDATE regulation_versions
          SET name = ?, effective_from = ?, config_json = ?, is_default = ?,
              revision = revision + 1, updated_at = datetime('now', '+7 hours')
          WHERE id = ?`,
    args: [
      String(b.name ?? existing.name).trim(),
      String(b.effective_from ?? existing.effective_from).trim(),
      JSON.stringify(merged),
      makeDefault ? 1 : Number(existing.is_default),
      id,
    ],
  });

  if (makeDefault || Number(existing.is_default) === 1) {
    await saveRegulationConfig(merged);
  }
  await recordAudit(req.user, 'update_regulation_version', 'regulation_versions', id, `Cập nhật phiên bản quy chế ${existing.code}`);
  const updated = (await db.execute({ sql: 'SELECT * FROM regulation_versions WHERE id = ?', args: [id] })).rows[0] as any;
  res.json({ ...updated, config: merged });
});

settingsRouter.post('/api/settings/regulation-versions/preview-impact', authenticateToken, requirePermission('system:manage'), async (req, res) => {
  const currentCfg = await getRegulationConfig();
  const proposedCfg = mergeRegulationConfig({ ...currentCfg, ...(req.body?.config || {}) });
  const [phds, pubs] = await Promise.all([
    db.execute('SELECT id, phd_code, full_name FROM phd_students WHERE is_completed = 0'),
    db.execute('SELECT * FROM phd_publications'),
  ]);
  const pubsByPhd = new Map<number, any[]>();
  for (const p of pubs.rows as any[]) {
    const pid = Number(p.phd_student_id);
    if (!pubsByPhd.has(pid)) pubsByPhd.set(pid, []);
    pubsByPhd.get(pid)!.push({
      title: p.title,
      pubYear: Number(p.pub_year),
      pubType: p.pub_type,
      authorRole: p.author_role,
      hdgsnnMaxPoint: p.hdgsnn_max_point,
      totalAuthors: p.total_authors,
    });
  }
  let beforeMet = 0;
  let afterMet = 0;
  const affected: any[] = [];
  for (const phd of phds.rows as any[]) {
    const list = pubsByPhd.get(Number(phd.id)) || [];
    const e1 = evaluatePhdPublications(list, currentCfg);
    const e2 = evaluatePhdPublications(list, proposedCfg);
    if (e1.status === 'met') beforeMet++;
    if (e2.status === 'met') afterMet++;
    if (e1.status !== e2.status || e1.totalPoints !== e2.totalPoints) {
      affected.push({
        phd_code: phd.phd_code,
        full_name: phd.full_name,
        beforePoints: e1.totalPoints,
        afterPoints: e2.totalPoints,
        beforeStatus: e1.status,
        afterStatus: e2.status,
      });
    }
  }
  res.json({ activePhds: phds.rows.length, beforeMet, afterMet, affectedCount: affected.length, affected: affected.slice(0, 20) });
});

/* ==================== COHORTS (KHÓA / ĐỢT TUYỂN SINH) ==================== */

settingsRouter.get('/api/settings/cohorts', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const rows = (
    await db.execute(`
      SELECT c.*, rv.code as regulation_code
      FROM cohorts c
      LEFT JOIN regulation_versions rv ON rv.id = c.regulation_version_id
      ORDER BY c.code DESC
    `)
  ).rows;
  res.json({ items: rows });
});

settingsRouter.post('/api/settings/cohorts', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const b = req.body || {};
  if (!b.code) return res.status(400).json({ error: 'Vui lòng nhập Mã khóa / đợt tuyển sinh.' });
  try {
    const ins = await db.execute({
      sql: `INSERT INTO cohorts (
              code, name, regulation_version_id, start_date,
              standard_months_master, max_months_master,
              standard_months_bachelor, max_months_bachelor, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [
        String(b.code).trim(),
        String(b.name || b.code).trim(),
        b.regulation_version_id ? Number(b.regulation_version_id) : null,
        String(b.start_date || '').trim(),
        Number(b.standard_months_master) || 36,
        Number(b.max_months_master) || 72,
        Number(b.standard_months_bachelor) || 48,
        Number(b.max_months_bachelor) || 84,
      ],
    });
    await recordAudit(req.user, 'create_cohort', 'cohorts', Number(ins.lastInsertRowid), `Thêm khóa tuyển sinh ${b.code}`);
    const created = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
    res.status(201).json(created);
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Mã khóa đã tồn tại.' });
    throw err;
  }
});

settingsRouter.put('/api/settings/cohorts/:id', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy khóa tuyển sinh.' });
  const b = req.body || {};
  await db.execute({
    sql: `UPDATE cohorts
          SET name = ?, regulation_version_id = ?, start_date = ?,
              standard_months_master = ?, max_months_master = ?,
              standard_months_bachelor = ?, max_months_bachelor = ?, active = ?
          WHERE id = ?`,
    args: [
      String(b.name ?? existing.name).trim(),
      b.regulation_version_id !== undefined ? (b.regulation_version_id ? Number(b.regulation_version_id) : null) : existing.regulation_version_id,
      String(b.start_date ?? existing.start_date).trim(),
      Number(b.standard_months_master ?? existing.standard_months_master),
      Number(b.max_months_master ?? existing.max_months_master),
      Number(b.standard_months_bachelor ?? existing.standard_months_bachelor),
      Number(b.max_months_bachelor ?? existing.max_months_bachelor),
      b.active !== undefined ? (b.active ? 1 : 0) : existing.active,
      id,
    ],
  });
  const updated = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

/* ==================== FACULTIES & MAJORS (SOFT DELETE) ==================== */

settingsRouter.post('/api/settings/faculties', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const { code, name, short_name = '' } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'Vui lòng nhập Mã và Tên Khoa/Viện.' });
  try {
    const ins = await db.execute({
      sql: 'INSERT INTO faculties (code, name, short_name, active) VALUES (?, ?, ?, 1)',
      args: [String(code).trim().toUpperCase(), String(name).trim(), String(short_name).trim()],
    });
    const created = (await db.execute({ sql: 'SELECT * FROM faculties WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
    res.status(201).json(created);
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Mã Khoa/Viện đã tồn tại.' });
    throw err;
  }
});

settingsRouter.put('/api/settings/faculties/:id', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM faculties WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Khoa/Viện.' });
  const b = req.body || {};
  await db.execute({
    sql: 'UPDATE faculties SET name = ?, short_name = ?, active = ? WHERE id = ?',
    args: [
      String(b.name ?? existing.name).trim(),
      String(b.short_name ?? existing.short_name ?? '').trim(),
      b.active !== undefined ? (b.active ? 1 : 0) : existing.active,
      id,
    ],
  });
  const updated = (await db.execute({ sql: 'SELECT * FROM faculties WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

settingsRouter.post('/api/settings/majors', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const { code, name, faculty_id } = req.body || {};
  if (!code || !name || !faculty_id) return res.status(400).json({ error: 'Vui lòng nhập Mã ngành, Tên ngành và Khoa/Viện.' });
  try {
    const ins = await db.execute({
      sql: 'INSERT INTO majors (code, name, faculty_id, active) VALUES (?, ?, ?, 1)',
      args: [String(code).trim(), String(name).trim(), Number(faculty_id)],
    });
    const created = (await db.execute({ sql: 'SELECT * FROM majors WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
    res.status(201).json(created);
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Mã ngành đã tồn tại.' });
    throw err;
  }
});

settingsRouter.put('/api/settings/majors/:id', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM majors WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy Ngành.' });
  const b = req.body || {};
  await db.execute({
    sql: 'UPDATE majors SET name = ?, active = ? WHERE id = ?',
    args: [String(b.name ?? existing.name).trim(), b.active !== undefined ? (b.active ? 1 : 0) : existing.active, id],
  });
  const updated = (await db.execute({ sql: 'SELECT * FROM majors WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

/* ==================== USERS, EXPIRATION & SESSION REVOCATION ==================== */

settingsRouter.get('/api/settings/users', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const rows = (
    await db.execute(`
      SELECT u.*, s.full_name as scientist_name, p.phd_code
      FROM users u
      LEFT JOIN scientists s ON s.id = u.scientist_id
      LEFT JOIN phd_students p ON p.id = u.phd_student_id
      ORDER BY CASE u.role WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 WHEN 'supervisor' THEN 3 ELSE 4 END, u.id ASC
    `)
  ).rows;
  res.json({ items: rows });
});

settingsRouter.post('/api/settings/users', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const { email, name, role = 'admin', is_supervisor = 0, scientist_id = null, expires_at = null } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: 'Vui lòng nhập Email và Họ tên.' });
  if (!['admin', 'staff', 'supervisor', 'phd_student'].includes(role)) {
    return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    const ins = await db.execute({
      sql: `INSERT INTO users (email, name, role, is_supervisor, scientist_id, expires_at, active, token_version)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
      args: [
        cleanEmail,
        String(name).trim(),
        role,
        is_supervisor || scientist_id ? 1 : 0,
        scientist_id ? Number(scientist_id) : null,
        expires_at ? String(expires_at).trim() : null,
      ],
    });
    await recordAudit(req.user, 'create_user', 'users', Number(ins.lastInsertRowid), `Thêm tài khoản ${cleanEmail} (${role})`);
    const created = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
    res.status(201).json(created);
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Email tài khoản đã tồn tại.' });
    throw err;
  }
});

settingsRouter.put('/api/settings/users/:id', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

  const b = req.body || {};
  const role = b.role && ['admin', 'staff', 'supervisor', 'phd_student'].includes(b.role) ? b.role : existing.role;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : existing.active;
  const scientistId = b.scientist_id !== undefined ? (b.scientist_id ? Number(b.scientist_id) : null) : existing.scientist_id;
  const isSupervisor = b.is_supervisor !== undefined ? (b.is_supervisor ? 1 : 0) : scientistId ? 1 : existing.is_supervisor;
  const expiresAt = b.expires_at !== undefined ? (b.expires_at ? String(b.expires_at).trim() : null) : existing.expires_at;
  const bumpTv = active === 0 || role !== existing.role ? 1 : 0;

  await db.execute({
    sql: `UPDATE users
          SET name = ?, role = ?, is_supervisor = ?, scientist_id = ?, active = ?, expires_at = ?,
              token_version = token_version + ?, updated_at = datetime('now', '+7 hours')
          WHERE id = ?`,
    args: [String(b.name ?? existing.name).trim(), role, isSupervisor, scientistId, active, expiresAt, bumpTv, id],
  });
  await recordAudit(
    req.user,
    'update_user',
    'users',
    id,
    `Cập nhật tài khoản ${existing.email} -> role=${role}, active=${active}`,
    { role: existing.role, active: existing.active },
    { role, active, expiresAt }
  );
  const updated = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

settingsRouter.post('/api/settings/users/:id/revoke-sessions', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT id, email, token_version FROM users WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
  const nextTv = Number(existing.token_version || 1) + 1;
  await db.execute({
    sql: "UPDATE users SET token_version = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?",
    args: [nextTv, id],
  });
  await recordAudit(req.user, 'revoke_sessions', 'users', id, `Thu hồi toàn bộ phiên đăng nhập của ${existing.email}`);
  await recordAuthEvent(existing.email, 'session_revoked', `Thu hồi bởi ${req.user!.email}`, req);
  res.json({ ok: true, token_version: nextTv });
});

/* ==================== EMAIL TEMPLATES ==================== */

settingsRouter.get('/api/settings/email-templates', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const rows = (await db.execute('SELECT * FROM email_templates ORDER BY code ASC')).rows;
  res.json({ items: rows });
});

settingsRouter.put('/api/settings/email-templates/:code', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const code = String(req.params.code || '').trim();
  const { name, subject_template, body_template, active = 1 } = req.body || {};
  if (!subject_template || !body_template) {
    return res.status(400).json({ error: 'Vui lòng nhập tiêu đề và nội dung mẫu email.' });
  }
  await db.execute({
    sql: `UPDATE email_templates
          SET name = COALESCE(NULLIF(?, ''), name), subject_template = ?, body_template = ?, active = ?,
              updated_at = datetime('now', '+7 hours')
          WHERE code = ?`,
    args: [String(name || '').trim(), String(subject_template).trim(), String(body_template).trim(), active ? 1 : 0, code],
  });
  await recordAudit(req.user, 'update_email_template', 'email_templates', code, `Cập nhật mẫu email ${code}`);
  const updated = (await db.execute({ sql: 'SELECT * FROM email_templates WHERE code = ?', args: [code] })).rows[0];
  res.json(updated);
});

settingsRouter.post('/api/settings/email-templates/:code/test', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const code = String(req.params.code || '').trim();
  const rendered = await renderEmailTemplate(
    code,
    {
      full_name: 'Nguyễn Đức Anh (Mẫu thử)',
      phd_code: 'NCS230101',
      kind_label: 'hạn đào tạo chuẩn',
      deadline: '30/12/2026',
      days_label: 'Còn 15 ngày',
      cycle_title: 'Báo cáo tiến độ HK1 2026-2027',
      due_date: '30/12/2026',
      request_label: 'Gia hạn thời gian đào tạo',
      status_label: 'Đã phê duyệt',
      comment: 'Số QĐ: 123/QĐ-ĐHCN.',
    },
    { subject: `[Test] ${code}`, body: 'Mẫu email chưa kích hoạt.' }
  );
  await createNotification({
    recipient_user_id: req.user!.id,
    recipient_email: req.user!.email,
    type: 'template_test',
    subject: `[TEST] ${rendered.subject}`,
    body: rendered.body,
    delivery_mode: 'website_and_email',
    created_by_user_id: req.user!.id,
  });
  res.json({ ok: true, preview: rendered, sentTo: req.user!.email });
});

/* ==================== AUDIT LOGS, SECRET ACCESS & AUTH EVENTS ==================== */

settingsRouter.get('/api/settings/audit-logs', authenticateToken, requireRoles('admin', 'staff'), async (req, res) => {
  const limit = Math.min(250, Math.max(10, Number(req.query.limit) || 100));
  const actor = typeof req.query.actor === 'string' ? req.query.actor.trim() : '';
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const where: string[] = [];
  const args: any[] = [];
  if (actor) {
    where.push('lower(actor_email) LIKE ?');
    args.push(`%${actor.toLowerCase()}%`);
  }
  if (entityType && entityType !== 'all') {
    where.push('entity_type = ?');
    args.push(entityType);
  }
  if (search) {
    where.push('(summary LIKE ? OR action LIKE ? OR actor_email LIKE ?)');
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  args.push(limit);

  const rows = (
    await db.execute({
      sql: `SELECT * FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`,
      args,
    })
  ).rows;
  res.json({ items: rows });
});

settingsRouter.get('/api/settings/secret-access-logs', authenticateToken, requirePermission('system:manage'), async (req, res) => {
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 80));
  const rows = (await db.execute({ sql: 'SELECT * FROM secret_access_logs ORDER BY id DESC LIMIT ?', args: [limit] })).rows;
  res.json({ items: rows });
});

settingsRouter.post('/api/audit/secret-access', authenticateToken, async (req: AuthedRequest, res) => {
  if (!isAdminOrStaff(req.user)) return res.status(403).json({ error: 'Không có quyền.' });
  const { resource_type = 'scientist_financial', resource_id = '', action = 'reveal' } = req.body || {};
  await recordSecretAccess(req.user, resource_type, resource_id, String(action).slice(0, 120), req);
  res.json({ ok: true });
});

settingsRouter.get('/api/settings/auth-events', authenticateToken, requirePermission('system:manage'), async (req, res) => {
  const limit = Math.min(150, Math.max(10, Number(req.query.limit) || 60));
  const rows = (await db.execute({ sql: 'SELECT * FROM auth_events ORDER BY id DESC LIMIT ?', args: [limit] })).rows;
  res.json({ items: rows });
});

/* ==================== SYSTEM HEALTH, MAINTENANCE & BACKUP ==================== */

settingsRouter.get('/api/system/health', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const t0 = Date.now();
  await db.execute('SELECT 1 as ok');
  const dbLatencyMs = Date.now() - t0;

  const [phdCnt, sciCnt, docCnt, reqPendingCnt, sentToday, lastBackupRow, banner, backups] = await Promise.all([
    db.execute('SELECT COUNT(*) as c FROM phd_students'),
    db.execute('SELECT COUNT(*) as c FROM scientists'),
    db.execute('SELECT COUNT(*) as c, COALESCE(SUM(size_bytes), 0) as bytes FROM documents'),
    db.execute("SELECT COUNT(*) as c FROM change_requests WHERE status IN ('submitted', 'supervisor_approved')"),
    emailSentTodayCount(),
    db.execute("SELECT value FROM settings WHERE key = 'last_backup_meta'"),
    getSystemBannerConfig(true),
    listBackupObjects().catch(() => []),
  ]);

  let lastBackup = null;
  try {
    const raw = (lastBackupRow.rows[0] as any)?.value;
    if (raw) lastBackup = JSON.parse(raw);
  } catch {}

  res.json({
    dbProvider: activeDbProvider,
    dbLatencyMs,
    r2Configured: Boolean(getR2Config()),
    r2Bucket: getR2Config()?.bucket || 'local (.storage)',
    emailProvider: getActiveEmailProvider(),
    emailSentToday: sentToday,
    emailDailyCap: emailDailySendCap(),
    counts: {
      phds: Number((phdCnt.rows[0] as any)?.c || 0),
      scientists: Number((sciCnt.rows[0] as any)?.c || 0),
      documents: Number((docCnt.rows[0] as any)?.c || 0),
      documentBytes: Number((docCnt.rows[0] as any)?.bytes || 0),
      pendingRequests: Number((reqPendingCnt.rows[0] as any)?.c || 0),
      backups: backups.length,
    },
    lastBackup,
    systemBanner: banner,
    timestamp: new Date().toISOString(),
  });
});

settingsRouter.put('/api/system/maintenance', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const before = await getSystemBannerConfig(true);
  const updated = await saveSystemBannerConfig(req.body || {});
  await recordAudit(
    req.user,
    'update_system_banner',
    'settings',
    'system_banner_config',
    `Cập nhật Bảo trì=${updated.maintenanceMode}, Banner="${updated.bannerText.slice(0, 60)}"`,
    before,
    updated
  );
  res.json({ systemBanner: updated });
});

settingsRouter.get('/api/system/backups', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const items = await listBackupObjects();
  res.json({ items });
});

settingsRouter.post('/api/system/backups', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const snap = await createDatabaseBackupSnapshot(req.user!.email);
  await recordAudit(req.user, 'create_backup', 'system', snap.key, `Tạo bản sao lưu CSDL (${(snap.size / 1024).toFixed(1)} KB)`);
  res.status(201).json(snap);
});

settingsRouter.get('/api/system/backups/download', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const key = String(req.query.key || '').trim();
  if (!key.startsWith('system-backups/')) {
    return res.status(400).json({ error: 'Khóa bản sao lưu không hợp lệ.' });
  }
  const filename = key.split('/').pop() || 'uet-phdhub-backup.json.gz';
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const ok = await streamBackupObject(key, res);
  if (!ok && !res.headersSent) {
    res.status(404).json({ error: 'Không tìm thấy tệp sao lưu.' });
  }
});

settingsRouter.post('/api/cron/backup-db', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'];
  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'Sai hoặc thiếu X-Cron-Secret.' });
  }
  const snap = await createDatabaseBackupSnapshot('cron-weekly');
  res.json(snap);
});

settingsRouter.get('/api/system/r2-orphans', authenticateToken, requirePermission('system:manage'), async (_req, res) => {
  const scan = await scanOrphanStorageDocuments();
  res.json(scan);
});

settingsRouter.post('/api/system/r2-orphans/cleanup', authenticateToken, requirePermission('system:manage'), async (req: AuthedRequest, res) => {
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : [];
  const result = await cleanupOrphanStorageDocuments(keys);
  await recordAudit(req.user, 'cleanup_r2_orphans', 'system', 'r2', `Dọn ${result.deleted} tệp mồ côi trên kho lưu trữ`);
  res.json(result);
});
