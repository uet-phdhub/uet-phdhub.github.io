import type { Request } from 'express';
import type { AuthUser } from '../../shared/types';
import { db } from '../db';

function clientIp(req?: Request): string {
  if (!req) return '';
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim().slice(0, 64);
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

export async function recordAudit(
  actor: Pick<AuthUser, 'id' | 'email' | 'role'> | null | undefined,
  action: string,
  entityType: string,
  entityId: string | number,
  summary: string,
  beforeObj?: unknown,
  afterObj?: unknown
) {
  try {
    await db.execute({
      sql: `INSERT INTO audit_logs (actor_user_id, actor_email, actor_role, action, entity_type, entity_id, summary, before_json, after_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        actor?.id ?? null,
        actor?.email ?? 'system',
        actor?.role ?? 'system',
        action,
        entityType,
        String(entityId ?? ''),
        summary,
        beforeObj !== undefined ? JSON.stringify(beforeObj).slice(0, 8000) : null,
        afterObj !== undefined ? JSON.stringify(afterObj).slice(0, 8000) : null,
      ],
    });
  } catch (err: any) {
    console.warn('[audit] failed to record audit log:', err?.message || err);
  }
}

export async function recordSecretAccess(
  actor: Pick<AuthUser, 'id' | 'email'> | null | undefined,
  resourceType: 'ir_dossier' | 'ir_export' | 'scientist_financial' | 'payment_export' | 'confidential_document',
  resourceId: string | number,
  action: string,
  req?: Request
) {
  try {
    await db.execute({
      sql: `INSERT INTO secret_access_logs (actor_user_id, actor_email, resource_type, resource_id, action, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        actor?.id ?? null,
        actor?.email ?? 'system',
        resourceType,
        String(resourceId ?? ''),
        action,
        clientIp(req),
      ],
    });
  } catch (err: any) {
    console.warn('[audit] failed to record secret access:', err?.message || err);
  }
}

export async function recordAuthEvent(
  email: string,
  eventType: 'login_success' | 'login_denied' | 'session_revoked',
  reason: string,
  req?: Request
) {
  try {
    await db.execute({
      sql: `INSERT INTO auth_events (email, event_type, reason, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        String(email || '').trim().toLowerCase(),
        eventType,
        String(reason || '').slice(0, 300),
        clientIp(req),
        String(req?.headers['user-agent'] || '').slice(0, 240),
      ],
    });
  } catch (err: any) {
    console.warn('[audit] failed to record auth event:', err?.message || err);
  }
}
