import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Db } from "./db.ts";

// Built from the module path at run time so bundlers leave it alone.
export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const LOCK = 727_001;

export interface Migration {
  name: string;
  sql: string;
}

/** The migration files in a folder, in name order. */
export async function readMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  return Promise.all(files.map(async (name) => ({ name, sql: await readFile(join(dir, name), "utf8") })));
}

/**
 * The ledger of applied migrations. The runner creates it, so the role that
 * runs migrations (trace_app in production) owns it and can keep it behind
 * row-level security, out of reach of the public roles. An older ledger,
 * trace_migrations, was created by another role and couldn't be locked down
 * by this one; its rows are copied over once and it is no longer read.
 */
export const LEDGER = "trace_schema_migrations";

/** The newest migration in this build. A test keeps it equal to the last file; /api/health compares the database with it. */
export const LATEST_MIGRATION = "021_webhook_backoff.sql";

/**
 * Apply every migration not yet recorded, in name order, in one transaction.
 * Migrations run as the app's own role, which owns only what it created: a
 * migration may add tables and views, but not alter a table created by
 * another role (the early tables were made by Supabase's postgres role).
 * The source is a folder of .sql files, or the migrations themselves (the
 * scheduled function carries them in its bundle, having no files to read).
 */
export async function migrate(db: Db, source: string | Migration[] = MIGRATIONS_DIR): Promise<string[]> {
  const list = typeof source === "string" ? await readMigrations(source) : [...source].sort((a, b) => a.name.localeCompare(b.name));
  const applied: string[] = [];
  await db.tx(async (q) => {
    // Serialise concurrent migrators (web and worker starting together).
    await q.query("select pg_advisory_xact_lock($1)", [LOCK]);
    await q.query(`create table if not exists ${LEDGER} (
      name text primary key, applied_at timestamptz not null default now())`);
    await q.query(`alter table ${LEDGER} enable row level security`);
    // The public roles exist on Supabase (and in the test shim), not on plain Postgres.
    await q.query(`do $$ begin
      if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on ${LEDGER} from anon; end if;
      if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on ${LEDGER} from authenticated; end if;
    end $$`);
    // Carry the older ledger's history across, once.
    const legacy = await q.query<{ ok: boolean }>("select to_regclass('public.trace_migrations') is not null as ok");
    if (legacy.rows[0]!.ok) {
      await q.query(`insert into ${LEDGER} (name, applied_at) select name, applied_at from trace_migrations on conflict (name) do nothing`);
    }
    const { rows } = await q.query<{ name: string }>(`select name from ${LEDGER}`);
    const done = new Set(rows.map((r) => r.name));
    for (const m of list) {
      if (done.has(m.name)) continue;
      await q.query(m.sql);
      await q.query(`insert into ${LEDGER} (name) values ($1)`, [m.name]);
      applied.push(m.name);
    }
  });
  return applied;
}
