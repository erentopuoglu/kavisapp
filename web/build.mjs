#!/usr/bin/env node
// Kavis — kavisapp.com statik site derleyicisi.
//
// Bağımlılıksız (sadece Node built-in modülleri). İki şey yapıyor:
//   1) src/content/legal.json'ı (uygulamanın Gizlilik/Koşullar ekranlarıyla
//      PAYLAŞILAN TEK KAYNAK) okuyup /gizlilik ve /kosullar sayfalarını
//      üretir — metni burada elle yazmıyoruz, JSON'dan render ediyoruz.
//   2) index.html, styles.css ve favicon'u olduğu gibi dist/'e kopyalar.
//
// Çalıştırma: node build.mjs  (Cloudflare Pages build command'ı budur —
// bkz. web/README.md).

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const webDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(webDir, "..");
const distDir = join(webDir, "dist");

const legal = JSON.parse(readFileSync(join(rootDir, "src/content/legal.json"), "utf8"));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function legalPage({ title, slug, otherSlug, otherTitle, sections }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Kavis</title>
<meta name="robots" content="noindex, follow">
<link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&amp;family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<header class="site-header">
  <div class="site-header-inner">
    <a class="wordmark" href="/">Kavis</a>
    <nav class="site-nav" aria-label="Ana gezinme">
      <a href="/#ozellikler">Özellikler</a>
      <a href="/gizlilik" aria-current="${slug === "gizlilik" ? "page" : "false"}">Gizlilik</a>
      <a href="/kosullar" aria-current="${slug === "kosullar" ? "page" : "false"}">Koşullar</a>
    </nav>
  </div>
</header>

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

<footer class="site-footer">
  <div class="site-footer-inner">
    <span>© 2026 Kavis</span>
    <div class="site-footer-links">
      <a href="/gizlilik">Gizlilik Politikası</a>
      <a href="/kosullar">Kullanım Koşulları</a>
    </div>
  </div>
</footer>

</body>
</html>
`;
}

// --- dist'i sıfırla ---
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

// --- statik dosyalar ---
cpSync(join(webDir, "index.html"), join(distDir, "index.html"));
cpSync(join(webDir, "styles.css"), join(distDir, "styles.css"));
cpSync(join(webDir, "favicon.png"), join(distDir, "favicon.png"));

// --- üretilen yasal sayfalar ---
mkdirSync(join(distDir, "gizlilik"), { recursive: true });
writeFileSync(
  join(distDir, "gizlilik/index.html"),
  legalPage({
    title: legal.privacy.title,
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
    slug: "kosullar",
    otherSlug: "gizlilik",
    otherTitle: legal.privacy.title,
    sections: legal.terms.sections,
  })
);

console.log("web/dist hazır: /, /gizlilik, /kosullar");
