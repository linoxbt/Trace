// Photos live in a private store. In production that is the photo_blobs table,
// served to a job's parties by the app's /api/photos route; Supabase Storage
// with signed URLs is kept for deployments that have a service key.

import type { Queryable } from "@trace/db";

export interface PhotoStorage {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  signedUrl(path: string, expiresInS?: number): Promise<string>;
}

export function photoPath(jobId: string, kind: "before" | "after" | "during", photoId: string): string {
  return `job/${jobId}/${kind}/${photoId}.jpg`;
}

export class SupabaseStorage implements PhotoStorage {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket = "proof",
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  private obj(path: string): string {
    return `${this.url.replace(/\/$/, "")}/storage/v1/object/${this.bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const res = await fetch(this.obj(path), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "false" }),
      body: bytes as Uint8Array<ArrayBuffer>,
    });
    if (!res.ok) throw new Error(`storage put ${path}: ${res.status} ${await res.text()}`);
  }

  async get(path: string): Promise<Uint8Array> {
    const res = await fetch(this.obj(path), { headers: this.headers() });
    if (!res.ok) throw new Error(`storage get ${path}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async signedUrl(path: string, expiresInS = 600): Promise<string> {
    const base = this.url.replace(/\/$/, "");
    const res = await fetch(`${base}/storage/v1/object/sign/${this.bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: expiresInS }),
    });
    if (!res.ok) throw new Error(`storage sign ${path}: ${res.status}`);
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${base}/storage/v1${signedURL}`;
  }
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
