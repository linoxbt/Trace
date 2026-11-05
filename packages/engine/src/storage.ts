// Photos live in a private store: the photo_blobs table, served to a job's
// parties by the app's /api/photos route.

import type { Queryable } from "@trace/db";

export interface PhotoStorage {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  signedUrl(path: string, expiresInS?: number): Promise<string>;
}

export function photoPath(jobId: string, kind: "before" | "after" | "during" | "masked", photoId: string): string {
  return `job/${jobId}/${kind}/${photoId}.jpg`;
}

export class PostgresStorage implements PhotoStorage {
  constructor(
    private readonly db: Queryable,
    private readonly urlBase = "/api/photos",
  ) {}

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    // A path is written once; a second write is a bug, not an update.
    const res = await this.db.query("insert into photo_blobs (path, content_type, bytes) values ($1, $2, $3) on conflict (path) do nothing", [path, contentType, Buffer.from(bytes)]);
    if (res.rowCount === 0) throw new Error(`storage put ${path}: exists`);
  }

  async get(path: string): Promise<Uint8Array> {
    const { rows } = await this.db.query<{ bytes: Buffer }>("select bytes from photo_blobs where path = $1", [path]);
    if (!rows[0]) throw new Error(`storage get ${path}: 404`);
    return new Uint8Array(rows[0].bytes);
  }

  /** Not signed: the route behind it checks the viewer is one of the job's parties. */
  async signedUrl(path: string): Promise<string> {
    return `${this.urlBase}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
}

export class MemoryStorage implements PhotoStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (this.files.has(path)) throw new Error(`storage put ${path}: exists`);
    this.files.set(path, { bytes, contentType });
  }

  async get(path: string): Promise<Uint8Array> {
    const f = this.files.get(path);
    if (!f) throw new Error(`storage get ${path}: 404`);
    return f.bytes;
  }

  async signedUrl(path: string): Promise<string> {
    return `memory://${path}`;
  }
}
