# kavisapp.com — statik site

`kavisapp.com` için basit, framework'süz bir statik site: bir landing page
(`/`, telefon mockup'ı + alternatif hizalı özellik satırları + "Çıkınca
haber ver" e-posta kaydı + "Kavis Hakkında" bölümü + kapanış CTA'sı), bir
rota vitrini (`/rotalar`, `/rotalar/{slug}` — bkz. aşağıdaki bölüm) ve
mağaza başvuruları için gereken iki yasal sayfa (`/gizlilik`, `/kosullar`).
Bu klasör, ana Expo/React Native uygulamasından tamamen ayrı — sadece
Cloudflare Pages'e deploy edilecek statik dosyaları içerir.

## Rota Vitrini (`/rotalar`, `/rotalar/{slug}`)

Supabase'deki (`routes` tablosu, `is_hidden=false`) tüm rotalar **build
zamanında bir kez** çekilip statik HTML'e dönüştürülüyor — ziyaretçi
tarayıcısı hiçbir zaman Supabase'e istek atmıyor (bkz. `build.mjs`
başındaki uzun yorum). Bunun pratik sonucu: **rota içeriği değiştiğinde
(yeni rota eklendiğinde, `supabase/seed/import_kavis_rotalar.mjs`
çalıştırıldığında vb.) siteyi yeniden derlemeniz (`node web/build.mjs`
veya `master`'a push) gerekir** — aksi halde site eski rota listesini
göstermeye devam eder.

- **Slug:** `routes.slug` kolonundan (bkz. ana repo
  `supabase/migrations/0013_routes_slug.sql`) — DB'de zaten kalıcı ve
  benzersiz, build script'i bunu türetmiyor, olduğu gibi kullanıyor.
- **Harita görselleri:** Her rotanın `path_geojson`'ı Mapbox Static
  Images API'ye (koyu tema, `mapbox/dark-v11` — uygulamadaki
  `Mapbox.StyleURL.Dark` ile aynı) gönderilip PNG BUILD SIRASINDA bir kez
  indirilir, `dist/rotalar/{slug}/harita.png` olarak diske yazılır. Canlı
  bir Mapbox URL'i `<img>`'e gömülmüyor — bu hem siteyi tamamen
  self-hosted tutuyor hem Mapbox faturasını (Static Images API, aylık
  50.000 istek ücretsiz) ziyaretçi sayısından bağımsız, sadece build
  başına yapıyor. Bir rotanın haritası indirilemezse (ağ hatası, eksik
  token) build DURMAZ — o rota haritasız, gradyan arka planla kalır.
- **Bölge filtresi** (`/rotalar` sayfası) tamamen istemci tarafı vanilla
  JS (`site.js`) — `region` alanı "/" ile bölünüp piller üretiliyor,
  filtreleme yeniden sorgu atmadan göster/gizle ile çalışıyor.
- **JSON-LD:** her rota sayfasında `TouristAttraction` + `BreadcrumbList`
  yapılandırılmış verisi var (arama motoru sonuçlarında zengin görünüm
  için).
- **"Uygulamada Aç"** `kavis://rota/{uuid}` derin bağlantısını kullanıyor
  (app.config.ts'teki `scheme:"kavis"` + expo-router'ın dosya tabanlı
  otomatik linkingi — ayrı bir linking config'i yok). Mağaza linki henüz
  olmadığı için "İndir" şimdilik ana sayfadaki bekleme listesine
  yönleniyor.
- **Rotalar hiç çekilemezse** (Supabase yapılandırılmış ama istek
  başarısız — ör. `routes.slug` kolonu henüz eklenmemiş) **build BAŞARISIZ
  olur** (bilerek — sessizce "0 rota" ile eksik bir site yayınlanmasın
  diye). Supabase hiç yapılandırılmamışsa (env değişkenleri yok) build
  BAŞARILI olur ama rota vitrini hiç üretilmez, sadece bir uyarı basılır.

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

`index.html` (landing page metni, "Kavis Hakkında" bölümü) bu JSON'a
bağlı değil — kendi içinde sabit, çünkü uygulama içinde karşılığı olan
bir ekran yok.

## Ekran görüntüleri

Hero'daki telefon mockup'ı ve özellik kartlarındaki küçük resimler şu an
CSS gradyan yer tutucularla gösteriliyor (gerçek bir görsel eksikse
zarifçe bu gradyana düşüyor, kırık görsel ikonu göstermiyor). Gerçek
ekran görüntülerini eklemek için **`web/screenshots/README.md`**'deki
dosya adı/oran/boyut tablosuna bakın — sadece doğru dosya adıyla o
klasöre bırakmanız yeterli, `build.mjs` otomatik olarak `dist/`e kopyalar.

## "Çıkınca haber ver" (bekleme listesi)

Form, `src/content` değil `supabase/migrations/0008_website_waitlist.sql`
ile eklenen `waitlist` tablosuna doğrudan (istemciden, anon key ile)
insert atıyor — bu migration'ı henüz uygulamadıysanız:

```bash
supabase db push
# veya SQL Editor'e migration dosyasının içeriğini yapıştırıp çalıştırın
```

**RLS:** `anon` rolü insert atabilir (e-posta formatı DB'de de kontrol
ediliyor), hiç kimse (anon/authenticated) okuyamaz — sadece Supabase
Dashboard'dan (Table Editor veya SQL Editor, service_role RLS'i bypass
eder) görebilirsiniz:

```sql
select email, created_at from waitlist order by created_at desc;
```

**Spam koruması** iki katmanlı ve bilinçli olarak basit tutuldu (bu
projedeki "düşük riskli, dokümante edilmiş" güvenlik tercihleriyle aynı
kategori — bkz. ana repo README'sindeki rapor hız sınırı bypass'ı):
honeypot alanı (`web/index.html`'deki gizli "website" input'u — gerçek
kullanıcılar görmez/doldurmaz) + DB'de `unique(email)` ve kaba bir e-posta
format kontrolü. Anon insert endpoint'ine doğrudan istek atan sofistike
bir bot bunları atlayabilir — ölçek büyürse Cloudflare Turnstile +
bunu doğrulayan bir Cloudflare Pages Function eklenmesi bir sonraki
adım olurdu (şu an yok).

**Cloudflare Pages ortam değişkenleri (ZORUNLU):** Form, build sırasında
`index.html`'e gömülen Supabase URL/anon key'i kullanıyor (bkz.
`build.mjs`'teki `loadSupabaseEnv()`). Yerelde `../.env`'den otomatik
okunuyor, ama **Cloudflare Pages'te bunu siz eklemelisiniz** — aşağıdaki
deploy adımlarına bakın. Eklemezseniz site yine de build olur ama form
devre dışı görünür ("Kayıt formu şu anda kullanılamıyor.") ve build
logunda bir uyarı basılır.

## Yerel önizleme

```bash
node web/build.mjs        # web/dist üretir
cd web/dist && python3 -m http.server 8080
# tarayıcıda: http://localhost:8080
```

(Python yerine `npx serve web/dist` de kullanılabilir.)

⚠️ `dist/index.html`'i `file://` ile doğrudan çift tıklayıp açmayın —
CSS/görseller kök-göreli yollarla (`/styles.css`) referans veriliyor, bu
sadece gerçek bir HTTP sunucusundan (yukarıdaki gibi, veya Cloudflare
Pages'te) doğru çözümlenir.

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
   - **Environment variables (Advanced)** — "Çıkınca haber ver" formu VE
     rota vitrini için **üçünü de** ekleyin (Production ve Preview için
     ayrı ayrı, veya "Same value for all environments"):
     - `EXPO_PUBLIC_SUPABASE_URL` = `.env`'deki değerle aynı
     - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = `.env`'deki değerle aynı (bu
       anon key zaten public/istemci-güvenli — mobil app bundle'ına da
       gömülü, RLS erişimi belirliyor, secret değil)
     - `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` = `.env`'deki değerle aynı (bu da
       public/pk. token — rota haritası görsellerini build sırasında
       üretmek için gerekli, bkz. "Rota Vitrini" bölümü. Eksikse build
       yine BAŞARILI olur, sadece harita görselleri üretilmez)
4. **Save and Deploy**. İlk deploy birkaç dakika sürer; bitince
   `https://kavisapp.pages.dev` (veya seçtiğiniz isim) üzerinden siteyi
   görebilirsiniz — bu geçici/test adresi. Formu bir test e-postasıyla
   deneyip Supabase Table Editor'de `waitlist` tablosunda göründüğünü
   doğrulayın.
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

Ortam değişkenlerini bu yolda `wrangler pages secret put` ile veya
`wrangler.toml`'da ayarlamanız gerekir. Bu yöntemde her güncellemede
build+deploy komutlarını elle çalıştırmanız gerekir — sürekli
entegrasyon için yukarıdaki Git-bağlantılı yöntem önerilir.

## Store konsollarına verilecek URL

- **Gizlilik Politikası:** `https://kavisapp.com/gizlilik`
- **Kullanım Koşulları:** `https://kavisapp.com/kosullar`

Google Play Console → App content → Privacy policy ve App Store Connect →
App Privacy alanlarına bu URL'leri girin.

## Paylaşım önizlemesi (Open Graph / Twitter Card)

Her sayfa `og:title`/`og:description`/`og:image` + Twitter Card
etiketleri taşıyor, ortak görsel `og-image.png` (1200×630). Yayına
aldıktan sonra gerçekten doğru göründüğünü şuradan test edebilirsiniz:

- WhatsApp: linki kendinize/bir teste gönderin, önizleme yüklenene kadar
  birkaç saniye bekleyin.
- Facebook/Instagram paylaşım kartı: <https://developers.facebook.com/tools/debug/>
  (aynı scraper'ı kullanıyorlar) — "Scrape Again" ile önbelleği
  temizleyebilirsiniz.
- Twitter/X: <https://cards-dev.twitter.com/validator> (bazen giriş ister).

## Favicon / OG görselini yeniden üretme

İkisi de elle çizilmiş bir SVG kaynaktan, headless Chrome ile PNG'ye
render edilerek üretildi (Figma/Sketch gerekmedi). Marka rengi/logosu
değişirse `web/assets-src/`'teki kaynakları düzenleyip yeniden üretin:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd web/assets-src

# favicon (512px master, sonra sips ile küçültülüyor)
"$CHROME" --headless --disable-gpu --window-size=512,512 \
  --screenshot="$(pwd)/favicon-master.png" "file://$(pwd)/favicon-source.html"
sips -z 48 48  favicon-master.png --out ../favicon.png
sips -z 32 32  favicon-master.png --out ../favicon-32.png
sips -z 180 180 favicon-master.png --out ../apple-touch-icon.png

# OG paylaşım görseli (1200×630)
"$CHROME" --headless --disable-gpu --window-size=1200,630 \
  --screenshot="$(pwd)/../og-image.png" "file://$(pwd)/og-source.html"

rm -f favicon-master.png   # sadece ara dosya, commit edilmez
```

## Dosyalar

```
web/
  build.mjs           derleyici script (bağımlılıksız, sadece Node built-in)
  index.html          landing page (hero + özellikler + hakkında + waitlist formu)
  styles.css          tüm sayfalarda paylaşılan stil (koyu tema, turuncu vurgu)
  favicon.png, favicon-32.png, apple-touch-icon.png, og-image.png
                      Chrome headless ile üretilen marka görselleri (bkz. yukarısı)
  robots.txt, sitemap.xml
  screenshots/        gerçek ekran görüntüleri buraya (bkz. screenshots/README.md)
  assets-src/         favicon/OG'nin kaynak HTML'leri (yeniden üretmek için)
  dist/               `node build.mjs` çıktısı — git'e commit edilmez (.gitignore)
```

## Henüz yapılmadı / doldurulmalı

- **Instagram `@kavisapp`, `info@kavisapp.com`:** Header/footer'da bu
  handle/adrese linkleniyor — gerçekten var olduklarından emin olun
  (yoksa oluşturun), yoksa ziyaretçi kırık bir bağlantıya tıklar.
- **Gizlilik/Koşullar içindeki iletişim e-postası:** `src/content/legal.json`'daki
  `[iletişim e-postanızı buraya ekleyin]` yer tutucusu.
