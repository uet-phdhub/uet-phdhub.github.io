import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { db } from '../db';
import type { AuthedRequest } from '../types';
import type { AuthUser, UserRole } from '../../shared/types';

export function signAuthToken(user: Pick<AuthUser, 'id' | 'email' | 'role'>): string {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

export async function authenticateToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: UserRole };
    const row = (
      await db.execute({
        sql: 'SELECT id, email, name, picture, role, is_supervisor, scientist_id, phd_student_id, active FROM users WHERE id = ?',
        args: [decoded.id],
      })
    ).rows[0] as any;

    if (!row || Number(row.active) === 0) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.' });
    }

    req.user = {
      id: Number(row.id),
      email: String(row.email),
      name: String(row.name),
      picture: row.picture || null,
      role: row.role as UserRole,
      is_supervisor: Number(row.is_supervisor || 0),
      scientist_id: row.scientist_id ? Number(row.scientist_id) : null,
      phd_student_id: row.phd_student_id ? Number(row.phd_student_id) : null,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

export function isAdminOrStaff(user?: AuthUser | null): boolean {
  return Boolean(user && (user.role === 'admin' || user.role === 'staff'));
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa xác thực.' });
    if (roles.includes(req.user.role)) return next();
    // Allow admin/staff with is_supervisor flag to access supervisor endpoints seamlessly
    if (roles.includes('supervisor') && req.user.is_supervisor === 1 && req.user.scientist_id) {
      return next();
    }
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  };
}
