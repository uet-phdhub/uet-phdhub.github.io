import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getPermissionsForUser, hasAnyPermission } from '../../shared/permissions';
import type { AuthUser, PermissionCode, UserRole } from '../../shared/types';
import { JWT_SECRET } from '../config';
import { db } from '../db';
import { getSystemBannerConfig } from '../services/settings';
import type { AuthedRequest } from '../types';

export function signAuthToken(user: Pick<AuthUser, 'id' | 'email' | 'role' | 'token_version'>): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tv: user.token_version ?? 1 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function authenticateToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: UserRole; tv?: number };
    const row = (
      await db.execute({
        sql: `SELECT id, email, name, picture, role, is_supervisor, scientist_id, phd_student_id, active, token_version, expires_at
              FROM users WHERE id = ?`,
        args: [decoded.id],
      })
    ).rows[0] as any;

    if (!row || Number(row.active) === 0) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.' });
    }

    if (row.expires_at && String(row.expires_at).trim()) {
      const todayIso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      if (String(row.expires_at).slice(0, 10) < todayIso) {
        return res.status(401).json({ error: 'Tài khoản tạm thời đã hết hạn truy cập.' });
      }
    }

    const currentTv = Number(row.token_version || 1);
    if (decoded.tv !== undefined && Number(decoded.tv) !== currentTv) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.' });
    }

    const userObj: AuthUser = {
      id: Number(row.id),
      email: String(row.email),
      name: String(row.name),
      picture: row.picture || null,
      role: row.role as UserRole,
      is_supervisor: Number(row.is_supervisor || 0),
      scientist_id: row.scientist_id ? Number(row.scientist_id) : null,
      phd_student_id: row.phd_student_id ? Number(row.phd_student_id) : null,
      token_version: currentTv,
    };
    userObj.permissions = getPermissionsForUser(userObj);

    // Enforce Maintenance Mode for non-admin users
    const bannerCfg = await getSystemBannerConfig();
    if (bannerCfg.maintenanceMode && !isAdminOrStaff(userObj)) {
      return res.status(503).json({
        error: bannerCfg.maintenanceMessage || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
        maintenanceMode: true,
      });
    }

    req.user = userObj;
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
    // Per v2 governance: CTSV staff temporarily shares full admin privileges
    if (roles.includes('admin') && req.user.role === 'staff') return next();
    // Allow admin/staff with is_supervisor flag to access supervisor endpoints seamlessly
    if (roles.includes('supervisor') && req.user.is_supervisor === 1 && req.user.scientist_id) {
      return next();
    }
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  };
}

export function requirePermission(...permissions: PermissionCode[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa xác thực.' });
    if (hasAnyPermission(req.user, permissions)) return next();
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  };
}
