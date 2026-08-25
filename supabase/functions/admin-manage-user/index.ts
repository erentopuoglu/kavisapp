// Kavis — admin-manage-user Edge Function
//
// Kullanıcı banlama/ban kaldırma yalnızca buradan yapılabilir. İki
// katman: (1) GoTrue (Supabase Auth) seviyesinde ban_duration — yeni
// giriş/token yenilemeyi tamamen engeller, RLS'e güvenmez, en güçlü
// katman; (2) profiles.is_banned — uygulamanın "banlı" göstergesi +
// 0009_admin_moderation.sql'deki insert politikalarının dayandığı alan.
//
// Zaten geçerli bir access token'ı olan banlı bir kullanıcı, o token
// süresi dolana kadar (~1 saat) bazı GET isteklerine devam edebilir —
// bu JWT'lerin doğası gereği beklenen bir sınır, RLS'teki
// is_current_user_banned() kontrolleri en azından bu pencerede YENİ
// içerik üretimini engelliyor (bkz. ana repo README'si).
//
// Deploy: supabase functions deploy admin-manage-user
// Çağırma (istemci): supabase.functions.invoke("admin-manage-user", { body })

import { requireAdmin } from "../_shared/requireAdmin.ts";

// GoTrue'da gerçek bir "sonsuz ban" seçeneği yok — Supabase'in kendi
// dokümantasyonunda "kalıcı ban" için önerilen konvansiyon bu (~100 yıl).
const PERMANENT_BAN_DURATION = "876000h";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Sadece POST destekleniyor." }, 405);
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }
  const { userId: callerId, admin } = auth;

  let body: { user_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const { user_id, action } = body;
  if (!user_id || (action !== "ban" && action !== "unban")) {
    return json({ error: "user_id ve action ('ban'|'unban') zorunludur." }, 400);
  }
  if (user_id === callerId) {
    return json({ error: "Kendinizi banlayamazsınız." }, 400);
  }

  const banDuration = action === "ban" ? PERMANENT_BAN_DURATION : "none";

  const { error: authError } = await admin.auth.admin.updateUserById(user_id, {
    ban_duration: banDuration,
  });
  if (authError) {
    console.error("[admin-manage-user] auth güncellenemedi:", authError);
    return json({ error: "İşlem gerçekleştirilemedi, tekrar deneyin." }, 500);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_banned: action === "ban" })
    .eq("id", user_id);
  if (profileError) {
    console.error("[admin-manage-user] profil güncellenemedi:", profileError);
    return json({ error: "İşlem gerçekleştirilemedi, tekrar deneyin." }, 500);
  }

  return json({ ok: true, action });
});
