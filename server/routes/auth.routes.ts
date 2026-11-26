import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { getPermissionsForUser } from '../../shared/permissions';
import type { AuthUser, UserRole } from '../../shared/types';
import { ADMIN_EMAIL, ALLOW_DEV_LOGIN, GOOGLE_CLIENT_ID } from '../config';
import { db } from '../db';
import { authenticateToken, isAdminOrStaff, signAuthToken } from '../middlewares/auth';
import { recordAuthEvent } from '../services/audit';
import { getSystemBannerConfig } from '../services/settings';
import type { AuthedRequest } from '../types';

export const authRouter = Router();
const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);

async function resolveAndUpsertUserByEmail(
  emailInput: string,
  profileName?: string,
  picture?: string | null,
  req?: any
) {
  const email = String(emailInput || '').trim().toLowerCase();
  if (!email) throw { status: 400, message: 'Email không hợp lệ.' };

  const existingUser = (
    await db.execute({ sql: 'SELECT * FROM users WHERE lower(email) = ?', args: [email] })
  ).rows[0] as any;
  const scientist = (
    await db.execute({ sql: 'SELECT id, full_name FROM scientists WHERE lower(email) = ?', args: [email] })
  ).rows[0] as any;
  const phdStudent = (
    await db.execute({ sql: 'SELECT id, full_name FROM phd_students WHERE lower(email) = ?', args: [email] })
  ).rows[0] as any;

  const isPrimaryAdmin = email === ADMIN_EMAIL;
  const isVnuEmail = email.endsWith('@vnu.edu.vn');
  const isWhitelisted = Boolean(isPrimaryAdmin || existingUser || scientist || phdStudent);

  if (!isWhitelisted) {
    const msg = isVnuEmail
      ? 'Email VNU này chưa được đăng ký trong danh sách Cán bộ, Nghiên cứu sinh hoặc Quản trị Phòng Công tác sinh viên.'
      : 'Email ngoài @vnu.edu.vn chỉ được đăng nhập khi đã có trong danh mục Cán bộ/Chuyên gia hoặc Nghiên cứu sinh.';
    await recordAuthEvent(email, 'login_denied', 'Chưa nằm trong whitelist', req);
    throw { status: 403, message: msg };
  }

  if (existingUser && Number(existingUser.active) === 0) {
    await recordAuthEvent(email, 'login_denied', 'Tài khoản bị khóa', req);
    throw { status: 403, message: 'Tài khoản này đã bị vô hiệu hóa.' };
  }

  if (existingUser?.expires_at && String(existingUser.expires_at).trim()) {
    const todayIso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (String(existingUser.expires_at).slice(0, 10) < todayIso) {
      await recordAuthEvent(email, 'login_denied', 'Tài khoản tạm hết hạn', req);
      throw { status: 403, message: 'Tài khoản tạm thời này đã hết hạn truy cập.' };
    }
  }

  let role: UserRole;
  if (isPrimaryAdmin) {
    role = 'admin';
  } else if (existingUser) {
    role = existingUser.role as UserRole;
  } else if (scientist) {
    role = 'supervisor';
  } else {
    role = 'phd_student';
  }

  const scientistId = scientist ? Number(scientist.id) : existingUser?.scientist_id ? Number(existingUser.scientist_id) : null;
  const phdStudentId = phdStudent ? Number(phdStudent.id) : existingUser?.phd_student_id ? Number(existingUser.phd_student_id) : null;
  const isSupervisor = scientistId ? 1 : Number(existingUser?.is_supervisor || 0);
  const displayName = existingUser?.name || scientist?.full_name || phdStudent?.full_name || profileName || email;

  let userId: number;
  let tokenVersion = Number(existingUser?.token_version || 1);
  if (!existingUser) {
    const ins = await db.execute({
      sql: `INSERT INTO users (email, name, picture, role, is_supervisor, scientist_id, phd_student_id, active, token_version, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now', '+7 hours'))`,
      args: [email, displayName, picture || null, role, isSupervisor, scientistId, phdStudentId],
    });
    userId = Number(ins.lastInsertRowid);
    tokenVersion = 1;
  } else {
    userId = Number(existingUser.id);
    await db.execute({
      sql: `UPDATE users
            SET picture = COALESCE(?, picture),
                role = ?,
                is_supervisor = ?,
                scientist_id = ?,
                phd_student_id = ?,
                last_login_at = datetime('now', '+7 hours'),
                updated_at = datetime('now', '+7 hours')
            WHERE id = ?`,
      args: [picture || null, role, isSupervisor, scientistId, phdStudentId, userId],
    });
  }

  const user: AuthUser = {
    id: userId,
    email,
    name: displayName,
    picture: picture || existingUser?.picture || null,
    role,
    is_supervisor: isSupervisor,
    scientist_id: scientistId,
    phd_student_id: phdStudentId,
    token_version: tokenVersion,
  };
  user.permissions = getPermissionsForUser(user);

  const bannerCfg = await getSystemBannerConfig();
  if (bannerCfg.maintenanceMode && !isAdminOrStaff(user)) {
    throw { status: 503, message: bannerCfg.maintenanceMessage || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.' };
  }

  await recordAuthEvent(email, 'login_success', `Đăng nhập thành công (${role})`, req);
  const token = signAuthToken(user);
  return { token, user };
}

authRouter.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: 'Thiếu thông tin xác thực Google.' });
  }

  try {
    let payload: any;
    try {
      const ticket = await oAuth2Client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      if (process.env.NODE_ENV === 'production') {
        throw verifyErr;
      }
      const { jwtDecode } = await import('jwt-decode');
      payload = jwtDecode(credential);
    }

    if (!payload?.email) {
      return res.status(400).json({ error: 'Token Google không hợp lệ.' });
    }

    const session = await resolveAndUpsertUserByEmail(payload.email, payload.name, payload.picture || null, req);
    return res.json(session);
  } catch (err: any) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[auth/google] error:', err?.message || err);
    return res.status(401).json({ error: 'Không xác thực được tài khoản Google. Vui lòng thử lại.' });
  }
});

authRouter.get('/api/auth/dev-accounts', async (_req, res) => {
  if (!ALLOW_DEV_LOGIN) {
    return res.json({ enabled: false, accounts: [] });
  }
  const users = (
    await db.execute(`
      SELECT email, name, role, is_supervisor, scientist_id, phd_student_id
      FROM users
      WHERE active = 1
      ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 WHEN 'supervisor' THEN 3 ELSE 4 END, id ASC
      LIMIT 12
    `)
  ).rows as any[];

  const seenEmails = new Set(users.map((u) => String(u.email).toLowerCase()));
  const sampleSci = (
    await db.execute(`SELECT id, email, full_name, title_display, is_internal FROM scientists WHERE email IS NOT NULL AND email != '' ORDER BY is_internal DESC, id ASC LIMIT 3`)
  ).rows as any[];
  for (const s of sampleSci) {
    const em = String(s.email).toLowerCase();
    if (!seenEmails.has(em)) {
      seenEmails.add(em);
      users.push({
        email: em,
        name: `${s.title_display ? s.title_display + ' ' : ''}${s.full_name}`,
        role: 'supervisor',
        is_supervisor: 1,
        scientist_id: Number(s.id),
        phd_student_id: null,
        hint: s.is_internal ? 'Cán bộ hướng dẫn UET' : 'Chuyên gia ngoài Trường',
      });
    }
  }

  const samplePhd = (
    await db.execute(`SELECT id, email, full_name, phd_code FROM phd_students WHERE email IS NOT NULL AND email != '' ORDER BY id ASC LIMIT 2`)
  ).rows as any[];
  for (const p of samplePhd) {
    const em = String(p.email).toLowerCase();
    if (!seenEmails.has(em)) {
      seenEmails.add(em);
      users.push({
        email: em,
        name: `${p.full_name} (${p.phd_code})`,
        role: 'phd_student',
        is_supervisor: 0,
        scientist_id: null,
        phd_student_id: Number(p.id),
        hint: 'Nghiên cứu sinh',
      });
    }
  }

  res.json({ enabled: true, accounts: users });
});

authRouter.post('/api/auth/dev-login', async (req, res) => {
  if (!ALLOW_DEV_LOGIN) {
    return res.status(403).json({ error: 'Đăng nhập giả lập đã bị tắt trên môi trường này.' });
  }
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Vui lòng chọn hoặc nhập email.' });

  try {
    const session = await resolveAndUpsertUserByEmail(email, undefined, null, req);
    return res.json(session);
  } catch (err: any) {
    return res.status(err?.status || 500).json({ error: err?.message || 'Đăng nhập thất bại.' });
  }
});

authRouter.get('/api/auth/me', authenticateToken, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const [unreadRes, reqPendingRes, banner] = await Promise.all([
    db.execute({
      sql: 'SELECT COUNT(*) as c FROM notifications WHERE lower(recipient_email) = ? AND is_read = 0',
      args: [user.email.toLowerCase()],
    }),
    isAdminOrStaff(user)
      ? db.execute("SELECT COUNT(*) as c FROM change_requests WHERE status IN ('submitted', 'supervisor_approved')")
      : user.scientist_id
        ? db.execute({
            sql: `SELECT COUNT(*) as c FROM change_requests r
                  WHERE r.status = 'submitted'
                    AND EXISTS (SELECT 1 FROM phd_supervisions ps WHERE ps.phd_student_id = r.phd_student_id AND ps.scientist_id = ?)`,
            args: [user.scientist_id],
          })
        : Promise.resolve({ rows: [{ c: 0 }] }),
    getSystemBannerConfig(),
  ]);

  res.json({
    user,
    unreadNotifications: Number((unreadRes.rows[0] as any)?.c || 0),
    pendingRequests: Number((reqPendingRes.rows[0] as any)?.c || 0),
    systemBanner: banner,
  });
});
