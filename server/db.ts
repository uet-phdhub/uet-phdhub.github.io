import { createClient } from '@libsql/client';
import type { DatabaseClient, DatabaseResult } from './types';
import { DB_BATCH_SIZE } from './config';

export class CloudflareD1Client implements DatabaseClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(accountId: string, databaseId: string, apiToken: string) {
    this.apiToken = apiToken;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  }

  async execute(stmt: string | { sql: string; args?: any[] }): Promise<DatabaseResult> {
    const sql = typeof stmt === 'string' ? stmt : stmt.sql;
    const params = typeof stmt === 'string' ? undefined : stmt.args;
    const payload: any = { sql };
    if (params && params.length > 0) {
      payload.params = params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`D1 HTTP Error ${res.status}: ${errText}`);
      (err as any).status = res.status;
      throw err;
    }

    const data = (await res.json()) as any;
    if (!data.success) {
      throw new Error(`D1 Query Error: ${data.errors?.[0]?.message || JSON.stringify(data.errors)}`);
    }
    const first = data.result?.[0];
    return {
      rows: first?.results || [],
      lastInsertRowid: first?.meta?.last_row_id,
      rowsAffected: first?.meta?.changes ?? 0,
    };
  }

  async executeMultiple(sql: string): Promise<void> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) {
      throw new Error(`D1 HTTP Error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    if (!data.success) {
      throw new Error(`D1 ExecuteMultiple Error: ${data.errors?.[0]?.message || JSON.stringify(data.errors)}`);
    }
  }

  async batch(statements: Array<{ sql: string; args?: any[] }>): Promise<DatabaseResult[]> {
    if (!statements.length) return [];
    const formatted = statements.map((st) => {
      let q = st.sql.trim();
      if (q.endsWith(';')) q = q.slice(0, -1);
      return this.formatSqlWithArgs(q, st.args);
    });
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: formatted.join(';\n') + ';' }),
    });
    if (!res.ok) throw new Error(`D1 HTTP Error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    if (!data.success) throw new Error(`D1 Batch Error: ${data.errors?.[0]?.message || JSON.stringify(data.errors)}`);
    return (data.result || []).map((r: any) => ({
      rows: r.results || [],
      lastInsertRowid: r.meta?.last_row_id,
      rowsAffected: r.meta?.changes ?? 0,
    }));
  }

  private formatSqlWithArgs(sql: string, args?: any[]): string {
    if (!args?.length) return sql;
    let idx = 0;
    return sql.replace(/\?/g, () => {
      if (idx >= args.length) return '?';
      const val = args[idx++];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
      if (typeof val === 'boolean') return val ? '1' : '0';
      return `'${String(val).replace(/'/g, "''")}'`;
    });
  }
}

export let db: DatabaseClient;
export let activeDbProvider: 'turso' | 'd1' = 'turso';

export function setDb(client: DatabaseClient, provider: 'turso' | 'd1' = 'turso') {
  db = client;
  activeDbProvider = provider;
}

export function createDatabaseClient(overrideUrl?: string): { client: DatabaseClient; provider: 'turso' | 'd1' } {
  const providerEnv = String(process.env.DB_PROVIDER || '').trim().toLowerCase();
  const d1AccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const d1DbId = process.env.CLOUDFLARE_DATABASE_ID || process.env.CLOUDFLARE_D1_DATABASE_ID;
  const d1Token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_API_TOKEN;

  const useD1 = !overrideUrl && (providerEnv === 'd1' || (!providerEnv && Boolean(d1AccountId && d1DbId && d1Token)));
  if (useD1) {
    if (!d1AccountId || !d1DbId || !d1Token) {
      throw new Error('Thiếu cấu hình Cloudflare D1 (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN).');
    }
    return { client: new CloudflareD1Client(d1AccountId, d1DbId, d1Token), provider: 'd1' };
  }

  const url = overrideUrl || process.env.TURSO_DATABASE_URL || 'file:./phdhub-uet.db';
  const authToken = overrideUrl ? undefined : process.env.TURSO_AUTH_TOKEN || undefined;
  const libsql = createClient({ url, authToken });
  const wrapped: DatabaseClient = {
    async execute(stmt) {
      const res = await libsql.execute(stmt as any);
      return {
        rows: (res.rows || []).map((r: any) => ({ ...r })),
        lastInsertRowid: res.lastInsertRowid,
        rowsAffected: res.rowsAffected,
      };
    },
    async executeMultiple(sql) {
      await libsql.executeMultiple(sql);
    },
    async batch(statements, mode) {
      const results = await libsql.batch(statements as any, (mode as any) || 'write');
      return results.map((res: any) => ({
        rows: (res.rows || []).map((r: any) => ({ ...r })),
        lastInsertRowid: res.lastInsertRowid,
        rowsAffected: res.rowsAffected,
      }));
    },
  };
  return { client: wrapped, provider: 'turso' };
}

export async function executeBatch(statements: Array<{ sql: string; args?: any[] }>, mode: 'read' | 'write' = 'write') {
  for (let i = 0; i < statements.length; i += DB_BATCH_SIZE) {
    await db.batch(statements.slice(i, i + DB_BATCH_SIZE), mode);
  }
}
