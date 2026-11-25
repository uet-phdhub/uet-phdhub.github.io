import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { ADMIN_EMAIL, ALLOW_DEV_LOGIN, GOOGLE_CLIENT_ID } from '../config';
import { db } from '../db';
import { authenticateToken, signAuthToken } from '../middlewares/auth';
import type { AuthedRequest } from '../types';
import type { UserRole } from '../../shared/types';

export const authRouter = Router();
const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);

async function resolveAndUpsertUserByEmail(emailInput: string, profileName?: string, picture?: string | null) {
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
    throw {
      status: 403,
      message: isVnuEmail
        ? 'Email VNU này chưa được đăng ký trong danh sách Cán bộ, Nghiên cứu sinh hoặc Chuyên viên Phòng Công tác sinh viên. Vui lòng liên hệ Phòng CTSV.'
        : 'Email ngoài @vnu.edu.vn chỉ được đăng nhập khi đã có trong danh mục Cán bộ/Chuyên gia hoặc Nghiên cứu sinh của hệ thống.',
    };
  }

  if (existingUser && Number(existingUser.active) === 0) {
    throw { status: 403, message: 'Tài khoản này đã bị vô hiệu hóa.' };
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
  if (!existingUser) {
    const ins = await db.execute({
      sql: `INSERT INTO users (email, name, picture, role, is_supervisor, scientist_id, phd_student_id, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [email, displayName, picture || null, role, isSupervisor, scientistId, phdStudentId],
    });
    userId = Number(ins.lastInsertRowid);
  } else {
    userId = Number(existingUser.id);
    await db.execute({
      sql: `UPDATE users
            SET picture = COALESCE(?, picture),
                role = ?,
                is_supervisor = ?,
                scientist_id = ?,
                phd_student_id = ?,
                updated_at = datetime('now', '+7 hours')
            WHERE id = ?`,
      args: [picture || null, role, isSupervisor, scientistId, phdStudentId, userId],
    });
  }

  const user = {
    id: userId,
    email,
    name: displayName,
    picture: picture || existingUser?.picture || null,
    role,
    is_supervisor: isSupervisor,
    scientist_id: scientistId,
    phd_student_id: phdStudentId,
  };
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

    const session = await resolveAndUpsertUserByEmail(payload.email, payload.name, payload.picture || null);
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

  // Also include a sample scientist & phd_student if not yet in users table
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
    const session = await resolveAndUpsertUserByEmail(email);
    return res.json(session);
  } catch (err: any) {
    return res.status(err?.status || 500).json({ error: err?.message || 'Đăng nhập thất bại.' });
  }
});

authRouter.get('/api/auth/me', authenticateToken, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const unreadRow = (
    await db.execute({
      sql: 'SELECT COUNT(*) as c FROM notifications WHERE lower(recipient_email) = ? AND is_read = 0',
      args: [user.email.toLowerCase()],
    })
  ).rows[0] as any;
  res.json({
    user,
    unreadNotifications: Number(unreadRow?.c || 0),
  });
});
