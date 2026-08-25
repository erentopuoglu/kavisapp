// Kavis — admin Edge Function'ları arasında PAYLAŞILAN "çağıran gerçekten
// admin mi?" doğrulaması. admin-manage-user ve admin-moderate-content
// aynı kontrolü ayrı ayrı yazmasın diye tek yerde.
//
// Akış: çağıranın JWT'sini doğrula -> service_role ile profiles.is_admin'i
// oku (RLS'i bypass eder, istemcinin bildirdiği hiçbir şeye güvenmez) ->
// true değilse 403.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AdminAuthResult =
  | { ok: true; userId: string; admin: ReturnType<typeof createClient> }
  | { ok: false; status: number; error: string };

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, status: 401, error: "Yetkisiz." };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return { ok: false, status: 401, error: "Yetkisiz." };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[requireAdmin] profil okunamadı:", profileError);
    return { ok: false, status: 500, error: "Yetki kontrol edilemedi, tekrar deneyin." };
  }
  if (!(profile as { is_admin: boolean } | null)?.is_admin) {
    return { ok: false, status: 403, error: "Bu işlem için admin yetkisi gerekiyor." };
  }

  return { ok: true, userId: user.id, admin };
}
