import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface IDatabaseClient {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  isLivePostgres(): boolean;
}

class PostgresClient implements IDatabaseClient {
  private pool: pg.Pool | null = null;
  private live: boolean = false;

  constructor() {
    if (config.databaseUrl) {
      try {
        this.pool = new Pool({
          connectionString: config.databaseUrl,
          ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });
        this.live = true;
      } catch (err) {
        console.warn('[DB] PostgreSQL pool initialization deferred:', err);
      }
    }
  }

  isLivePostgres(): boolean {
    return this.live && this.pool !== null;
  }

  async query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    if (this.pool) {
      const res = await this.pool.query(text, params);
      return { rows: res.rows as T[], rowCount: res.rowCount || 0 };
    }
    throw new Error('PostgreSQL pool not connected');
  }
}

export const pgClient = new PostgresClient();
