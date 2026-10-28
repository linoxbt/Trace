import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@trace/db";
import { freshDb, TEST_DATABASE_URL } from "@trace/db/testing";
import { PostgresStorage } from "../src/storage.ts";

describe.skipIf(!TEST_DATABASE_URL)("PostgresStorage", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(() => db.end());

  it("stores bytes once and reads them back unchanged", async () => {
    const s = new PostgresStorage(db);
    const bytes = new Uint8Array([0xff, 0xd8, 0, 1, 2, 254, 255]);
    await s.put("job/j1/after/p1.jpg", bytes, "image/jpeg");
    expect(Array.from(await s.get("job/j1/after/p1.jpg"))).toEqual(Array.from(bytes));
    await expect(s.put("job/j1/after/p1.jpg", bytes, "image/jpeg")).rejects.toThrow(/exists/);
    await expect(s.get("job/j1/after/missing.jpg")).rejects.toThrow(/404/);
  });

  it("links photos to the app's party-checked route", async () => {
    expect(await new PostgresStorage(db).signedUrl("job/j 1/after/p1.jpg")).toBe("/api/photos/job/j%201/after/p1.jpg");
  });

  it("keeps photo bytes away from signed-in users: RLS on, no policies", async () => {
    const { rows } = await db.query<{ rls: boolean; policies: string }>(
      "select relrowsecurity as rls, (select count(*) from pg_policies where tablename = 'photo_blobs')::text as policies from pg_class where relname = 'photo_blobs'",
    );
    expect(rows[0]).toEqual({ rls: true, policies: "0" });
  });
});
