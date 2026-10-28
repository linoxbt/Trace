// Photos live in a private Supabase Storage bucket, served by 10-minute signed URLs.

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
