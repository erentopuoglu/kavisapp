// Kavis — submit-report Edge Function
//
// AGENTS.md'nin "kullanıcının kurcalamaması gereken mantık ... Edge
// Function'larda çalışacak" kuralı gereği: rapor sayımı, hız sınırı ve
// içerik gizleme kararı burada, service_role ile, tamamen istemciden
// bağımsız olarak veriliyor.
//
// Akış:
//   1) Çağıranın kimliğini (JWT) doğrula.
//   2) Hız sınırı: son 1 saatte bu kullanıcıdan >=5 rapor varsa reddet.
//   3) Raporu ekle.
//   4) Kendi kendini onaran tarama: SADECE bu çağrıya konu içeriği değil,
//      eşiği (3 farklı raportör) geçmiş ama hâlâ gizlenmemiş TÜM içerikleri
//      tarayıp gizler — kaçırılan/başarısız çağrılar kendini onarır.
//
// Deploy: supabase functions deploy submit-report
// Çağırma (istemci): supabase.functions.invoke("submit-report", { body })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { MODERATABLE_TABLES } from "../_shared/moderatable.ts";

const RATE_LIMIT_PER_HOUR = 5;
const HIDE_THRESHOLD = 3;

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

  // Çağıranın kimliğini doğrulamak için: anon key + çağıranın kendi JWT'si.
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

  let body: { content_type?: string; content_id?: string; reason?: string; details?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const { content_type, content_id, reason, details } = body;
  if (!content_type || !content_id || !reason) {
    return json({ error: "content_type, content_id ve reason zorunludur." }, 400);
  }
  if (!(content_type in MODERATABLE_TABLES)) {
    return json({ error: "Desteklenmeyen içerik türü." }, 400);
  }

  // service_role: RLS'i bypass ederek hız sınırı sayımı + ekleme + tarama.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 1) Hız sınırı — son 1 saatte bu kullanıcıdan en fazla 5 rapor.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countError } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error("[submit-report] hız sınırı sayılamadı:", countError);
    return json({ error: "Rapor gönderilemedi, tekrar deneyin." }, 500);
  }
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return json(
      { error: "Saatte en fazla 5 rapor gönderebilirsiniz. Lütfen daha sonra tekrar deneyin." },
      429
    );
  }

  // 2) Raporu ekle.
  const { error: insertError } = await admin.from("reports").insert({
    reporter_id: user.id,
    content_type,
    content_id,
    reason,
    details: details ?? null,
  });
  if (insertError) {
    console.error("[submit-report] rapor eklenemedi:", insertError);
    return json({ error: "Rapor kaydedilemedi." }, 500);
  }

  // 3) Kendi kendini onaran tarama.
  await sweepAndHideReportedContent(admin);

  return json({ ok: true });
});

async function sweepAndHideReportedContent(
  admin: ReturnType<typeof createClient>
): Promise<void> {
  for (const [contentType, tableName] of Object.entries(MODERATABLE_TABLES)) {
    const { data: pending, error } = await admin
      .from("reports")
      .select("content_id, reporter_id")
      .eq("content_type", contentType)
      .eq("status", "pending");

    if (error || !pending) {
      if (error) console.error(`[submit-report] tarama okunamadı (${contentType}):`, error);
      continue;
    }

    const reportersByContent = new Map<string, Set<string>>();
    for (const row of pending as { content_id: string; reporter_id: string }[]) {
      const set = reportersByContent.get(row.content_id) ?? new Set<string>();
      set.add(row.reporter_id);
      reportersByContent.set(row.content_id, set);
    }

    for (const [contentId, reporters] of reportersByContent) {
      if (reporters.size < HIDE_THRESHOLD) continue;

      const { data: target } = await admin
        .from(tableName)
        .select("is_hidden")
        .eq("id", contentId)
        .maybeSingle();

      // İçerik zaten gizli ya da (silinmiş olabilir) bulunamadı — atla.
      if (!target || (target as { is_hidden: boolean }).is_hidden) continue;

      await admin.from(tableName).update({ is_hidden: true }).eq("id", contentId);
      await admin
        .from("reports")
        .update({ status: "actioned", reviewed_at: new Date().toISOString() })
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .eq("status", "pending");
    }
  }
}
