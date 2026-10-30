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
 * Apply every migration not yet recorded, in name order, in one transaction.
 * The source is a folder of .sql files, or the migrations themselves (the
 * scheduled function carries them in its bundle, having no files to read).
 */
export async function migrate(db: Db, source: string | Migration[] = MIGRATIONS_DIR): Promise<string[]> {
  const list = typeof source === "string" ? await readMigrations(source) : [...source].sort((a, b) => a.name.localeCompare(b.name));
  const applied: string[] = [];
  await db.tx(async (q) => {
    // Serialise concurrent migrators (web and worker starting together).
    await q.query("select pg_advisory_xact_lock($1)", [LOCK]);
    await q.query(`create table if not exists trace_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const { rows } = await q.query<{ name: string }>("select name from trace_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const m of list) {
      if (done.has(m.name)) continue;
      await q.query(m.sql);
      await q.query("insert into trace_migrations (name) values ($1)", [m.name]);
      applied.push(m.name);
    }
  });
  return applied;
}
