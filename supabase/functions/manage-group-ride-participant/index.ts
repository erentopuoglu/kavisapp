// Kavis — manage-group-ride-participant Edge Function
//
// AGENTS.md'nin "kullanıcının kurcalamaması gereken mantık ... Edge
// Function'larda çalışacak" kuralı gereği: katılım isteğini onaylama/
// reddetme RLS ile zaten mümkün (etkinlik sahibi kendi güncelleyebilir),
// ama "kontenjan (max_participants) dolduysa onaylama" iş kuralı RLS'te
// güvenilir şekilde ifade edilemez (yarış durumu + client'ın sayımı
// kurcalayabilmesi riski) — bu yüzden burada, service_role ile.
//
// Akış:
//   1) Çağıranın kimliğini (JWT) doğrula.
//   2) Çağıranın bu etkinliğin sahibi olduğunu doğrula.
//   3) action = 'approve' ise: kontenjan kontrolü + status -> 'approved'.
//      action = 'reject' ise: status -> 'rejected'.
//
// Deploy: supabase functions deploy manage-group-ride-participant
// Çağırma (istemci): supabase.functions.invoke("manage-group-ride-participant", { body })

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

  let body: { ride_id?: string; participant_user_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const { ride_id, participant_user_id, action } = body;
  if (!ride_id || !participant_user_id || (action !== "approve" && action !== "reject")) {
    return json({ error: "ride_id, participant_user_id ve action ('approve'|'reject') zorunludur." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: ride, error: rideError } = await admin
    .from("group_rides")
    .select("id, creator_id, max_participants, status")
    .eq("id", ride_id)
    .maybeSingle();

  if (rideError || !ride) {
    return json({ error: "Etkinlik bulunamadı." }, 404);
  }
  const rideRow = ride as { id: string; creator_id: string; max_participants: number | null; status: string };
  if (rideRow.creator_id !== user.id) {
    return json({ error: "Bu işlemi sadece etkinlik sahibi yapabilir." }, 403);
  }

  const { data: participant, error: participantError } = await admin
    .from("group_ride_participants")
    .select("id, status")
    .eq("ride_id", ride_id)
    .eq("user_id", participant_user_id)
    .maybeSingle();

  if (participantError || !participant) {
    return json({ error: "Katılım isteği bulunamadı." }, 404);
  }
  const participantRow = participant as { id: string; status: string };
  if (participantRow.status !== "requested") {
    return json({ error: "Bu istek zaten yanıtlanmış." }, 409);
  }

  if (action === "reject") {
    await admin
      .from("group_ride_participants")
      .update({ status: "rejected", responded_at: new Date().toISOString() })
      .eq("id", participantRow.id);
    return json({ ok: true, status: "rejected" });
  }

  // action === "approve" — kontenjan kontrolü.
  if (rideRow.max_participants !== null) {
    const { count: approvedCount, error: countError } = await admin
      .from("group_ride_participants")
      .select("id", { count: "exact", head: true })
      .eq("ride_id", ride_id)
      .eq("status", "approved");

    if (countError) {
      console.error("[manage-group-ride-participant] kontenjan sayılamadı:", countError);
      return json({ error: "İşlem gerçekleştirilemedi, tekrar deneyin." }, 500);
    }
    if ((approvedCount ?? 0) >= rideRow.max_participants) {
      return json({ error: "Etkinlik kontenjanı dolu." }, 409);
    }
  }

  await admin
    .from("group_ride_participants")
    .update({ status: "approved", responded_at: new Date().toISOString() })
    .eq("id", participantRow.id);

  return json({ ok: true, status: "approved" });
});
