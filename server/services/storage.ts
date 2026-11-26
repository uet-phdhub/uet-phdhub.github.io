import fs from 'fs';
import { dirname, join } from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { ALLOWED_DOCUMENT_EXTENSIONS, ALLOWED_DOCUMENT_MIME_PREFIXES, MAX_DOCUMENT_BYTES } from '../config';

let r2Client: S3Client | null = null;

export const BACKUP_PREFIX = 'system-backups/';

export function safeFilename(filename: string): string {
  const clean = String(filename || 'document.pdf')
    .replace(/[/\\]/g, '_')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 180);
  return clean || 'document.pdf';
}

export function fileExtension(filename: string): string {
  const clean = safeFilename(filename);
  const idx = clean.lastIndexOf('.');
  return idx >= 0 ? clean.slice(idx + 1).toLowerCase() : '';
}

export function validateDocumentUpload(filename: string, mimeType: string, sizeBytes: number): string | null {
  if (!sizeBytes || sizeBytes <= 0) return 'Tệp tải lên rỗng.';
  if (sizeBytes > MAX_DOCUMENT_BYTES) {
    return `Tệp vượt quá giới hạn ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.`;
  }
  const ext = fileExtension(filename);
  const mime = String(mimeType || '').toLowerCase();
  const allowed =
    ALLOWED_DOCUMENT_EXTENSIONS.has(ext) ||
    ALLOWED_DOCUMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!allowed) {
    return 'Định dạng tệp không được hỗ trợ. Chấp nhận PDF, Word, Excel, Ảnh (PNG/JPG) hoặc ZIP.';
  }
  return null;
}

export function isValidDriveOrHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildDocumentStorageKey(entityType: string, entityId: number, filename: string): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const cleanEntity = String(entityType).replace(/[^a-z0-9_-]/gi, '_');
  return `documents/${cleanEntity}/${entityId}/${stamp}-${rand}-${safeFilename(filename)}`;
}

export function getR2Config() {
  const bucket = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, endpoint, accessKeyId, secretAccessKey };
}

function getR2Client() {
  const cfg = getR2Config();
  if (!cfg) return null;
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return { client: r2Client, bucket: cfg.bucket };
}

function localDocumentPath(key: string): string {
  return join(process.cwd(), '.storage', 'documents', key);
}

function localBackupPath(key: string): string {
  const safeKey = key.replace(/^system-backups\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(process.cwd(), '.storage', 'backups', safeKey);
}

export async function saveDocumentObject(key: string, buffer: Buffer, contentType: string): Promise<'r2' | 'local'> {
  const r2 = getR2Client();
  if (r2) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      })
    );
    return 'r2';
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Chưa cấu hình Cloudflare R2 cho lưu trữ tệp minh chứng trên môi trường production.');
  }

  const localPath = localDocumentPath(key);
  fs.mkdirSync(dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buffer);
  return 'local';
}

export async function streamDocumentObject(key: string, res: Response): Promise<boolean> {
  const r2 = getR2Client();
  if (r2) {
    const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const body = obj.Body as any;
    if (!body) return false;
    if (typeof body.pipe === 'function') {
      body.pipe(res);
      return true;
    }
    if (typeof body.transformToByteArray === 'function') {
      res.end(Buffer.from(await body.transformToByteArray()));
      return true;
    }
    return false;
  }

  const localPath = localDocumentPath(key);
  if (!fs.existsSync(localPath)) return false;
  fs.createReadStream(localPath).pipe(res);
  return true;
}

export async function deleteDocumentObject(key: string | null | undefined): Promise<void> {
  if (!key) return;
  const r2 = getR2Client();
  if (r2) {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    return;
  }
  const localPath = localDocumentPath(key);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
}

/* ==================== Backup Storage (system-backups/ in same R2 bucket) ==================== */

export interface StoredObjectInfo {
  key: string;
  size: number;
  lastModified: string;
  provider: 'r2' | 'local';
}

export async function saveBackupObject(filename: string, buffer: Buffer): Promise<StoredObjectInfo> {
  const key = `${BACKUP_PREFIX}${safeFilename(filename)}`;
  const r2 = getR2Client();
  if (r2) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/gzip',
      })
    );
    return { key, size: buffer.length, lastModified: new Date().toISOString(), provider: 'r2' };
  }

  const localPath = localBackupPath(key);
  fs.mkdirSync(dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buffer);
  return { key, size: buffer.length, lastModified: new Date().toISOString(), provider: 'local' };
}

export async function listBackupObjects(): Promise<StoredObjectInfo[]> {
  const r2 = getR2Client();
  if (r2) {
    const out: StoredObjectInfo[] = [];
    let token: string | undefined;
    do {
      const res = await r2.client.send(
        new ListObjectsV2Command({
          Bucket: r2.bucket,
          Prefix: BACKUP_PREFIX,
          ContinuationToken: token,
        })
      );
      for (const obj of res.Contents || []) {
        if (!obj.Key || obj.Key === BACKUP_PREFIX) continue;
        out.push({
          key: obj.Key,
          size: Number(obj.Size || 0),
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString(),
          provider: 'r2',
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  }

  const dir = join(process.cwd(), '.storage', 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json.gz') || f.endsWith('.json'))
    .map((f) => {
      const stat = fs.statSync(join(dir, f));
      return {
        key: `${BACKUP_PREFIX}${f}`,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        provider: 'local' as const,
      };
    })
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export async function streamBackupObject(key: string, res: Response): Promise<boolean> {
  if (!key.startsWith(BACKUP_PREFIX)) return false;
  const r2 = getR2Client();
  if (r2) {
    const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const body = obj.Body as any;
    if (!body) return false;
    if (typeof body.pipe === 'function') {
      body.pipe(res);
      return true;
    }
    if (typeof body.transformToByteArray === 'function') {
      res.end(Buffer.from(await body.transformToByteArray()));
      return true;
    }
    return false;
  }

  const localPath = localBackupPath(key);
  if (!fs.existsSync(localPath)) return false;
  fs.createReadStream(localPath).pipe(res);
  return true;
}

export async function deleteBackupObject(key: string): Promise<void> {
  if (!key.startsWith(BACKUP_PREFIX)) return;
  const r2 = getR2Client();
  if (r2) {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    return;
  }
  const localPath = localBackupPath(key);
  if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
}

export async function listDocumentStorageObjects(): Promise<StoredObjectInfo[]> {
  const r2 = getR2Client();
  if (r2) {
    const out: StoredObjectInfo[] = [];
    let token: string | undefined;
    do {
      const res = await r2.client.send(
        new ListObjectsV2Command({
          Bucket: r2.bucket,
          Prefix: 'documents/',
          ContinuationToken: token,
        })
      );
      for (const obj of res.Contents || []) {
        if (!obj.Key || obj.Key.endsWith('/')) continue;
        out.push({
          key: obj.Key,
          size: Number(obj.Size || 0),
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString(),
          provider: 'r2',
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  const baseDir = join(process.cwd(), '.storage', 'documents');
  if (!fs.existsSync(baseDir)) return [];
  const results: StoredObjectInfo[] = [];
  const walk = (dir: string, relPrefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else {
        const stat = fs.statSync(full);
        results.push({ key: rel, size: stat.size, lastModified: stat.mtime.toISOString(), provider: 'local' });
      }
    }
  };
  walk(baseDir, '');
  return results;
}
