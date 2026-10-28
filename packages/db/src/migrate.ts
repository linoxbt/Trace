import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Db } from "./db.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
const LOCK = 727_001;

/** Apply every migration not yet recorded, in name order, each in its own transaction. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const applied: string[] = [];
  await db.tx(async (q) => {
    // Serialise concurrent migrators (web and worker starting together).
    await q.query("select pg_advisory_xact_lock($1)", [LOCK]);
    await q.query(`create table if not exists trace_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const { rows } = await q.query<{ name: string }>("select name from trace_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      await q.query(await readFile(join(dir, f), "utf8"));
      await q.query("insert into trace_migrations (name) values ($1)", [f]);
      applied.push(f);
    }
  });
  return applied;
}
