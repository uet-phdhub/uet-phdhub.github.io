import { Router } from 'express';
import { db } from '../db';
import { authenticateToken, requireRoles } from '../middlewares/auth';
import { recordAudit } from '../services/audit';
import { getRegulationConfig, saveRegulationConfig } from '../services/settings';
import type { AuthedRequest } from '../types';

export const settingsRouter = Router();

settingsRouter.get('/api/catalogs', authenticateToken, async (_req, res) => {
  const [facs, majors, regulationConfig] = await Promise.all([
    db.execute('SELECT * FROM faculties ORDER BY id ASC'),
    db.execute(`
      SELECT m.*, f.name as faculty_name, f.code as faculty_code
      FROM majors m
      LEFT JOIN faculties f ON f.id = m.faculty_id
      ORDER BY m.faculty_id ASC, m.id ASC
    `),
    getRegulationConfig(),
  ]);
  res.json({
    faculties: facs.rows,
    majors: majors.rows,
    regulationConfig,
  });
});

settingsRouter.put('/api/settings/regulation-3638', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
  const updated = await saveRegulationConfig(req.body || {});
  await recordAudit(req.user, 'update_regulation_3638', 'settings', 'regulation_3638_config', 'Cập nhật cấu hình bảng điểm & định mức Quy chế 3638', null, updated);
  res.json({ regulationConfig: updated });
});

settingsRouter.post('/api/settings/faculties', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
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

settingsRouter.post('/api/settings/majors', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
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

settingsRouter.get('/api/settings/users', authenticateToken, requireRoles('admin'), async (_req, res) => {
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

settingsRouter.post('/api/settings/users', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
  const { email, name, role = 'staff', is_supervisor = 0, scientist_id = null } = req.body || {};
  if (!email || !name) return res.status(400).json({ error: 'Vui lòng nhập Email và Họ tên.' });
  if (!['admin', 'staff', 'supervisor', 'phd_student'].includes(role)) {
    return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  try {
    const ins = await db.execute({
      sql: `INSERT INTO users (email, name, role, is_supervisor, scientist_id, active)
            VALUES (?, ?, ?, ?, ?, 1)`,
      args: [cleanEmail, String(name).trim(), role, is_supervisor || scientist_id ? 1 : 0, scientist_id ? Number(scientist_id) : null],
    });
    await recordAudit(req.user, 'create_user', 'users', Number(ins.lastInsertRowid), `Thêm tài khoản ${cleanEmail} (${role})`);
    const created = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
    res.status(201).json(created);
  } catch (err: any) {
    if (/UNIQUE/i.test(err?.message || '')) return res.status(409).json({ error: 'Email tài khoản đã tồn tại.' });
    throw err;
  }
});

settingsRouter.put('/api/settings/users/:id', authenticateToken, requireRoles('admin'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })).rows[0] as any;
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

  const b = req.body || {};
  const role = b.role && ['admin', 'staff', 'supervisor', 'phd_student'].includes(b.role) ? b.role : existing.role;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : existing.active;
  const scientistId = b.scientist_id !== undefined ? (b.scientist_id ? Number(b.scientist_id) : null) : existing.scientist_id;
  const isSupervisor = b.is_supervisor !== undefined ? (b.is_supervisor ? 1 : 0) : scientistId ? 1 : existing.is_supervisor;

  await db.execute({
    sql: `UPDATE users SET name = ?, role = ?, is_supervisor = ?, scientist_id = ?, active = ?, updated_at = datetime('now', '+7 hours') WHERE id = ?`,
    args: [String(b.name ?? existing.name).trim(), role, isSupervisor, scientistId, active, id],
  });
  await recordAudit(req.user, 'update_user', 'users', id, `Cập nhật tài khoản ${existing.email} -> role=${role}, active=${active}`);
  const updated = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })).rows[0];
  res.json(updated);
});

settingsRouter.get('/api/settings/audit-logs', authenticateToken, requireRoles('admin', 'staff'), async (req, res) => {
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 80));
  const rows = (
    await db.execute({
      sql: 'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?',
      args: [limit],
    })
  ).rows;
  res.json({ items: rows });
});
