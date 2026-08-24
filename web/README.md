# kavisapp.com — statik site

`kavisapp.com` için basit, framework'süz bir statik site: bir landing page
(`/`) ve mağaza başvuruları için gereken iki yasal sayfa (`/gizlilik`,
`/kosullar`). Bu klasör, ana Expo/React Native uygulamasından tamamen
ayrı — sadece Cloudflare Pages'e deploy edilecek statik dosyaları içerir.

## Tek kaynak (single source of truth)

`/gizlilik` ve `/kosullar` sayfalarındaki metinler burada elle yazılmıyor.
İkisi de `../src/content/legal.json`'dan üretiliyor — **uygulama
içindeki `src/app/gizlilik-politikasi.tsx` ve `src/app/kullanim-kosullari.tsx`
ekranlarıyla aynı JSON**. Metni güncellemeniz gerektiğinde:

1. SADECE `src/content/legal.json`'ı düzenleyin.
2. `node web/build.mjs` çalıştırın (veya Cloudflare Pages'e push edin —
   build otomatik çalışır).

Uygulama ekranı ile web sayfası otomatik olarak aynı kalır; ikisini ayrı
ayrı güncellemeniz gerekmez.

`index.html` (landing page metni) bu JSON'a bağlı değil — kendi içinde
sabit, çünkü uygulama içinde karşılığı olan bir ekran yok.

## Yerel önizleme

```bash
node web/build.mjs        # web/dist üretir
cd web/dist && python3 -m http.server 8080
# tarayıcıda: http://localhost:8080
```

(Python yerine `npx serve web/dist` de kullanılabilir.)

## Cloudflare Pages'e deploy — adım adım

Domain (`kavisapp.com`) zaten Cloudflare'de kayıtlı olduğu için özel
domain bağlama adımı tek tıkla oluyor (ayrı bir DNS sağlayıcısıyla
uğraşmıyorsunuz).

1. **Cloudflare Dashboard** → sol menüden **Workers & Pages** → **Create
   application** → **Pages** sekmesi → **Connect to Git**.
2. GitHub hesabınızı bağlayın (ilk kez bağlıyorsanız yetki isteyecek) ve
   **erentopuoglu/kavisapp** reposunu seçin.
3. **Set up builds and deployments** ekranında:
   - **Project name:** `kavisapp` (veya istediğiniz bir isim — bu, ilk
     etapta `<isim>.pages.dev` adresinizi belirler).
   - **Production branch:** `master`.
   - **Framework preset:** `None`.
   - **Build command:** `node build.mjs`
   - **Build output directory:** `dist`
   - **Root directory (Advanced):** `web` — **bu adım kritik**, aksi halde
     Cloudflare repo kökünde `build.mjs` arar ve bulamaz.
4. **Save and Deploy**. İlk deploy birkaç dakika sürer; bitince
   `https://kavisapp.pages.dev` (veya seçtiğiniz isim) üzerinden siteyi
   görebilirsiniz — bu geçici/test adresi.
5. Deploy bittikten sonra proje sayfasında **Custom domains** sekmesine
   gidin → **Set up a custom domain** → `kavisapp.com` yazın → **Continue**.
   Domain zaten aynı Cloudflare hesabında kayıtlı olduğu için gerekli DNS
   kaydı otomatik oluşturulur, ekstra bir şey yapmanıza gerek yok.
   İsterseniz aynı adımı `www.kavisapp.com` için de tekrarlayıp
   apex'e yönlendirebilirsiniz.
6. DNS/SSL aktivasyonu genelde birkaç dakika içinde tamamlanır (aynı
   Cloudflare hesabı içinde olduğu için çok hızlı). Tamamlandığında
   `https://kavisapp.com`, `https://kavisapp.com/gizlilik` ve
   `https://kavisapp.com/kosullar` adreslerinin açıldığını doğrulayın.

Bundan sonra `master`'a her push, siteyi otomatik olarak yeniden derleyip
deploy eder — `src/content/legal.json`'ı güncelleyip push etmeniz yeterli.

### Alternatif: Git bağlamadan tek seferlik deploy

Git entegrasyonu istemiyorsanız (`wrangler` CLI ile):

```bash
npm install -g wrangler   # veya npx ile
wrangler login
node web/build.mjs
wrangler pages deploy web/dist --project-name=kavisapp
```

Bu yöntemde her güncellemede build+deploy komutlarını elle çalıştırmanız
gerekir — sürekli entegrasyon için yukarıdaki Git-bağlantılı yöntem
önerilir.

## Store konsollarına verilecek URL

- **Gizlilik Politikası:** `https://kavisapp.com/gizlilik`
- **Kullanım Koşulları:** `https://kavisapp.com/kosullar`

Google Play Console → App content → Privacy policy ve App Store Connect →
App Privacy alanlarına bu URL'leri girin.

## Dosyalar

```
web/
  build.mjs      derleyici script (bağımlılıksız, sadece Node built-in)
  index.html     landing page (sabit içerik)
  styles.css     tüm sayfalarda paylaşılan stil (koyu tema, turuncu vurgu)
  favicon.png    assets/images/favicon.png'nin kopyası
  dist/          `node build.mjs` çıktısı — git'e commit edilmez (.gitignore)
```
