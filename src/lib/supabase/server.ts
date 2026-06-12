import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Service-role client — server only. Bypasses RLS; all writes flow through here.
 * Never import from a client component.
 */
let _admin: SupabaseClient<Database> | null = null;
export function adminDb(): SupabaseClient<Database> {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _admin;
}

/**
 * Cookie-bound server client for the signed-in user (kitchen/admin/donor portal).
 * Next 16: cookies() is async.
 */
export async function serverClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — middleware-less setup tolerates this
          }
        },
      },
    },
  );
}

/** Current user + role, or null. Use in layouts/route handlers to guard portals. */
export async function currentUser() {
  const supa = await serverClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminDb()
    .from("profiles").select("role, kitchen_id, must_change_password, display_name")
    .eq("user_id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email ?? "",
    role: (profile?.role ?? "donor") as "donor" | "kitchen" | "admin",
    kitchenId: (profile?.kitchen_id ?? null) as string | null,
    mustChangePassword: Boolean(profile?.must_change_password),
    displayName: (profile?.display_name ?? null) as string | null,
  };
}

/** Append-only audit trail. Failures are swallowed — auditing must never break the action. */
export async function audit(actor: string, action: string, entity?: string, entityId?: string, meta?: unknown) {
  try {
    await adminDb().from("audit_log").insert({
      actor, action, entity: entity ?? null, entity_id: entityId ?? null, meta: meta ?? null,
    });
  } catch {
    /* noop */
  }
}
