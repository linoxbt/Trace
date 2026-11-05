import { randomUUID } from "node:crypto";
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
  /** Close a connection idle this long (ms). Serverless instances should let go quickly. */
  idleTimeoutMs?: number;
}

// int8 and numeric come back as strings by default. Counts and sums here fit
// in a double, and money is stored as int4 cents.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

/**
 * node-postgres lets ssl settings in the URL replace the ssl option, so a URL
 * ending in ?sslmode=require would drop a pinned CA. With a CA, the URL's own
 * ssl parameters are removed and the CA decides.
 */
export function withoutSslParams(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

export class Db {
  readonly pool: pg.Pool;

  constructor(opts: DbOptions) {
    this.pool = new pg.Pool({
      connectionString: opts.caCert ? withoutSslParams(opts.connectionString) : opts.connectionString,
      max: opts.max ?? 10,
      idleTimeoutMillis: opts.idleTimeoutMs ?? 10_000,
      // A pooler that's full answers slowly or not at all: fail fast instead of hanging a request.
      connectionTimeoutMillis: 10_000,
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
   * Hold the named lease while `fn` runs, or return null at once if another
   * process holds it. Keeps one worker doing the periodic jobs. A lease, not a
   * session lock, so it works through a transaction pooler; it lapses after
   * `leaseS` if its holder dies without letting go.
   */
  async withLock<T>(key: number | string, fn: () => Promise<T>, leaseS = 120): Promise<T | null> {
    const name = String(key);
    const holder = randomUUID();
    const got = await this.pool.query(
      `insert into worker_leases (name, holder, until) values ($1, $2, now() + make_interval(secs => $3))
       on conflict (name) do update set holder = excluded.holder, until = excluded.until where worker_leases.until < now()
       returning 1`,
      [name, holder, leaseS],
    );
    if (got.rowCount !== 1) return null;
    try {
      return await fn();
    } finally {
      await this.pool.query("delete from worker_leases where name = $1 and holder = $2", [name, holder]).catch(() => {});
    }
  }

  end(): Promise<void> {
    return this.pool.end();
  }
}
