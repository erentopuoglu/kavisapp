// Kavis — admin-moderate-content Edge Function
//
// "Bekleyen Raporlar" ve "Gizlenmiş İçerikler" admin ekranlarındaki
// aksiyonlar buradan geçer — istemci hiçbir zaman is_hidden'ı veya
// reports.status'u doğrudan yazamaz (bkz. guard trigger'lar ve
// reports'un Update: Record<string, never> tipi).
//
// action:
//   'hide'    -> hedef içerik is_hidden=true + o içeriğe ait 'pending'
//                raporlar 'actioned' olur (erken/elle müdahale — normalde
//                submit-report'un kendi kendini onaran taraması 3.
//                raportörle bunu otomatik yapar, admin daha erken
//                davranabiliyor).
//   'dismiss' -> is_hidden'a DOKUNMADAN o içeriğe ait 'pending' raporlar
//                'dismissed' olur (asılsız rapor — bundan sonra
//                submit-report'un taraması bu raporları saymaz).
//   'unhide'  -> hedef içerik is_hidden=false. Geçmiş rapor kayıtlarına
//                dokunmuyor (tarihçe kalsın) — Faz 3'ten beri Teknik Borç
//                olan "itiraz/inceleme mekanizması yok" boşluğunu kısmen
//                kapatan aksiyon budur.
//
// Deploy: supabase functions deploy admin-moderate-content
// Çağırma (istemci): supabase.functions.invoke("admin-moderate-content", { body })

import { MODERATABLE_TABLES } from "../_shared/moderatable.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

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
  const { admin } = auth;

  let body: { content_type?: string; content_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const { content_type, content_id, action } = body;
  if (!content_type || !content_id || !["hide", "unhide", "dismiss"].includes(action ?? "")) {
    return json(
      { error: "content_type, content_id ve action ('hide'|'unhide'|'dismiss') zorunludur." },
      400
    );
  }
  const tableName = MODERATABLE_TABLES[content_type];
  if (!tableName) {
    return json({ error: "Desteklenmeyen içerik türü." }, 400);
  }

  if (action === "hide" || action === "unhide") {
    const { error: updateError } = await admin
      .from(tableName)
      .update({ is_hidden: action === "hide" })
      .eq("id", content_id);
    if (updateError) {
      console.error("[admin-moderate-content] içerik güncellenemedi:", updateError);
      return json({ error: "İşlem gerçekleştirilemedi, tekrar deneyin." }, 500);
    }
  }

  if (action === "hide" || action === "dismiss") {
    const { error: reportsError } = await admin
      .from("reports")
      .update({
        status: action === "hide" ? "actioned" : "dismissed",
        reviewed_at: new Date().toISOString(),
      })
      .eq("content_type", content_type)
      .eq("content_id", content_id)
      .eq("status", "pending");
    if (reportsError) {
      console.error("[admin-moderate-content] raporlar güncellenemedi:", reportsError);
      return json({ error: "İşlem gerçekleştirilemedi, tekrar deneyin." }, 500);
    }
  }

  return json({ ok: true, action });
});
