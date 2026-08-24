// Kavis — delete-account Edge Function
//
// AGENTS.md'nin "kullanıcının kurcalamaması gereken mantık ... Edge
// Function'larda çalışacak" kuralı gereği: bir kullanıcının auth.users
// satırını silmek (ve dolayısıyla hesabı tamamen yok etmek) sadece
// service_role ile mümkün — istemci kendi hesabını asla doğrudan silemez.
//
// Akış:
//   1) Çağıranın kimliğini (JWT) doğrula.
//   2) Storage'daki dosyalarını temizle (avatars/{user_id}/*,
//      gpx-files/{user_id}/*) — Storage, DB'nin "on delete cascade"
//      ilişkilerinin KAPSAMI DIŞINDA, bu yüzden açıkça siliniyor.
//      Best-effort: bir bucket'ta hiç dosya yoksa/silme başarısız olursa
//      loglanır ama işlem durmaz (kullanıcı hesabını silebilmeli).
//   3) auth.users satırını sil — `profiles.id references auth.users(id)
//      on delete cascade` ve her diğer tablo (`routes`, `pois`,
//      `forum_questions`, `recorded_rides`, `group_ride_participants`,
//      `blocks`, ...) `profiles(id) on delete cascade` ile bağlı
//      (bkz. 0000_init_schema.sql) — tek bir silme, tüm veriyi temizliyor.
//
// Deploy: supabase functions deploy delete-account
// Çağırma (istemci): supabase.functions.invoke("delete-account")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_OWNED_BUCKETS = ["avatars", "gpx-files"];

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Yetkisiz." }, 401);
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
    return json({ error: "Yetkisiz." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Storage temizliği — hesap silme başarısız olsa bile devam edilir,
  // kullanıcı bir bucket listesi hatası yüzünden hesabını silemez kalmamalı.
  for (const bucket of USER_OWNED_BUCKETS) {
    try {
      const { data: files, error: listError } = await admin.storage.from(bucket).list(user.id);
      if (listError) {
        console.error(`[delete-account] ${bucket} listelenemedi:`, listError);
        continue;
      }
      if (files && files.length > 0) {
        const paths = files.map((file) => `${user.id}/${file.name}`);
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) {
          console.error(`[delete-account] ${bucket} dosyaları silinemedi:`, removeError);
        }
      }
    } catch (err) {
      console.error(`[delete-account] ${bucket} temizlenirken beklenmeyen hata:`, err);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[delete-account] kullanıcı silinemedi:", deleteError);
    return json({ error: "Hesap silinemedi, tekrar deneyin." }, 500);
  }

  return json({ ok: true });
});
