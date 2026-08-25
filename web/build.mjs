#!/usr/bin/env node
// Kavis — kavisapp.com statik site derleyicisi.
//
// Bağımlılıksız (sadece Node built-in modülleri). Şunları yapıyor:
//   1) src/content/legal.json'ı (uygulamanın Gizlilik/Koşullar ekranlarıyla
//      PAYLAŞILAN TEK KAYNAK) okuyup /gizlilik ve /kosullar sayfalarını
//      üretir — metni burada elle yazmıyoruz, JSON'dan render ediyoruz.
//   2) index.html'deki __SUPABASE_URL__/__SUPABASE_ANON_KEY__ yer
//      tutucularını gerçek değerlerle değiştirir (bkz. loadSupabaseEnv) —
//      "Çıkınca haber ver" formu bu değerlerle doğrudan Supabase REST'e
//      anon insert atıyor.
//   3) index.html, styles.css, favicon/OG görselleri, robots.txt,
//      sitemap.xml ve screenshots/ altındaki gerçek görselleri (varsa)
//      olduğu gibi dist/'e kopyalar.
//
// Çalıştırma: node build.mjs  (Cloudflare Pages build command'ı budur —
// bkz. web/README.md).

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const webDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(webDir, "..");
const distDir = join(webDir, "dist");

const legal = JSON.parse(readFileSync(join(rootDir, "src/content/legal.json"), "utf8"));

// --- Supabase bağlantı bilgileri --------------------------------------
// Önce gerçek ortam değişkenlerine bakıyoruz (Cloudflare Pages'te proje
// ayarlarından girilir), yoksa yerel geliştirme kolaylığı için
// ana repodaki .env'i (uygulamanın zaten kullandığı
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY) okumayı
// dener. Bu anon key zaten public/istemci-güvenli bir değer (mobil app
// bundle'ına da gömülü) — burada da açığa çıkması güvenlik sorunu değil,
// RLS erişimi belirliyor (bkz. supabase/migrations/0008_website_waitlist.sql).
function loadSupabaseEnv() {
  let url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  let anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (!url || !anonKey) {
    const envPath = join(rootDir, ".env");
    if (existsSync(envPath)) {
      const parsed = {};
      for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        parsed[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
      url = url || parsed.EXPO_PUBLIC_SUPABASE_URL || "";
      anonKey = anonKey || parsed.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
    }
  }

  if (!url || !anonKey) {
    console.warn(
      "[build] UYARI: Supabase URL/anon key bulunamadı — 'Çıkınca haber ver' formu " +
        "yayınlanan sitede devre dışı görünecek. Cloudflare Pages'te " +
        "EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY ortam " +
        "değişkenlerini ekleyin (bkz. web/README.md)."
    );
  }

  return { url, anonKey };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// --- ortak header/footer (index.html'deki ile aynı tutulmalı) ---------

function siteHeader(activeSlug) {
  const navLink = (href, label, slug) =>
    `<a href="${href}"${slug && slug === activeSlug ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="site-header">
  <div class="site-header-inner">
    <a class="wordmark" href="/">Kavis</a>
    <div class="site-header-actions">
      <nav class="site-nav" aria-label="Ana gezinme">
        ${navLink("/#ozellikler", "Özellikler")}
        ${navLink("/#hakkinda", "Hakkında")}
        ${navLink("/gizlilik", "Gizlilik", "gizlilik")}
        ${navLink("/kosullar", "Koşullar", "kosullar")}
      </nav>
      <a class="icon-link" href="https://instagram.com/kavisapp" target="_blank" rel="noopener noreferrer" aria-label="Kavis'i Instagram'da takip edin (@kavisapp)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"></circle></svg>
      </a>
    </div>
  </div>
</header>`;
}

function siteFooter() {
  return `<footer class="site-footer">
  <div class="site-footer-inner">
    <span>© 2026 Kavis. Tüm hakları saklıdır.</span>
    <div class="site-footer-links">
      <a href="/gizlilik">Gizlilik Politikası</a>
      <a href="/kosullar">Kullanım Koşulları</a>
      <a href="mailto:info@kavisapp.com">info@kavisapp.com</a>
      <a class="icon-link" href="https://instagram.com/kavisapp" target="_blank" rel="noopener noreferrer" aria-label="Kavis'i Instagram'da takip edin (@kavisapp)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.2"></circle><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"></circle></svg>
      </a>
    </div>
  </div>
</footer>`;
}

function renderClauses(sections) {
  return sections
    .map(
      (section) => `      <section class="clause">
        <h2>${escapeHtml(section.title)}</h2>
${section.paragraphs.map((paragraph) => `        <p>${escapeHtml(paragraph)}</p>`).join("\n")}
      </section>`
    )
    .join("\n");
}

function legalPage({ title, description, slug, otherSlug, otherTitle, sections }) {
  const url = `https://kavisapp.com/${slug}`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Kavis</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${url}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Kavis">
<meta property="og:locale" content="tr_TR">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${escapeHtml(title)} — Kavis">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="https://kavisapp.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)} — Kavis">
<meta name="twitter:image" content="https://kavisapp.com/og-image.png">

<link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32">
<link rel="icon" type="image/png" href="/favicon.png" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&amp;family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${siteHeader(slug)}

<main>
  <div class="legal-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="updated">Son güncelleme: ${escapeHtml(legal.lastUpdated)}</div>
    <div class="lane" aria-hidden="true"></div>
    <div class="draft-banner" role="note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <p>Bu metin bir taslaktır, hukuki tavsiye niteliği taşımaz. Gerçek bir mağaza başvurusundan önce bir hukuk danışmanına gösterilmesi ve iletişim bilgisi yer tutucusunun doldurulması önerilir.</p>
    </div>
    <a class="other-doc-link" href="/${otherSlug}">${escapeHtml(otherTitle)} →</a>
  </div>

  <div class="legal-body">
${renderClauses(sections)}
  </div>
</main>

${siteFooter()}

</body>
</html>
`;
}

// --- statik dosya kopyalama yardımcıları -------------------------------

function copyIfExists(src, destName) {
  const srcPath = join(webDir, src);
  if (!existsSync(srcPath)) return;
  cpSync(srcPath, join(distDir, destName ?? src));
}

// --- dist'i sıfırla ---
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// --- index.html: Supabase yer tutucularını doldurup yaz ---
const { url: supabaseUrl, anonKey: supabaseAnonKey } = loadSupabaseEnv();
let indexHtml = readFileSync(join(webDir, "index.html"), "utf8");
indexHtml = indexHtml
  .replaceAll("__SUPABASE_URL__", supabaseUrl)
  .replaceAll("__SUPABASE_ANON_KEY__", supabaseAnonKey);
writeFileSync(join(distDir, "index.html"), indexHtml);

// --- diğer statik dosyalar ---
copyIfExists("styles.css");
copyIfExists("favicon.png");
copyIfExists("favicon-32.png");
copyIfExists("apple-touch-icon.png");
copyIfExists("og-image.png");
copyIfExists("robots.txt");
copyIfExists("sitemap.xml");

// screenshots/ — henüz gerçek görsel yoksa dizin boş olabilir, o zaman
// hiçbir şey kopyalanmaz (placeholder gradyanlar zaten görsel 404
// olduğunda da düzgün görünüyor, bkz. styles.css .phone-screen/.feature-thumb).
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
const screenshotsSrc = join(webDir, "screenshots");
if (existsSync(screenshotsSrc)) {
  const files = readdirSync(screenshotsSrc).filter(
    (f) => !f.startsWith(".") && IMAGE_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext))
  );
  if (files.length > 0) {
    mkdirSync(join(distDir, "screenshots"), { recursive: true });
    for (const file of files) {
      cpSync(join(screenshotsSrc, file), join(distDir, "screenshots", file));
    }
  }
}

// --- üretilen yasal sayfalar ---
mkdirSync(join(distDir, "gizlilik"), { recursive: true });
writeFileSync(
  join(distDir, "gizlilik/index.html"),
  legalPage({
    title: legal.privacy.title,
    description: "Kavis mobil uygulamasının gizlilik politikası — hangi verilerin toplandığı, nasıl kullanıldığı ve haklarınız.",
    slug: "gizlilik",
    otherSlug: "kosullar",
    otherTitle: legal.terms.title,
    sections: legal.privacy.sections,
  })
);

mkdirSync(join(distDir, "kosullar"), { recursive: true });
writeFileSync(
  join(distDir, "kosullar/index.html"),
  legalPage({
    title: legal.terms.title,
    description: "Kavis mobil uygulamasının kullanım koşulları.",
    slug: "kosullar",
    otherSlug: "gizlilik",
    otherTitle: legal.privacy.title,
    sections: legal.terms.sections,
  })
);

console.log("web/dist hazır: /, /gizlilik, /kosullar" + (supabaseUrl && supabaseAnonKey ? "" : " (waitlist formu YAPILANDIRILMADI)"));
