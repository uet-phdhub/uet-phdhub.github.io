export const DEFAULT_JWT_SECRET = 'uet-phdhub-dev-secret-key-2026';
export const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
export const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || '123456789-mock.apps.googleusercontent.com';
export const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'ctsv.admin@vnu.edu.vn').trim().toLowerCase();
export const DB_BATCH_SIZE = 50;
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB for PDF/minh chứng/Excel
export const ALLOW_DEV_LOGIN =
  process.env.ALLOW_DEV_LOGIN === 'true' ||
  (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN !== 'false');

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'zip']);
export const ALLOWED_DOCUMENT_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.',
  'image/png',
  'image/jpeg',
  'application/zip',
];
