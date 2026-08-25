// Kavis — login-with-username Edge Function
//
// Kullanıcı adıyla giriş, e-postayı istemciye HİÇ çıkarmadan çalışır:
// bu fonksiyon username'i sunucu içinde e-postaya çözer, Supabase Auth'un
// kendi şifre doğrulamasını (signInWithPassword) yine sunucu içinde
// çağırır ve sadece sonuç session'ını (access_token/refresh_token)
// istemciye döner. E-posta hiçbir zaman response'a girmiyor,
// hiçbir tabloya yazılmıyor.
//
// Timing-attack koruması: kullanıcı adı bulunamadığında bile AYNI
// signInWithPassword çağrısı sahte (asla var olamayacak, .invalid TLD'li)
// bir e-postayla yapılıyor — böylece "kullanıcı adı yok" ile "kullanıcı
// adı var, şifre yanlış" yanıtları neredeyse aynı sürede dönüyor (asıl
// maliyet zaten GoTrue'nun şifre karşılaştırması, o her durumda bir kez
// çalışıyor). Hata mesajı da iki durumda BİREBİR AYNI.
//
// Not: Bu, kullanıcı adının kendisini gizlemiyor — profiles tablosu zaten
// herkese açık (rota/POI/forum'da yazar adı olarak her yerde görünüyor),
// gizlenen tek şey hangi kullanıcı adının hangi e-postaya karşılık
// geldiği.
//
// Deploy: supabase functions deploy login-with-username
// Çağırma (istemci): supabase.functions.invoke("login-with-username", { body })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const GENERIC_ERROR = "Kullanıcı adı veya şifre hatalı.";
// RFC 2606 "özel amaçlı" bir TLD — asla gerçek/doğrulanabilir bir alan adı
// olamaz, bu yüzden hiçbir zaman gerçek bir kullanıcıya ait olamaz.
const SENTINEL_EMAIL = "no-such-user@kavis.invalid";

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

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi." }, 400);
  }

  const { username, password } = body;
  if (!username || !password || !USERNAME_PATTERN.test(username.trim().toLowerCase())) {
    return json({ error: GENERIC_ERROR }, 400);
  }
  const normalizedUsername = username.trim().toLowerCase();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Kullanıcı adını e-postaya çöz — bulunamazsa sentinel'e düş, AMA aynı
  // signInWithPassword çağrısını yine de yap (timing eşitleme, yukarıya
  // bakın).
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", normalizedUsername)
    .maybeSingle();

  let targetEmail = SENTINEL_EMAIL;
  if (profile) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(
      (profile as { id: string }).id
    );
    if (!userError && userData.user?.email) {
      targetEmail = userData.user.email;
    }
  }

  // Gerçek şifre doğrulaması — anon key'li normal bir client, istemcinin
  // signInWithEmail'de zaten yaptığının aynısı, sadece burada sunucu
  // içinde ve e-posta hiç dışarı çıkmadan.
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email: targetEmail,
    password,
  });

  if (signInError || !signInData.session) {
    return json({ error: GENERIC_ERROR }, 401);
  }

  return json({
    ok: true,
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  });
});
