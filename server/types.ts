import type { Request } from 'express';
import type { AuthUser } from '../shared/types';

export interface DatabaseResult {
  rows: any[];
  lastInsertRowid?: number | bigint;
  rowsAffected?: number;
}

export interface DatabaseClient {
  execute(stmt: string | { sql: string; args?: any[] }): Promise<DatabaseResult>;
  executeMultiple(sql: string): Promise<void>;
  batch(statements: Array<{ sql: string; args?: any[] }>, mode?: string): Promise<DatabaseResult[]>;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}
