// Kavis — end-group-ride Edge Function
//
// Bir grup sürüşünü 'active' -> 'completed' durumuna geçirir ve o sürüşe
// ait TÜM live_locations satırlarını siler. İkinci kısım Edge Function
// gerektirir: bir katılımcı sadece KENDİ live_locations satırını silebilir
// (RLS `live_locations_delete_own`), ama sürüş bittiğinde TÜM katılımcıların
// konumunun kalıcı olarak silinmesi gerekiyor (bkz. AGENTS.md/README —
// canlı konum kalıcı saklanmaz kararı) — bu ancak service_role ile olur.
//
// Deploy: supabase functions deploy end-group-ride
// Çağırma (istemci): supabase.functions.invoke("end-group-ride", { body })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let body: { ride_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const { ride_id } = body;
  if (!ride_id) {
    return json({ error: "ride_id zorunludur." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: ride, error: rideError } = await admin
    .from("group_rides")
    .select("id, creator_id, status")
    .eq("id", ride_id)
    .maybeSingle();

  if (rideError || !ride) {
    return json({ error: "Etkinlik bulunamadı." }, 404);
  }
  const rideRow = ride as { id: string; creator_id: string; status: string };
  if (rideRow.creator_id !== user.id) {
    return json({ error: "Bu işlemi sadece etkinlik sahibi yapabilir." }, 403);
  }
  if (rideRow.status !== "active") {
    return json({ error: "Sadece aktif bir sürüş bitirilebilir." }, 409);
  }

  const { error: updateError } = await admin
    .from("group_rides")
    .update({ status: "completed" })
    .eq("id", ride_id);
  if (updateError) {
    console.error("[end-group-ride] durum güncellenemedi:", updateError);
    return json({ error: "Sürüş bitirilemedi, tekrar deneyin." }, 500);
  }

  const { error: deleteError } = await admin.from("live_locations").delete().eq("ride_id", ride_id);
  if (deleteError) {
    console.error("[end-group-ride] canlı konumlar silinemedi:", deleteError);
  }

  return json({ ok: true });
});
