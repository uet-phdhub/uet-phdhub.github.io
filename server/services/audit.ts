import type { AuthUser } from '../../shared/types';
import { db } from '../db';

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
