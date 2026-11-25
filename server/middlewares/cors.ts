import type { CorsOptions } from 'cors';

export function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || '';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function isCorsAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  if (allowedOrigins.length === 0) return true;
  const normalized = origin.replace(/\/+$/, '');
  return allowedOrigins.includes(normalized);
}

export function createCorsOptions(): CorsOptions {
  const allowed = getAllowedOrigins();
  return {
    origin(origin, callback) {
      if (isCorsAllowed(origin, allowed)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  };
}
