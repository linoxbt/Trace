import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { upsertProfile } from "@trace/db";
import { engine } from "./engine";
import { env } from "./env";

export interface SessionUser {
  id: string;
  email: string | null;
  anonymous: boolean;
}

export async function supabaseServer() {
  const store = await cookies();
  const e = env();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        try {
          for (const c of all) store.set(c.name, c.value, c.options);
        } catch {
          // Server components can't set cookies; the middleware refreshes them.
        }
      },
    },
  });
}

/** The signed-in user, checked with Supabase Auth (not just read from the cookie). */
export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const user = { id: u.id, email: u.email?.toLowerCase() ?? null, anonymous: !!u.is_anonymous };
  await upsertProfile(engine().db, { id: user.id, displayName: displayName(u.user_metadata, user.email) });
  return user;
}

function displayName(meta: Record<string, unknown> | undefined, email: string | null): string {
  const name = typeof meta?.name === "string" ? meta.name : null;
  return (name ?? email?.split("@")[0] ?? "Guest").slice(0, 80);
}
