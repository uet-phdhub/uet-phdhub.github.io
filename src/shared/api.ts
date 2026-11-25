import { API_BASE } from './config';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('phdhub_token');
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event('phdhub-auth-expired'));
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = `Yêu cầu thất bại (${res.status})`;
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      message = data.error || data.message || message;
    } else {
      const text = await res.text().catch(() => '');
      if (text) message = text.slice(0, 300);
    }
    throw new ApiError(res.status, message);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function downloadBlob(path: string, fallbackFilename: string) {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Không thể tải tệp (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getDocumentViewUrl(docId: number, download = false): string {
  const token = getStoredToken();
  const suffix = download ? 'download' : 'view';
  return `${API_BASE}/api/documents/${docId}/${suffix}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}
