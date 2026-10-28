// Test helpers: a fresh schema per test file on TEST_DATABASE_URL.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Db } from "./db.ts";
import { migrate } from "./migrate.ts";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const SHIM = fileURLToPath(new URL("../test/supabase-shim.sql", import.meta.url));

/** Drop and recreate the public schema, load the Supabase shim, and migrate. */
export async function freshDb(): Promise<Db> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const db = new Db({ connectionString: TEST_DATABASE_URL, max: 5 });
  await db.query("drop schema if exists public cascade; create schema public; grant all on schema public to public");
  await db.query("drop table if exists auth.users");
  await db.query(await readFile(SHIM, "utf8"));
  await migrate(db);
  return db;
}

let userSeq = 0;
/** A Supabase auth user plus a profile. */
export async function makeUser(db: Db, name = "user"): Promise<string> {
  userSeq += 1;
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [`${name}${userSeq}@example.test`],
  );
  const id = rows[0]!.id;
  await db.query("insert into profiles (id, display_name) values ($1, $2)", [id, name]);
  return id;
}
