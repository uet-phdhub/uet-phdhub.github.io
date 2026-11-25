import express, { Router } from 'express';
import { MAX_DOCUMENT_BYTES } from '../config';
import { db } from '../db';
import { authenticateToken, isAdminOrStaff } from '../middlewares/auth';
import { recordAudit } from '../services/audit';
import {
  buildDocumentStorageKey,
  deleteDocumentObject,
  isValidDriveOrHttpUrl,
  safeFilename,
  saveDocumentObject,
  streamDocumentObject,
  validateDocumentUpload,
} from '../services/storage';
import type { AuthedRequest } from '../types';

export const documentsRouter = Router();

async function canAccessDocumentEntity(
  user: NonNullable<AuthedRequest['user']>,
  entityType: string,
  entityId: number,
  isConfidential: boolean,
  requireWrite = false
): Promise<boolean> {
  if (isAdminOrStaff(user)) return true;
  if (isConfidential) return false;

  if (entityType === 'phd_student') {
    if (user.role === 'phd_student' && user.phd_student_id === entityId) return true;
    if (!requireWrite && user.scientist_id) {
      const sup = (
        await db.execute({
          sql: 'SELECT id FROM phd_supervisions WHERE phd_student_id = ? AND scientist_id = ? LIMIT 1',
          args: [entityId, user.scientist_id],
        })
      ).rows[0];
      return Boolean(sup);
    }
    return false;
  }

  if (entityType === 'scientist') {
    return user.scientist_id === entityId;
  }
  return false;
}

// Raw binary upload (PDF / Word / Excel / Image / ZIP)
documentsRouter.post(
  '/api/documents/upload',
  authenticateToken,
  express.raw({ type: '*/*', limit: `${Math.ceil(MAX_DOCUMENT_BYTES / (1024 * 1024)) + 1}mb` }),
  async (req: AuthedRequest, res) => {
    const user = req.user!;
    const entityType = String(req.query.entityType || 'phd_student');
    const entityId = Number(req.query.entityId);
    const category = String(req.query.category || 'other');
    const title = String(req.query.title || '').trim();
    const isConfidential = req.query.confidential === '1' || req.query.confidential === 'true' || category === 'ir_document';

    if (!Number.isInteger(entityId) || entityId <= 0) {
      return res.status(400).json({ error: 'Thiếu entityId hợp lệ.' });
    }
    if (isConfidential && !isAdminOrStaff(user)) {
      return res.status(403).json({ error: 'Chỉ Phòng Công tác sinh viên mới được tải tài liệu mật (PBĐL).' });
    }
    if (!(await canAccessDocumentEntity(user, entityType, entityId, isConfidential, true))) {
      return res.status(403).json({ error: 'Bạn không có quyền tải tệp lên hồ sơ này.' });
    }

    const rawHeaderName = String(req.headers['x-file-name'] || 'document.pdf');
    let decodedName = rawHeaderName;
    try {
      decodedName = decodeURIComponent(rawHeaderName);
    } catch {}
    const filename = safeFilename(decodedName);
    const mimeType = String(req.headers['content-type'] || 'application/pdf').split(';')[0].trim();
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

    const validationError = validateDocumentUpload(filename, mimeType, buffer.length);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const storageKey = buildDocumentStorageKey(entityType, entityId, filename);
    const provider = await saveDocumentObject(storageKey, buffer, mimeType);

    const ins = await db.execute({
      sql: `INSERT INTO documents (
              entity_type, entity_id, category, title, filename, mime_type, size_bytes,
              storage_provider, storage_key, drive_url, is_confidential, uploaded_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
      args: [
        entityType,
        entityId,
        category,
        title || filename,
        filename,
        mimeType,
        buffer.length,
        provider,
        storageKey,
        isConfidential ? 1 : 0,
        user.id,
      ],
    });

    const docId = Number(ins.lastInsertRowid);
    await recordAudit(user, 'upload_document', entityType, entityId, `Tải lên minh chứng "${title || filename}" (${filename})`);
    const created = (await db.execute({ sql: 'SELECT * FROM documents WHERE id = ?', args: [docId] })).rows[0];
    res.status(201).json(created);
  }
);

// External Google Drive / HTTP evidence link
documentsRouter.post('/api/documents/link', authenticateToken, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const { entity_type = 'phd_student', entity_id, category = 'other', title, drive_url, is_confidential = false } = req.body || {};
  const entityId = Number(entity_id);
  const confidential = Boolean(is_confidential || category === 'ir_document');

  if (!Number.isInteger(entityId) || entityId <= 0) {
    return res.status(400).json({ error: 'Thiếu mã hồ sơ liên kết.' });
  }
  if (!title || !drive_url || !isValidDriveOrHttpUrl(String(drive_url))) {
    return res.status(400).json({ error: 'Vui lòng nhập tiêu đề và đường dẫn HTTPS hợp lệ (Google Drive/URL).' });
  }
  if (confidential && !isAdminOrStaff(user)) {
    return res.status(403).json({ error: 'Chỉ Phòng CTSV mới được gắn tài liệu mật.' });
  }
  if (!(await canAccessDocumentEntity(user, String(entity_type), entityId, confidential, true))) {
    return res.status(403).json({ error: 'Không có quyền đính kèm minh chứng vào hồ sơ này.' });
  }

  const ins = await db.execute({
    sql: `INSERT INTO documents (
            entity_type, entity_id, category, title, filename, mime_type, size_bytes,
            storage_provider, storage_key, drive_url, is_confidential, uploaded_by_user_id
          ) VALUES (?, ?, ?, ?, '', 'text/uri-list', 0, 'drive_link', '', ?, ?, ?)`,
    args: [String(entity_type), entityId, String(category), String(title).trim(), String(drive_url).trim(), confidential ? 1 : 0, user.id],
  });

  const docId = Number(ins.lastInsertRowid);
  const created = (await db.execute({ sql: 'SELECT * FROM documents WHERE id = ?', args: [docId] })).rows[0];
  res.status(201).json(created);
});

async function handleStreamDocument(req: AuthedRequest, res: any, asDownload: boolean) {
  const docId = Number(req.params.id);
  const doc = (await db.execute({ sql: 'SELECT * FROM documents WHERE id = ?', args: [docId] })).rows[0] as any;
  if (!doc) return res.status(404).json({ error: 'Không tìm thấy tệp minh chứng.' });

  const allowed = await canAccessDocumentEntity(
    req.user!,
    String(doc.entity_type),
    Number(doc.entity_id),
    Boolean(doc.is_confidential),
    false
  );
  if (!allowed) {
    return res.status(403).json({ error: 'Bạn không có quyền truy cập tệp minh chứng này.' });
  }

  if (doc.storage_provider === 'drive_link' && doc.drive_url) {
    return res.redirect(doc.drive_url);
  }

  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  const encoded = encodeURIComponent(doc.filename || 'document.pdf');
  res.setHeader('Content-Disposition', `${asDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encoded}`);
  const ok = await streamDocumentObject(doc.storage_key, res);
  if (!ok) {
    return res.status(404).json({ error: 'Không tìm thấy tệp trong kho lưu trữ.' });
  }
}

documentsRouter.get('/api/documents/:id/view', authenticateToken, (req: AuthedRequest, res) => handleStreamDocument(req, res, false));
documentsRouter.get('/api/documents/:id/download', authenticateToken, (req: AuthedRequest, res) => handleStreamDocument(req, res, true));

documentsRouter.delete('/api/documents/:id', authenticateToken, async (req: AuthedRequest, res) => {
  const docId = Number(req.params.id);
  const doc = (await db.execute({ sql: 'SELECT * FROM documents WHERE id = ?', args: [docId] })).rows[0] as any;
  if (!doc) return res.status(404).json({ error: 'Không tìm thấy tệp minh chứng.' });

  const allowed = await canAccessDocumentEntity(
    req.user!,
    String(doc.entity_type),
    Number(doc.entity_id),
    Boolean(doc.is_confidential),
    true
  );
  if (!allowed) return res.status(403).json({ error: 'Bạn không có quyền xóa tệp này.' });

  if (doc.storage_key) {
    await deleteDocumentObject(doc.storage_key).catch(() => undefined);
  }
  await db.execute({ sql: 'DELETE FROM documents WHERE id = ?', args: [docId] });
  await recordAudit(req.user, 'delete_document', doc.entity_type, doc.entity_id, `Xóa minh chứng "${doc.title}"`);
  res.json({ ok: true });
});
