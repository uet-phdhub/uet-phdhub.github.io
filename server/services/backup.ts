import crypto from 'crypto';
import zlib from 'zlib';
import { activeDbProvider, db } from '../db';
import {
  deleteBackupObject,
  deleteDocumentObject,
  listBackupObjects,
  listDocumentStorageObjects,
  saveBackupObject,
} from './storage';

const BACKUP_TABLES = [
  'faculties',
  'majors',
  'regulation_versions',
  'cohorts',
  'scientists',
  'phd_students',
  'users',
  'phd_supervisions',
  'phd_committee_members',
  'scientist_publications',
  'phd_publications',
  'reporting_cycles',
  'phd_progress_reports',
  'change_requests',
  'fee_rates',
  'payment_batches',
  'payment_items',
  'documents',
  'notifications',
  'email_templates',
  'settings',
  'audit_logs',
  'secret_access_logs',
  'auth_events',
];

export async function createDatabaseBackupSnapshot(actorEmail = 'system') {
  const tables: Record<string, any[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    try {
      const res = await db.execute(`SELECT * FROM ${table}`);
      tables[table] = res.rows;
      counts[table] = res.rows.length;
    } catch {
      tables[table] = [];
      counts[table] = 0;
    }
  }

  const createdAt = new Date().toISOString();
  const payloadObj = {
    schemaVersion: '2.0',
    provider: activeDbProvider,
    createdAt,
    createdBy: actorEmail,
    counts,
    tables,
  };

  const jsonBytes = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const sha256 = crypto.createHash('sha256').update(jsonBytes).digest('hex');
  const gzBuffer = zlib.gzipSync(jsonBytes, { level: 6 });

  const stamp = createdAt.replace(/[:.]/g, '-').slice(0, 19);
  const filename = `uet-phdhub-${stamp}.json.gz`;
  const stored = await saveBackupObject(filename, gzBuffer);

  // Retention: delete backups older than 90 days while keeping at least 12 newest
  let pruned = 0;
  try {
    const all = await listBackupObjects();
    const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
    for (let i = 12; i < all.length; i++) {
      if (new Date(all[i].lastModified).getTime() < cutoff) {
        await deleteBackupObject(all[i].key);
        pruned++;
      }
    }
  } catch {}

  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES ('last_backup_meta', ?, datetime('now', '+7 hours'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [JSON.stringify({ key: stored.key, size: stored.size, sha256, createdAt, provider: stored.provider })],
  });

  return {
    key: stored.key,
    filename,
    size: stored.size,
    uncompressedSize: jsonBytes.length,
    sha256,
    provider: stored.provider,
    counts,
    pruned,
    createdAt,
  };
}

export async function scanOrphanStorageDocuments() {
  const [storedObjs, dbRows] = await Promise.all([
    listDocumentStorageObjects(),
    db.execute("SELECT storage_key FROM documents WHERE storage_key IS NOT NULL AND storage_key != ''"),
  ]);

  const dbKeys = new Set((dbRows.rows as any[]).map((r) => String(r.storage_key)));
  const orphans = storedObjs.filter((o) => !dbKeys.has(o.key));
  const totalBytes = storedObjs.reduce((s, o) => s + o.size, 0);
  const orphanBytes = orphans.reduce((s, o) => s + o.size, 0);

  return {
    totalObjects: storedObjs.length,
    totalBytes,
    orphanCount: orphans.length,
    orphanBytes,
    orphans,
  };
}

export async function cleanupOrphanStorageDocuments(keys: string[]) {
  const scan = await scanOrphanStorageDocuments();
  const allowedOrphans = new Set(scan.orphans.map((o) => o.key));
  let deleted = 0;
  for (const k of keys) {
    if (allowedOrphans.has(k)) {
      await deleteDocumentObject(k);
      deleted++;
    }
  }
  return { deleted };
}
