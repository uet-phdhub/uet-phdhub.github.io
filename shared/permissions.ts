import type { AuthUser, PermissionCode, UserRole } from './types';

export const ALL_ADMIN_PERMISSIONS: PermissionCode[] = [
  'phd:read_all',
  'phd:write_all',
  'phd:read_own',
  'ir:manage',
  'scientist:manage',
  'scientist:read_financial',
  'publication:verify',
  'request:create',
  'request:supervisor_review',
  'request:approve',
  'payment:manage',
  'forms:generate',
  'system:manage',
];

/**
 * Per UET CTSV governance decision (v2.0):
 * `staff` (Chuyên viên Phòng CTSV) is unified with `admin` (Quản trị viên Phòng CTSV)
 * while maintaining permission_code granularity so future separation requires only a policy update.
 */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  admin: ALL_ADMIN_PERMISSIONS,
  staff: ALL_ADMIN_PERMISSIONS,
  supervisor: ['phd:read_own', 'request:create', 'request:supervisor_review', 'forms:generate'],
  phd_student: ['phd:read_own', 'request:create'],
};

export function getPermissionsForUser(user?: Pick<AuthUser, 'role' | 'is_supervisor' | 'scientist_id' | 'permissions'> | null): PermissionCode[] {
  if (!user) return [];
  if (user.permissions && user.permissions.length > 0) return user.permissions;
  const set = new Set<PermissionCode>(ROLE_PERMISSIONS[user.role] || []);
  if (user.is_supervisor === 1 && user.scientist_id) {
    for (const p of ROLE_PERMISSIONS.supervisor) set.add(p);
  }
  return Array.from(set);
}

export function hasPermission(
  user: Pick<AuthUser, 'role' | 'is_supervisor' | 'scientist_id' | 'permissions'> | null | undefined,
  permission: PermissionCode
): boolean {
  return getPermissionsForUser(user).includes(permission);
}

export function hasAnyPermission(
  user: Pick<AuthUser, 'role' | 'is_supervisor' | 'scientist_id' | 'permissions'> | null | undefined,
  permissions: PermissionCode[]
): boolean {
  const granted = new Set(getPermissionsForUser(user));
  return permissions.some((p) => granted.has(p));
}

export function maskSecretValue(value: string | null | undefined, visibleTail = 4): string {
  const clean = String(value || '').trim();
  if (!clean) return '—';
  if (clean.length <= visibleTail) return '•'.repeat(clean.length);
  return `${'•'.repeat(Math.min(8, clean.length - visibleTail))}${clean.slice(-visibleTail)}`;
}
