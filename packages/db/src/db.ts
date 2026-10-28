import pg from "pg";

/** The pool, or a client inside a transaction. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export interface DbOptions {
  connectionString: string;
  /** PEM of the server's CA. Unset means TLS only when the URL asks for it. */
  caCert?: string;
  max?: number;
}

// int8 and numeric come back as strings by default. Counts and sums here fit
// in a double, and money is stored as int4 cents.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export class Db {
  readonly pool: pg.Pool;

  constructor(opts: DbOptions) {
    this.pool = new pg.Pool({
      connectionString: opts.connectionString,
      max: opts.max ?? 10,
      ...(opts.caCert ? { ssl: { ca: opts.caCert, rejectUnauthorized: true } } : {}),
    });
  }

  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>> {
    return this.pool.query<R>(text, values);
  }

  /** Run `fn` in one transaction. Throws roll back. */
  async tx<T>(fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const out = await fn(client);
      await client.query("commit");
      return out;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Hold a session-level advisory lock while `fn` runs, or return null at once
   * if another process holds it. Keeps one worker doing the periodic jobs.
   */
  async withLock<T>(key: number, fn: () => Promise<T>): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [key]);
      if (!rows[0]?.ok) return null;
      try {
        return await fn();
      } finally {
        await client.query("select pg_advisory_unlock($1)", [key]).catch(() => {});
      }
    } finally {
      client.release();
    }
  }

  end(): Promise<void> {
    return this.pool.end();
  }
}
