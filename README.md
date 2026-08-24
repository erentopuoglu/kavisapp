# Kavis

Motosikletçiler için rota keşfi, GPX kaydı, topluluk işaret noktaları, grup
sürüşleri ve soru-cevap forumu barındıran mobil uygulama.

- **Stack:** React Native + Expo (TypeScript, strict) · Supabase (Auth,
  PostgreSQL + PostGIS, Realtime, Storage, Edge Functions) · Mapbox (harita) ·
  Zustand · Expo Router · EAS Build
- **Dil:** Arayüz Türkçe, koyu tema.

## Klasör Yapısı

```
src/
  app/                    Expo Router — sadece ekran/route tanımları
    (auth)/               giriş, kayıt, şifremi unuttum
    (tabs)/                keşfet, harita, etkinlikler, sürüş kaydı, forum, profil
  features/               feature-based iş mantığı (auth, routes, recording,
                           poi, group-rides, forum, blocks, moderation, profile)
    auth/
      api/                Supabase çağrıları
      store/              Zustand store (session, profile)
      types.ts
  shared/
    components/           Button, TextField, AppText, ScreenContainer...
    theme/                colors, spacing, typography (koyu tema)
  lib/
    supabase/             client.ts, types.ts (Database tipi)
    map/                  MapService.tsx — TEK harita soyutlama katmanı
                           (Mapbox'a özgü kod sadece burada yaşar).
                           index.ts, Expo Go'da otomatik olarak
                           MapService.expo-go.tsx'e (mock) düşer — bkz.
                           "Expo Go ile geliştirme".
  content/
    legal.json             Gizlilik/Koşullar metinleri — TEK KAYNAK; hem
                            uygulama ekranları hem web/build.mjs bunu okur.
supabase/
  migrations/              0000_init_schema.sql — tüm tablolar + RLS
  tests/                   RLS smoke test script'leri
  functions/               Edge Function'lar (submit-report, delete-account, ...)
web/
  (ayrı, framework'süz statik site — kavisapp.com/Cloudflare Pages için;
  bkz. web/README.md)
```

### Harita soyutlaması

Uygulama Mapbox kullanıyor, ancak hiçbir ekran `@rnmapbox/maps`'i doğrudan
import etmiyor — hepsi `src/lib/map/index.ts` üzerinden geçiyor (`AppMapView`,
`AppMapMarker`, `AppMapPolyline`). Mapbox'ın 25.000 MAU'luk ücretsiz sınırına
yaklaşılırsa, sağlayıcı değişimi (örn. MapLibre + MapTiler/self-host) sadece
`MapService.tsx`'in yeniden yazılmasını gerektirir; geri kalan kod değişmez.

`index.ts` ayrıca çalışma zamanında Expo Go'da mı yoksa bir development
build'te mi olduğumuza bakıp iki implementasyondan birini seçiyor:
`MapService.tsx` (gerçek Mapbox) veya `MapService.expo-go.tsx` (Expo Go'da
gerçek harita yerine veri özeti gösteren mock) — bkz. aşağıdaki "Expo Go ile
geliştirme".

## Faz 0 — Kurulum ve Test

### 1) Bağımlılıklar

```bash
npm install
```

### 2) Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayın ve doldurun:

```bash
cp .env.example .env
```

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase
  Dashboard → Project Settings → API.
- `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`: Mapbox Dashboard → Tokens (public scope).
- `MAPBOX_DOWNLOADS_TOKEN`: Mapbox Dashboard → Tokens → "Downloads:Read"
  scope'lu secret token. Sadece native build sırasında (Gradle/CocoaPods)
  kullanılır, uygulamaya gömülmez.

### 3) Supabase projesini kurma

1. [supabase.com](https://supabase.com) üzerinde yeni proje oluşturun (veya
   local geliştirme için `supabase start` — Supabase CLI gerekir).
2. Migration'ı uygulayın:
   ```bash
   supabase link --project-ref <proje-ref>
   supabase db push
   ```
   (veya SQL Editor'e `supabase/migrations/0000_init_schema.sql` içeriğini
   yapıştırıp çalıştırın.)

   Bu migration'ı **zaten uyguladıysanız** (0000 dosyasının önceki bir
   sürümüyle), ek olarak `supabase/migrations/0001_grants.sql` içeriğini de
   SQL Editor'de çalıştırın — eksik şema yetkilerini ekler ve
   "permission denied for table X (42501)" hatasını çözer. Yeni bir
   projede sıfırdan kuruyorsanız buna gerek yok, güncel 0000 dosyası bu
   yetkileri zaten içeriyor.
3. **Authentication → Providers** altında Email ve Google sağlayıcılarını
   etkinleştirin. Google için Google Cloud Console'da OAuth Client ID/Secret
   oluşturup Supabase'e girmeniz gerekir.
4. **Authentication → URL Configuration** altına redirect URL olarak
   `kavis://auth-callback` ekleyin (Google OAuth akışı için).
5. Tipleri projeye senkronize edin (opsiyonel ama önerilir):
   ```bash
   npm run gen:types
   ```

### 4) Mapbox hesabı

1. [mapbox.com](https://account.mapbox.com) üzerinde hesap açın.
2. Varsayılan **public token**'ı `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` olarak
   kullanın.
3. **Tokens → Create a token** ile `Downloads:Read` scope'lu bir **secret
   token** oluşturun, bunu `MAPBOX_DOWNLOADS_TOKEN` olarak kullanın (yerel
   build için terminal ortam değişkeni, EAS için `eas secret:create`).

### 5) Development Client ile çalıştırma

Mapbox ve arka plan konum takibi gibi custom native modüller içerdiği için
uygulamanın **tam işlevli hali Expo Go'da çalışmaz** — bir Development
Client build'i gerekir:

```bash
npx expo prebuild
npx expo run:android   # veya: npx expo run:ios (macOS + Xcode gerekir)
```

Ardından geliştirme sırasında:

```bash
npm start
```

Development Client build'i alacak donanımınız/hesabınız yoksa (emulator
kuramıyorsanız, fiziksel Android cihazınız yoksa, Apple Developer Program
ücretini ($99/yıl) ödemek istemiyorsanız) aşağıdaki "Expo Go ile geliştirme"
bölümüne bakın — geliştirmenin büyük kısmı ücretsiz şekilde Expo Go'da
sürdürülebilir.

### 5b) Expo Go ile geliştirme (development client olmadan)

`npx expo start` ile Expo Go üzerinden QR kod okutup çalıştırabilirsiniz —
kurulum, hesap veya ücret gerektirmez. `src/lib/map/index.ts` çalışma
zamanında Expo Go'da olduğunu algılayıp haritayı otomatik olarak mock'a
düşürür, elle bir şey yapmanız gerekmez.

**Expo Go'da çalışan (test edilebilir):**

- Auth akışı (e-posta + Google OAuth), Supabase sorguları, Realtime, forum,
  POI listesi/detayı, grup sürüşü sohbet ve katılımcı akışları.
- Canlı Takip ekranındaki **foreground** konum paylaşımı
  (`useLiveLocationSharing` — zaten sadece ekran açıkken çalışacak şekilde
  tasarlandı, bkz. "Teknik Borç (Faz 4 ekleri)").
- GPX dışa aktarma/paylaşma (`expo-file-system` yeni File/Paths API +
  `expo-sharing`) ve içe aktarma (`expo-document-picker`) — ikisi de resmi
  Expo dokümantasyonuna göre Expo Go'da destekleniyor.
- Harita ekranları **açılır ve veri akışı doğrulanabilir**, ama gerçek harita
  yerine bir özet kutusu görürsünüz (kaç çizgi/rota, kaç işaretçi render
  edilmeye çalışıldığı, hesaplanan merkez koordinatı; `onMapPress` akışını
  sahte bir koordinatla tetikleyen bir buton da var) — bkz.
  `src/lib/map/MapService.expo-go.tsx`.

**Expo Go'da çalışmayan / dikkat edilmesi gerekenler:**

- **Gerçek harita render'ı:** `@rnmapbox/maps` Expo Go binary'sine gömülü
  değil. Pan/zoom, katman stili, gerçek kullanıcı konumu ikonu gibi görsel
  şeyleri görmek için Development Client şart.
- **Sürüş kaydı (arka plan konum takibi):** "Sürüş Kaydı" ekranı
  `Location.startLocationUpdatesAsync()` çağırıyor
  (`src/lib/location/backgroundTracking.ts`). Resmi Expo dokümantasyonuna
  göre bu API **hem iOS hem Android'de Expo Go'da desteklenmiyor** (iOS'ta
  sadece Simulator'da çalışıyor, gerçek cihazda değil) — üstelik
  `expo-location` bunun için hata fırlatmak yerine sadece bir konsol uyarısı
  basıyor, yani native çağrı sessizce başarısız kalabilirdi.
  `backgroundTracking.ts`, `isRunningInExpoGo()` ile bunu native çağrıyı hiç
  denemeden önceden tespit edip anlaşılır bir hata fırlatıyor
  ("Sürüş kaydı Expo Go'da çalışmıyor — Development Client build'i
  gerekiyor."); bu hata "Sürüş Kaydı Başlat" ekranındaki mevcut
  try/catch'e düşüp `Alert` olarak gösteriliyor. Yine de gerçek harita
  render'ını ve fiili arka plan takibini test etmek için Development
  Client gerekir.
- **`expo-glass-effect`:** Şu an kod tabanında hiçbir yerde kullanılmıyor, bu
  yüzden ona özel bir Expo Go mock'u eklenmedi. İleride kullanmaya
  başladığınızda da muhtemelen ekstra işe gerek kalmayacak: modül resmi
  olarak Expo Go'da destekleniyor ve zaten kendi içinde iOS 26'dan düşük
  sürümlerde (Expo Go'nun çalıştığı çoğu gerçek cihaz dahil) normal `View`'a
  fallback yapıyor.

Native bir bağımlılık eklediğinizde veya yukarıdaki iki maddeyi test etmeniz
gerektiğinde Development Client'a geçin (bkz. yukarıdaki madde 5).

### 6) Faz 0 Test Adımları (manuel)

- [ ] `npx tsc --noEmit` hatasız geçiyor.
- [ ] `npx expo lint` hatasız geçiyor.
- [ ] Uygulama açılışta giriş ekranını gösteriyor (oturum yoksa).
- [ ] E-posta ile **Kayıt Ol** → Supabase Dashboard → Table Editor →
      `profiles` tablosunda otomatik oluşan satırı doğrulayın (`handle_new_user`
      trigger'ı çalışıyor).
- [ ] E-posta ile **Giriş Yap** → Keşfet sekmesine yönleniyor.
- [ ] **Google ile Giriş Yap** → tarayıcı açılıp Supabase'e dönüyor, oturum
      açılıyor.
- [ ] **Şifremi Unuttum** → e-postaya sıfırlama bağlantısı geliyor.
- [ ] Profil sekmesinde kullanıcı adı/e-posta görünüyor, **Çıkış Yap**
      çalışıyor ve giriş ekranına dönüyor.
- [ ] Uygulamayı kapatıp yeniden açtığınızda oturum korunuyor (AsyncStorage).

### 7) RLS Testleri

`supabase/tests/0000_rls_smoke_tests.sql` — iki test kullanıcısı (A ve B)
oluşturup şu senaryoları doğrular (hepsi transaction içinde, sonunda
`ROLLBACK` ile temizlenir):

- Kullanıcı B, kullanıcı A'nın profilini/rotasını güncelleyemez/silemez.
- Kullanıcı kendi `is_banned` / `is_hidden` alanını client üzerinden
  değiştiremez (guard trigger).
- Kullanıcı kendi POI'sine oy veremez.
- Bir grup sürüşünde onaylanmamış katılımcı canlı konum paylaşamaz; sürüş
  "active" olmadan onaylı katılımcı bile paylaşamaz; sürüşle ilgisi olmayan
  biri canlı konumu göremez.
- Kullanıcı başkasının içerik raporunu göremez.

Çalıştırma (yalnızca **local** veya **staging** projede):

```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
  -f supabase/tests/0000_rls_smoke_tests.sql
```

Script sonunda `=== TÜM RLS SMOKE TESTLERİ BAŞARIYLA GEÇTİ ===` mesajını
görmelisiniz. Herhangi bir test başarısız olursa script bir `EXCEPTION` ile
durur ve hangi tablo/senaryonun başarısız olduğunu yazar.

⚠️ Bu script'i **production projesinde çalıştırmayın** — `auth.users`
tablosuna doğrudan test kullanıcısı ekler.

## Faz 1 — Kurulum ve Test

Yeni npm bağımlılığı yok. **Ama Supabase projenize iki yeni migration
uygulamanız gerekiyor (sırayla):**

```
supabase/migrations/0002_faz1_route_constraints.sql
supabase/migrations/0003_route_path_geojson.sql
```

`0002` şunları ekler:
- `routes.path` için 500 nokta üst sınırı (`routes_path_point_limit`)
- `nearby_routes(user_lng, user_lat, radius_meters)` RPC'si ("yakınımdaki rotalar")
- `increment_route_view_count(p_route_id)` RPC'si (rota görüntülenme sayacı)
- `route_ratings` insert/update politikalarına "kendi rotanı puanlayamazsın" kısıtı

`0003` bir **bug düzeltmesi**: PostgREST, `geography` sütunlarını (routes.path)
varsayılan olarak GeoJSON değil EWKB hex metni olarak döndürüyor — bu yüzden
rota çizgileri haritada hiç görünmüyordu. Bu migration `routes.path_geojson`
adında otomatik senkronlanan bir sütun ekliyor ve mevcut satırları (test
rotanız dahil) geriye dönük dolduruyor. Ayrıntı için dosyanın başındaki
yorumlara bakın.

### Test Adımları (manuel)

- [ ] **Harita** sekmesinde sağ alttaki **+** butonuna basın → haritaya
      dokunarak en az 2 nokta ekleyin → **İleri** → başlık girip
      **Kaydet** → rota detay sayfasına yönlendirilmelisiniz.
- [ ] Yeni rota **Keşfet** sekmesinde ve **Harita**'da bir çizgi olarak
      görünmeli.
- [ ] Rota detayında haritanın rotanın tamamını kapsayacak şekilde
      otomatik yakınlaştığını doğrulayın.
- [ ] **Başka bir kullanıcıyla** girip o rotayı puanlayın (4 kriter + isteğe
      bağlı yorum) → detay sayfasında ortalama/yıldızlar güncellenmeli.
- [ ] Aynı kullanıcıyla **tekrar puanlayın** (farklı yıldızlarla) → yeni bir
      satır değil, mevcut puanınız güncellenmeli (Supabase Table Editor'de
      `route_ratings`'te tek satır kalmalı).
- [ ] Rotayı **oluşturan kullanıcıyla** kendi rotanızı açın → "Puanla"
      butonu görünmemeli (kendi rotanızı puanlayamazsınız notu).
- [ ] **Keşfet** sekmesinde arama kutusuna rota/bölge adı yazın → liste
      filtrelenmeli. **En Yüksek Puan** sıralamasını deneyin.
- [ ] **Yakınımdaki** sekmesine ilk kez basıldığında izin açıklama ekranı
      çıkmalı → izin verince yakındaki rotalar (varsa) listelenmeli.
- [ ] Bir rotayı birkaç kez açıp kapatın → Supabase Table Editor'de
      `routes.view_count`'un arttığını doğrulayın.
- [ ] `npx tsc --noEmit` ve `npx expo lint` hatasız geçiyor.

## Faz 2 — Kurulum ve Test

### 1) Yeni bağımlılıklar

```bash
npm install
```

(`expo-task-manager`, `expo-file-system`, `expo-sharing`, `expo-document-picker`,
`fast-xml-parser` eklendi — hepsi `npm install` ile gelir, ek adım yok.)

### 2) Yeni migration

```
supabase/migrations/0004_faz2_recorded_rides.sql
```

Bu dosyayı SQL Editor'de çalıştırın — `recorded_rides.track_geojson`
(routes.path_geojson ile aynı desen), nokta limiti ve `gpx-files` Storage
bucket'ını (private, sahibi-klasörü deseni) ekler.

### 3) Native değişiklik — yeniden prebuild gerekir

Bu fazda yeni native modüller eklendi (`expo-task-manager`,
`expo-document-picker` vb.) ve `app.config.ts`'e yeni plugin'ler girdi.
Var olan development client'ı **yeniden build etmeniz** gerekiyor:

```bash
npx expo prebuild --clean
npx expo run:android   # veya: npx expo run:ios
```

### Test Adımları (manuel)

- [ ] **Sürüş Kaydı** sekmesinde **Kaydı Başlat** → önce konum izni, sonra
      **arka plan konum izni** açıklama ekranı çıkmalı (kalıcı bildirim
      uyarısıyla) → izin verilince canlı kayıt ekranına geçmeli.
- [ ] Canlı ekranda süre/mesafe/hız güncellenmeli, haritada iz çizilmeli.
      Telefonu birkaç dakika ekranı kapatıp cepte tutarak test edin —
      bildirim çubuğunda "Kavis sürüş kaydı" bildirimi görünmeli ve kayıt
      arka planda devam etmeli.
- [ ] **Durdur** → özet ekranı: mesafe/süre/ort. hız, harita önizleme.
- [ ] **Bir rotayla ilişkilendir** → arama, seçim, kaldırma çalışmalı.
- [ ] **Kaydet** → Sürüş Kaydı listesinde yeni sürüş görünmeli.
- [ ] **GPX Dışa Aktar** (hem özet ekranından hem geçmiş bir sürüşten) →
      paylaşım sayfası açılmalı, dosyayı kaydedip bir metin editörüyle
      açtığınızda geçerli GPX/XML görünmeli.
- [ ] **GPX İçe Aktar** → gerçek bir GPX dosyası seçin (ör. Strava/Komoot'tan
      dışa aktarılmış bir kayıt) → sürüş listesinde "GPX" rozetli yeni bir
      kayıt oluşmalı, haritada iz görünmeli.
- [ ] Çok büyük (>5 MB) veya aşırı noktalı (>20.000 trkpt) bir GPX dosyası
      deneyin → anlaşılır bir hata mesajıyla reddedilmeli.
- [ ] Kayıt sırasında uygulamayı **tamamen kapatın** (task switcher'dan
      kaydırarak) → yeniden açın → Sürüş Kaydı sekmesinde "Tamamlanmamış
      bir sürüş kaydı bulundu" bandı çıkmalı → **Bitir ve Özetle** noktaları
      kaybetmeden özet ekranına taşımalı.
- [ ] `npx tsc --noEmit` ve `npx expo lint` hatasız geçiyor.

## Tasarım Kararları (Faz 2)

- **Örnekleme eşiği:** Normal modda 2.5 sn VEYA 17 m (hangisi önce
  gerçekleşirse); Pil Tasarrufu modunda 8 sn VEYA 50 m. Bu karar
  `useRecordingStore`'daki `shouldRecordPoint` filtresinde uygulanıyor —
  native `timeInterval`/`distanceInterval` sadece bir ön-throttle, gerçek
  "bu noktayı kaydet" kararı JS tarafında (OR mantığıyla) veriliyor.
- **Kesinti dayanıklılığı:** Noktalar tek tek değil ~10'luk tamponlarla
  (`CHUNK_SIZE`) AsyncStorage'a yazılıyor (`recordingPersistence.ts`).
  Uygulama öldürülürse bir sonraki açılışta kurtarma bandı çıkar — ama
  **gerçek "kayda kaldığı yerden devam et" desteklenmiyor**; kurtarılan
  noktalar "sürüş az önce durdu" gibi ele alınıp özet ekranına taşınıyor
  (veri kaybı yok, sadece canlı takip kaldığı yerden devam etmiyor). Bazı
  OEM'lerin (Xiaomi/Samsung vb.) agresif pil yönetimi, foreground service'e
  rağmen arka plan takibini yine de kesebilir — bu bizim kontrolümüz
  dışında bilinen bir Android kısıtı.
- **GPX içe aktarma sınırları:** dosya boyutu ≤5 MB, ham nokta sayısı
  ≤20.000 (bunun üzerinde net bir hatayla reddedilir). Kabul edilen
  dosyalar, hem depolama hem harita gösterimi için aynı Douglas-Peucker
  sadeleştirmesinden (`simplifyToMaxPoints`, hedef ≤3000 nokta) geçiyor —
  canlı kayıtlar da kaydedilmeden önce aynı işlemden geçiyor, tek bir
  sadeleştirme yolu var (ayrı "ham" ve "gösterim" kopyaları tutulmuyor).
- **`gpx_storage_path` sadece içe aktarmada kullanılıyor:** Canlı
  kayıtların GPX'i her zaman `track`'ten anlık üretiliyor (Storage'a
  yüklenmiyor) — orijinal dosya sadece GPX içe aktarmada (fidelity için)
  `gpx-files` bucket'ına yükleniyor.
- **"Topluluk" sekmesi bilinçli olarak YOK:** `is_shared` sütunu DB'de
  duruyor ve API/tip katmanında destekleniyor, ama bu fazda UI'da hiçbir
  toggle veya topluluk listesi yok — içerik raporlama/engelleme altyapısı
  (Faz 3) gelmeden herkese açık bir liste sunmak riskli. Faz 3'te açılacak.
- **Rota oluşturma bağlantısı:** Sürüş özetinde rota seçimi opsiyonel bir
  modal ile yapılıyor (basit arama + liste), Faz 1'in `fetchRoutes` API'si
  yeniden kullanılıyor.

## Teknik Borç (Faz 2 ekleri)

- Kayıt sırasında uygulama öldürülürse **canlı takibe gerçek anlamda devam
  edilemiyor** (yukarı bakın) — ileride arka plan görevinin yeniden
  bağlanmasını sağlayan bir çözüm değerlendirilebilir.
- Maksimum hız (`max_speed_kmh`), GPS'in raporladığı anlık `speed` değerine
  dayanıyor; bazı cihazlarda bu değer gürültülü olabilir. İleride ardışık
  nokta mesafe/süresinden ikinci bir çapraz kontrol eklenebilir.

## Faz 3 — Kurulum ve Test

### 1) Yeni migration

```
supabase/migrations/0005_faz3_poi_geojson.sql
```

`pois.location_geojson` (routes.path_geojson ile aynı desen) ekliyor.

### 2) Edge Function deploy

Bu fazda ilk gerçek Edge Function'ımız var — SQL migration'dan farklı
olarak ayrıca deploy edilmesi gerekiyor:

```bash
supabase functions deploy submit-report
```

Yerel geliştirmede test etmek isterseniz: `supabase functions serve submit-report`.

Fonksiyon `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
ortam değişkenlerini Supabase'in kendisinden otomatik alır — hiçbir secret'ı
elle girmenize gerek yok.

### 3) Native değişiklik yok

Bu faz sadece JS + Edge Function — `expo prebuild` gerekmiyor, Metro çalışıyorsa
Fast Refresh yeterli.

### Test Adımları (manuel)

- [ ] **Harita** sekmesinde üstteki tür çiplerini (Benzinlik, Kafe, Tehlikeli
      Viraj, vb.) aç/kapa yapın → ilgili işaretler haritada görünüp
      kaybolmalı.
- [ ] Konum ikonlu (soldaki) FAB'a basın → haritaya dokunun → İşaretli Nokta
      Ekle formu açılmalı → tür seçip kaydedin → haritada yeni işaret
      görünmeli.
- [ ] İşarete dokunup detay sayfasını açın, yukarı/aşağı oy verin → sayaçlar
      güncellenmeli. Aynı oya tekrar basınca oy geri çekilmeli.
- [ ] Kendi işaretinizi açtığınızda oy butonları pasif olmalı ("Bildir"
      yerine "Sil" görünmeli).
- [ ] **Başka bir kullanıcıyla** aynı işareti art arda **3 farklı hesaptan**
      "Bildir" ile raporlayın (her biri bir sebep seçip gönderir) → üçüncü
      raporun ardından işaret gizlenmeli — orijinal sahibi kendi hesabından
      açtığında sarı "gizlendi" bandını görmeli, diğer kullanıcılar/harita
      artık bu işareti göstermemeli.
- [ ] Aynı kullanıcıyla art arda **6. raporu** göndermeye çalışın (saat
      içinde) → "Saatte en fazla 5 rapor..." hatası dönmeli.
- [ ] Net oy skoru belirgin negatife (≤ -3) düşen bir işaretin haritada
      soluk göründüğünü doğrulayın (birkaç aşağı oy vererek test edilebilir).
- [ ] `npx tsc --noEmit` ve `npx expo lint` hatasız geçiyor.

## Tasarım Kararları (Faz 3)

- **Edge Function istemci-tetiklemeli:** `submit-report`, DB trigger'ından
  webhook ile değil, istemci raporu gönderdikten hemen sonra çağırıyor —
  çok daha basit/güvenilir, ekstra `pg_net` kurulumu gerektirmiyor. Gizleme
  kararının kendisi (rapor sayımı + `is_hidden` güncellemesi) tamamen
  service_role ile, istemcinin bildirdiği hiçbir sayıya güvenmeden veriliyor
  — bu yüzden güvenlik açısından fark yok, sadece bir çağrı atlanırsa
  gizleme gecikir (bkz. Teknik Borç).
- **Kendi kendini onaran tarama:** Fonksiyon her çağrıldığında SADECE o
  çağrıya konu içeriği değil, eşiği (3 farklı raportör) geçmiş ama hâlâ
  gizlenmemiş TÜM içerikleri tarar ve gizler — kaçırılan/başarısız bir
  çağrı, bir sonraki herhangi bir rapor işlemiyle kendini onarır.
- **Hız sınırı Edge Function'da:** Saatte 5 rapor sınırı `submit-report`
  içinde kontrol ediliyor (istemcinin `reports` tablosuna doğrudan yazma
  yetkisi RLS'te hâlâ var — bkz. Teknik Borç).
- **`is_hidden` içerik sahibine görünmeye devam ediyor:** Zaten Faz 0'daki
  `pois_select_visible` politikası (`is_hidden = false or creator_id =
  auth.uid()`) bunu sağlıyordu, ek bir değişiklik gerekmedi — sadece UI'da
  sahibine "bu içerik gizlendi" bandı eklendi.
- **POI tür ikonları:** `Ionicons` yerine `MaterialCommunityIcons`
  kullanıldı (benzinlik, kahve, uyarı gibi türlere çok daha uygun ikonlar
  içeriyor); `POI_TYPE_META`'daki `icon` alanı
  `keyof typeof MaterialCommunityIcons.glyphMap` ile tipleniyor — geçersiz
  bir ikon adı yazılırsa derleme hatası verir, çalışma zamanına kalmaz.
- **POI fotoğrafı yok:** orijinal özellik listesinde istenmemişti, kapsamı
  gereksiz büyütmemek için eklenmedi.

## Teknik Borç (Faz 3 ekleri)

- **İtiraz/inceleme mekanizması yok:** Bir POI otomatik gizlendiğinde
  sahibinin itiraz edebileceği veya bir moderatörün raporları inceleyip
  geri açabileceği bir arayüz henüz yok (`reports.status` alanı bunun için
  hazır — `reviewed`/`dismissed` durumları tanımlı ama hiçbir yerden
  tetiklenmiyor). İleride bir "Moderasyon" ekranı veya web paneli gerekir.
- **Hız sınırı bypass edilebilir:** `reports_insert_own` RLS politikası
  hâlâ `auth.uid() = reporter_id` ile doğrudan insert'e izin veriyor; hız
  sınırı sadece `submit-report` Edge Function'ında uygulanıyor. Teknik
  olarak, uygulamayı atlayıp doğrudan REST/`supabase-js` ile `reports`
  tablosuna yazan bir kullanıcı bu sınırı aşabilir. Güvenlik açığı değil
  (en kötü ihtimalle spam raporu — gizleme kararı yine de gerçek/farklı
  raportör sayısına bakılarak veriliyor), ama istenirse aynı zaman
  penceresi kontrolü RLS politikasına da eklenebilir.

## Faz 4 — Kurulum ve Test

### 1) Yeni migration

```
supabase/migrations/0006_faz4_group_rides.sql
```

Şunları ekliyor/düzeltiyor:

- `group_rides.start_point_geojson`, `live_locations.location_geojson` —
  routes.path_geojson ile aynı desen (bkz. Faz 1 tasarım kararları).
- `group_ride_messages` için dakikada ~20 mesaj sel/flood koruması (INSERT
  trigger).
- İptal edilen ('cancelled') bir etkinlikte sohbete yazma kapanır; okuma
  politikası durumdan bağımsız olduğu için okuma açık kalır.
- `live_locations.updated_at` artık her zaman sunucu saatiyle yazılıyor
  (canlı konum "tazelik" göstergesi buna dayanıyor).
- **Güvenlik düzeltmesi:** `live_locations_insert_own`/`update_own`
  politikaları select ile simetrik hâle getirildi — aksi hâlde etkinlik
  sahibi kendi canlı konumunu hiç paylaşamıyordu.
- **Güvenlik düzeltmesi:** `group_ride_participants_update` politikasının
  `with check`'i sadece kaydın kime ait olduğunu kontrol ediyordu, HANGİ
  duruma geçildiğini değil — bir katılımcı kendi `requested` isteğini
  doğrudan `approved` yaparak sahibinin onayını ve kontenjan kontrolünü
  tamamen atlayabiliyordu. Artık kullanıcı kendi satırında sadece `left`e
  geçebiliyor.
- `group_ride_messages` ve `live_locations` Realtime yayınına
  (`supabase_realtime`) eklendi.

### 2) Edge Function deploy

```bash
supabase functions deploy manage-group-ride-participant
supabase functions deploy end-group-ride
```

### 3) Native değişiklik yok

Bu faz da JS + Edge Function + RLS — `expo prebuild` gerekmiyor.

### Test Adımları (manuel)

- [ ] **Etkinlikler** sekmesinde "+" ile yeni etkinlik oluşturun (başlık,
      opsiyonel buluşma noktası haritadan, tarih/saat, opsiyonel kontenjan)
      → listede görünmeli.
- [ ] **İkinci bir hesapla** aynı etkinliğe "Katılma İsteği Gönder" →
      etkinlik sahibi hesabında "Bekleyen İstekler" altında görünmeli →
      onaylayın → katılımcı listesine geçmeli.
- [ ] Kontenjanı 1 olan bir etkinlikte, kontenjan dolduktan sonra ikinci bir
      isteği onaylamaya çalışın → "Etkinlik kontenjanı dolu" hatası
      dönmeli.
- [ ] Sahip "Sürüşü Başlat" derse durum **Aktif** olmalı, "Canlı Takip"
      butonu görünür olmalı.
- [ ] Onaylı katılımcı **Canlı Takip** ekranında "Konumumu Paylaş"a basınca
      kendi pin'i (ve ikinci bir hesapla test edilirse diğer katılımcının
      pin'i) haritada görünmeli. ~30 saniye konum güncellemeden bekleyin →
      pin soluklaşmalı ve "X dk önce" etiketi görünmeli; ~5 dakika sonra pin
      haritadan tamamen kaybolmalı.
- [ ] **Sohbete Git** ile mesaj gönderin → ikinci hesapta anlık (Realtime)
      görünmeli. Bir mesajı "Bildir" ile raporlayın (aynı akış Faz 3'teki
      gibi 3 farklı raportörle gizlenir).
- [ ] Aynı kullanıcıyla art arda **21. mesajı** bir dakika içinde göndermeye
      çalışın → "Çok hızlı mesaj gönderiyorsunuz..." hatası dönmeli.
- [ ] Sahip etkinliği **İptal Et** → sohbet geçmişi görünmeye devam etmeli
      ama yeni mesaj gönderilemez olmalı (girdi alanı yerine bilgi notu
      görünür).
- [ ] Aktif bir sürüşte sahip **Sürüşü Bitir** derse durum **Tamamlandı**
      olmalı ve Canlı Takip ekranındaki tüm pin'ler kaybolmalı (canlı konum
      satırları silindi).
- [ ] **RLS negatif testleri** (`supabase/tests/0000_rls_smoke_tests.sql`,
      local Supabase + `psql` ile çalıştırın): bir katılımcının kendi
      isteğini doğrudan `approved` yapamadığını, üye olmayan/anon birinin
      sohbeti okuyup yazamadığını, etkinlik sahibinin kendi canlı konumunu
      paylaşabildiğini doğrular.
- [ ] `npx tsc --noEmit` ve `npx expo lint` hatasız geçiyor.

## Tasarım Kararları (Faz 4)

- **Veri modeli Faz 0'dan hazırdı:** `group_rides`, `group_ride_participants`,
  `group_ride_messages`, `live_locations` tabloları + RLS + `is_ride_creator`/
  `is_approved_participant` yardımcı fonksiyonları en baştan tasarlanmıştı;
  bu fazda eksik kalan GeoJSON köprüsü, iki Edge Function ve istemci
  ekranları eklendi.
- **Katılım onayı Edge Function'da, ama sadece kontenjan yüzünden:**
  Katılma isteği göndermek, ayrılmak, sürüşü başlatmak/iptal etmek RLS ile
  zaten güvenli şekilde doğrudan client'tan yapılabiliyor. Onay/reddetme
  için `manage-group-ride-participant` Edge Function'ı sadece "kontenjan
  dolmuşsa onaylanamaz" iş kuralını güvenilir şekilde uygulamak için var —
  RLS'te bu sayım güvenilir/yarışsız ifade edilemez.
- **Sürüş bitirme Edge Function'da:** `end-group-ride`, durumu
  `completed` yapmakla birlikte o sürüşe ait TÜM katılımcıların
  `live_locations` satırlarını `service_role` ile siler — bir kullanıcı
  RLS ile sadece kendi satırını silebilir, ama sürüş bittiğinde HERKESİN
  konumu kalıcı olarak temizlenmeli (canlı konum hiçbir zaman saklanmaz
  kararı, bkz. Faz 0).
- **Sohbet sel koruması Edge Function değil, DB trigger'ı:** Her mesaj için
  bir Deno çağrısı gezisi eklemek sohbeti yavaşlatır; bunun yerine
  `guard_group_ride_message_rate_limit()` trigger'ı hangi yoldan yazılırsa
  yazılsın (istemci, doğrudan REST) atlanamayacak şekilde dakikada ~20
  mesaj sınırı koyuyor.
- **Canlı konum v1 = foreground-only:** Kullanıcı "Canlı Takip" ekranındayken
  `expo-location` ile periyodik paylaşım yapılıyor; uygulama arka plana
  alınırsa paylaşım durur. Faz 2'deki `expo-task-manager` altyapısı arka
  plan desteği için taşınabilir ama v1 kapsamına alınmadı (bkz. Teknik
  Borç).
- **Canlı konum tazelik göstergesi:** 30 saniyeden eski pin'ler soluklaşıp
  "X dk önce" etiketi gösteriyor, 5 dakikadan eski pin'ler haritadan
  tamamen kaldırılıyor — bu tamamen istemci tarafı bir render kuralı
  (periyodik `setInterval` ile yeniden hesaplanıyor), sunucu tarafında
  ekstra bir temizleme işi gerektirmiyor.
- **Mapbox custom marker'da absolute positioning'den kaçınıldı:** Canlı
  takip pin'indeki isim+zaman etiketi, `PointAnnotation` içinde absolute
  positioning yerine normal flow (dikey `View`) ile yerleştirildi — bu
  fazdan önce POI marker'larında yaşanan Mapbox custom-view render
  tuzaklarını tekrar riske atmamak için.

## Teknik Borç (Faz 4 ekleri)

- **Arka plan canlı konum paylaşımı yok:** Sadece "Canlı Takip" ekranı
  açıkken çalışır. İleride Faz 2'deki `expo-task-manager` + arka plan
  izinleri altyapısı bu akışa da bağlanabilir.
- **Kontenjan kontrolü sahibi tarafından bypass edilebilir:** Sahip,
  `manage-group-ride-participant` Edge Function'ını atlayıp doğrudan
  `group_ride_participants` tablosuna `status='approved'` yazabilir (RLS
  bunu ona izin veriyor — sadece BAŞKA bir katılımcının kendi kendini
  onaylaması engellendi). Düşük risk (sadece kendi etkinliğinin
  kontenjanını kendi aşar) — Faz 3'teki rapor hız sınırı bypass'ıyla aynı
  kategoride kabul edilen bir teknik borç.
- **Rota bağlama UI'da yok:** `group_rides.route_id` sütunu ve DB ilişkisi
  hazır ama "Etkinlik Oluştur" formunda bir rota seçici henüz yok.
- **Katılımcı listesi Realtime değil:** Sohbet ve canlı konumun aksine,
  katılımcı onay/reddet listesi Realtime dinlemiyor — ekrana her girişte
  veya bir işlem sonrası yeniden çekiliyor.
- **RLS test script'i bu ortamda çalıştırılamadı:** Yeni eklenen RLS
  senaryoları (`0000_rls_smoke_tests.sql` bölüm 6-8) elle gözden geçirildi
  ama bu geliştirme ortamında Docker/local Supabase kurulu olmadığından
  gerçekten çalıştırılıp doğrulanamadı — local Supabase'iniz varsa
  `supabase db reset` + `psql ... -f supabase/tests/0000_rls_smoke_tests.sql`
  ile siz doğrulayın.

## Faz 5 — Kurulum ve Test

### 1) Yeni migration

```
supabase/migrations/0007_faz5_forum_blocks.sql
```

`forum_questions_select_visible`/`forum_answers_select_visible` RLS
politikalarını, görüntüleyenin engellediği kullanıcıların içeriğini de
gizleyecek şekilde güncelliyor (bkz. aşağıdaki "Tasarım Kararları").

### 2) Native değişiklik yok, ama `submit-report`'u yeniden deploy edin

Bu faz için yeni bir Edge Function yazılmadı, ama var olan `submit-report`
fonksiyonunun `MODERATABLE_TABLES` eşlemesi `forum_question`/`forum_answer`
içermiyordu (Faz 3'ten kalma bir TODO) — forum içeriğini "Bildir" ile
raporlamak bu düzeltme olmadan "Desteklenmeyen içerik türü" hatasıyla
reddediliyordu. Düzeltildi; deploy edin:

```bash
supabase functions deploy submit-report
```

`expo prebuild` gerekmiyor, Metro çalışıyorsa geri kalanı için Fast Refresh
yeterli.

### Test Adımları (manuel)

- [ ] **Forum** sekmesinde "+" ile yeni bir soru sorun (başlık, soru metni,
      opsiyonel motosiklet modeli — profildeki modelinizle önceden dolu
      gelmeli, opsiyonel virgülle ayrılmış etiketler) → listede görünmeli.
- [ ] Arama kutusuna başlık/metin içinde geçen bir kelime yazın → liste
      filtrelenmeli.
- [ ] **İkinci bir hesapla** aynı soruyu açıp cevap yazın → soru sahibi
      hesabında cevap görünmeli.
- [ ] Soru sahibi hesabıyla bir cevabı **"En iyi cevap olarak işaretle"** →
      yeşil "En İyi Cevap" rozeti görünmeli; tekrar basınca kaldırılmalı.
- [ ] Kendi sorunuzu/cevabınızı **Sil** ile silin → listeden/detaydan
      kaybolmalı.
- [ ] **Başka bir kullanıcının** sorusunu/cevabını "Bildir" ile raporlayın
      (aynı akış Faz 3/4'teki gibi 3 farklı raportörle gizlenir).
- [ ] Başka bir kullanıcıyı soru/cevap detayından **"Kullanıcıyı Engelle"**
      ile engelleyin → o kullanıcının soruları/cevapları hem Forum
      listesinden hem soru detaylarından kaybolmalı.
- [ ] **Profil → Engellenen Kullanıcılar** ekranında engellenen kullanıcı
      görünmeli → **Kaldır** ile engeli kaldırın → içerikleri tekrar
      görünür olmalı.
- [ ] `npx tsc --noEmit` ve `npx expo lint` hatasız geçiyor.

## Tasarım Kararları (Faz 5)

- **Engelleme RLS'te, client filtresi değil:** `blocks` tablosu Faz 0'dan
  beri duruyordu ama hiçbir select politikası ondan haberdar değildi.
  `0007_faz5_forum_blocks.sql`, forum select politikalarına
  `auth.uid()`'e özel bir `not exists (select 1 from blocks ...)` koşulu
  ekliyor — bu projedeki "güvenlik kararı istemciye bırakılmaz" ilkesiyle
  tutarlı (bkz. Faz 4'teki politika simetrisi düzeltmeleri). Tek yönlü:
  A, B'yi engellerse B'nin içeriği A'dan gizlenir, A'nınki B'den gizlenmez.
- **Kapsam sadece forum:** Engelleme bu fazda yalnızca soru/cevap
  görünürlüğüne bağlandı; POI, rota ve grup sürüşü sohbeti henüz
  engellemeyi dikkate almıyor (bkz. Teknik Borç).
- **Soru/cevap düzenleme yok:** POI ve grup sürüşü mesajlarıyla aynı
  minimalizm — sadece oluşturma + silme var, düzenleme yok.
- **Etiketler ve motosiklet modeli serbest metin:** POI'nin sabit
  `PoiType` enum'ının aksine, motosiklet modelleri/konular açık uçlu
  olduğu için `bike_model_tag` ve `tags` serbest metin olarak bırakıldı.
- **Edge Function gerekmedi:** Soru/cevap CRUD'u ve en iyi cevap işaretleme
  tamamen mevcut RLS ile sahiplik bazlı korunuyor
  (`forum_questions_update_own` zaten sadece soru sahibinin
  `best_answer_id`'i güncelleyebilmesini sağlıyor, `validate_best_answer`
  trigger'ı da bunun sadece o soruya ait bir cevabı işaret edebilmesini
  garanti ediyor). Faz 3/4'teki Edge Function'lar RLS'in atomik ifade
  edemediği kurallar (hız sınırı, kontenjan) içindi — burada öyle bir
  kural yok.

## Teknik Borç (Faz 5 ekleri)

- **Engelleme sadece foruma uygulanıyor:** POI, rota ve grup sürüşü
  sohbeti/canlı konum, engellenen kullanıcıların içeriğini hâlâ
  gösteriyor. İleride aynı `not exists (select 1 from blocks ...)`
  deseni bu tabloların select politikalarına da eklenebilir.
- **Etiket taksonomisi/otomatik tamamlama yok:** Serbest metin etiketler
  zamanla parçalanabilir (örn. "yamaha" vs "Yamaha" ayrı etiketler olarak
  birikir). İleride önceden tanımlı bir liste veya normalize edilmiş
  (küçük harfe çevrilmiş) etiketler değerlendirilebilir.
- **Arama düz `ilike`:** Forum büyüdükçe (bkz. Faz 1'deki benzer not rota
  aramasında) bir trigram indeksi (`pg_trgm`) gerekebilir; şu ölçekte
  gerekli değil.

## Faz 6 — Kurulum ve Test

Bu faz, README'nin "Sonraki Fazlar" tablosundaki 4 maddeden ("gizlilik
ekranları, hesap silme, FCM, beta derlemesi") sadece ilk ikisini kapsıyor.
FCM (push bildirimleri) ve beta derlemesi/store gönderimi, gerçek bir
Firebase projesi, EAS/Apple Developer/Google Play hesapları gerektirdiği
için bilinçli olarak bu fazın dışında bırakıldı — bkz. aşağıdaki Teknik
Borç bölümündeki adım adım liste.

### 1) Yeni migration yok

Hesap silme, mevcut `on delete cascade` ilişkilerine dayanıyor (bkz.
Tasarım Kararları) — şema değişikliği gerekmedi.

### 2) İki Edge Function deploy edin

```bash
supabase functions deploy delete-account
supabase functions deploy submit-report
```

İkinci komut Faz 6'ya değil, Faz 5'e ait bir düzeltme için: `submit-report`
fonksiyonunun `MODERATABLE_TABLES` eşlemesinde `forum_question`/
`forum_answer` eksikti — forum içeriğini "Bildir" ile raporlamak bu
düzeltme deploy edilmeden "Desteklenmeyen içerik türü" hatasıyla
reddediliyordu. Faz 5'i zaten deploy ettiyseniz bu adımı atlamayın.

### 3) Native değişiklik yok

Bu faz sadece JS + yeni bir Edge Function — `expo prebuild` gerekmiyor.

### 4) Store başvurusu için gizlilik politikası URL'si — kavisapp.com

Google Play Console ve App Store Connect, uygulama içi bir ekran değil,
**herkese açık, kalıcı bir URL** olarak gizlilik politikası istiyor. Bunun
için `web/` altında Cloudflare Pages'e deploy edilecek, framework'süz basit
bir statik site var: bir landing page (`/`) ve iki yasal sayfa
(`/gizlilik`, `/kosullar`). Kurulum ve adım adım Cloudflare Pages deploy
talimatları için **`web/README.md`**'ye bakın.

Store konsollarına girilecek URL'ler:

- **Gizlilik Politikası:** `https://kavisapp.com/gizlilik`
- **Kullanım Koşulları:** `https://kavisapp.com/kosullar`

**Tek kaynak:** `/gizlilik` ve `/kosullar` sayfalarının metni
`src/content/legal.json`'dan üretiliyor — uygulama içindeki
`gizlilik-politikasi.tsx`/`kullanim-kosullari.tsx` ekranları da AYNI
JSON'ı okuyor (bkz. Tasarım Kararları). Metni güncellemek için sadece bu
JSON'ı değiştirin; hem uygulama hem web sitesi otomatik senkron kalır.
(Bu URL'ler yayına alınana kadar geçici olarak paylaşılmış bir Claude
Artifact linki kullanılmıştı — artık kavisapp.com yayında olduğu için o
link kullanılmamalı.)

### Test Adımları (manuel)

- [ ] **Kayıt Ol** ekranında "Kullanım Koşulları" ve "Gizlilik Politikası"
      bağlantılarının ilgili ekranları açtığını doğrulayın.
- [ ] **Profil** sekmesinde aynı iki ekrana ve **Engellenen Kullanıcılar**a
      giden bağlantıların çalıştığını doğrulayın.
- [ ] **Profil → Hesabımı Sil** ekranını açın → onay metnini doğru
      yazmadan **Hesabımı Kalıcı Olarak Sil** butonunun pasif kaldığını
      doğrulayın → doğru yazınca aktifleşmeli.
- [ ] Test amaçlı bir hesapla silme işlemini tamamlayın → giriş ekranına
      yönlendirilmeli → Supabase Dashboard → Authentication'da kullanıcı
      ve Table Editor'de `profiles` (ve cascade ile `routes`, `pois`,
      `forum_questions`, `recorded_rides`, `group_ride_participants`, ...)
      satırlarının kalıcı olarak silindiğini doğrulayın.
- [ ] Silinen kullanıcının `avatars/{user_id}/` ve `gpx-files/{user_id}/`
      altında dosyası varsa, Storage'da bu dosyaların da silindiğini
      doğrulayın.
- [ ] `npx tsc --noEmit` ve `npx expo lint` hatasız geçiyor.

## Tasarım Kararları (Faz 6)

- **Hesap silme için yazılı onay, `Alert` değil:** POI/soru/cevap gibi tek
  bir satırı silen işlemler `Alert.alert` ile onaylanıyor; hesap silme
  geri alınamaz ve TÜM veriyi kapsadığı için `hesap-sil.tsx`'te ayrıca
  kullanıcının tam olarak "HESABIMI SİL" yazmasını istiyoruz (buton bu
  metin doğru girilene kadar pasif) — bu daha ağır sonuca daha ağır bir
  onay adımı.
- **Storage temizliği açıkça yapılıyor:** `on delete cascade` sadece
  Postgres tablolarını kapsıyor, Storage nesnelerini kapsamıyor —
  `delete-account` Edge Function'ı bu yüzden `auth.admin.deleteUser`'dan
  ÖNCE `avatars/{user_id}/` ve `gpx-files/{user_id}/` altındaki dosyaları
  best-effort olarak siliyor (bir bucket'ta listeleme/silme hatası olsa
  bile kullanıcı hesabını silebilmeli).
- **Gizlilik/Kullanım Koşulları ekranları `src/app` kökünde:** `profil/`
  altındaki `engellenenler.tsx`/`hesap-sil.tsx`'in aksine, bu iki ekran
  kayıt ekranından (oturum açılmadan) da erişilebilmeli — bu yüzden
  `profil/` yerine üst seviyede.
- **Metinler taslak, hukuki tavsiye değil:** İki ekranda da ve
  kavisapp.com'daki karşılıklarında belirgin bir uyarı banner'ı var. Gerçek
  bir mağaza başvurusundan önce bir hukuk danışmanına gösterilmesi ve
  içindeki iletişim bilgisi yer tutucularının doldurulması gerekiyor.
- **Yasal metinler `src/content/legal.json`'da, ekranlarda veya web
  sayfalarında değil:** Hem `gizlilik-politikasi.tsx`/`kullanim-kosullari.tsx`
  hem `web/build.mjs` aynı JSON'ı okuyor — metin üç yerde ayrı ayrı
  tutulsaydı (uygulama × 2 ekran + statik site) güncellemede birinin
  unutulması kaçınılmaz olurdu. `routes.path_geojson` gibi diğer
  "tek kaynak, birden çok tüketici" desenleriyle aynı mantık.
- **`web/`, ayrı bir repo değil, aynı repoda bağımsız bir klasör:** İçeriğin
  tek kaynaktan senkron kalabilmesi için (yukarıdaki madde) web sitesinin
  `src/content/legal.json`'a erişebilmesi gerekiyor — ayrı bir repoda bu,
  ya bir git submodule ya da elle kopyalama gerektirirdi. Cloudflare Pages
  "Root directory" ayarı (`web`) monorepo alt klasörlerini native olarak
  destekliyor, bu yüzden ek karmaşıklığa gerek kalmadı. Site framework'süz
  (düz HTML/CSS + bağımlılıksız bir Node script) — RN uygulamasının build
  zincirinden tamamen izole, birbirini bozma riski yok.

## Teknik Borç (Faz 6 ekleri)

- **FCM push bildirimleri yapılmadı** — kullanıcıyla birlikte bilinçli
  olarak bu fazın dışında bırakıldı. Sırasıyla gereken adımlar:
  1. Bir Firebase projesi oluşturun, Android uygulamasını ekleyip
     `google-services.json`'ı indirin.
  2. `npx expo install expo-notifications` ile bağımlılığı ve
     `app.config.ts`'e ilgili config plugin'i ekleyin.
  3. `eas login` + `eas init` ile projeyi gerçek bir EAS projesine bağlayın
     (şu an `app.config.ts`'teki `EAS_PROJECT_ID` boş) — bu, push token
     kaydı için şart.
  4. `eas credentials` ile FCM V1 servis hesabı anahtarını yükleyin (eski
     "legacy server key" ile gönderim Google tarafından kaldırıldı).
  5. Hangi olaylarda bildirim gönderileceğine karar verin (örn. sorunuza
     yeni cevap geldi, grup sürüşü katılım isteğiniz onaylandı, yeni sohbet
     mesajı) ve bunun için bir `push_tokens` tablosu + gönderim mantığını
     tetikleyen DB trigger'ları/Edge Function'ları tasarlayın.
  Bu adımlar tamamlandığında istemci tarafı (izin isteme + token kaydı) ve
  sunucu tarafı (tetikleyiciler) kodu ayrı bir oturumda yazılabilir.
- **Beta derlemesi/store gönderimi yapılmadı** — `eas build --profile
  preview` çalıştırmak, TestFlight'a (Apple Developer Program, $99/yıl) ve
  Play Console'a (tek seferlik $25) hesap gerektiriyor; ikisi de bu ortamda
  yok. `eas.json`'daki `preview`/`production` profilleri zaten hazır —
  hesaplar kurulunca `eas build --profile preview` ile ilk beta derlemesi
  alınabilir.
- **Gizlilik Politikası/Kullanım Koşulları içindeki iletişim e-postası yer
  tutucu:** Gerçek bir destek/iletişim adresiyle doldurulmalı.
- **Avatar yükleme özelliği hâlâ yok:** `avatars` bucket'ı Faz 0'dan beri
  şemada duruyor ama hiçbir ekran ona dosya yüklemiyor — Gizlilik
  Politikası'ndaki "profil bilgileri" ifadesi bunu bugün için kapsamıyor,
  özellik eklenirse politika metni güncellenmeli.

## Tasarım Kararları (Faz 1)

- **Rota geometrisi:** Yazarken (insert) WKT metni (`"LINESTRING(lng lat, ...)"`)
  gönderiliyor. Okuma tarafında **PostgREST `geography` sütunlarını GeoJSON
  değil, EWKB hex metni olarak döndürür** (Faz 1 test sırasında bulunan bir
  bug'ın kök nedeni buydu — bkz. `0003_route_path_geojson.sql`). Bu yüzden
  `routes` tablosunda ayrı, trigger ile otomatik senkronlanan bir
  `path_geojson jsonb` sütunu var; istemci haritada göstermek için HER ZAMAN
  `path_geojson`'ı okur, ham `path`'i değil. **Faz 3/4'te aynı desen
  tekrarlanmalı:** `pois.location`, `group_rides.start_point`,
  `live_locations.location` da haritada gösterilmeye başlandığında aynı
  "gölge GeoJSON sütunu + senkron trigger" yaklaşımı gerekecek.
- **"Yakınımdaki rotalar":** `ST_DWithin` sorgu builder'da kurulamadığı için
  `nearby_routes` RPC'si eklendi (bkz. `0002_faz1_route_constraints.sql`) —
  `SECURITY INVOKER` (varsayılan), RLS'i bypass etmiyor.
- **`view_count` artırma:** Herkesin (rota sahibi olmasa da) artırabilmesi
  için dar kapsamlı bir `SECURITY DEFINER` fonksiyon (`increment_route_view_count`)
  kullanılıyor — sadece bu tek sayacı değiştiriyor.
- **Kendi rotasını puanlayamama:** `route_ratings` insert/update
  politikalarında `user_id <> routes.creator_id` kontrolü var; UI'da da
  "Puanla" butonu rota sahibine gösterilmiyor (savunma iki katmanlı).
- **İkinci puanlama = update:** `route_ratings` üzerinde `(route_id, user_id)`
  unique kısıtı var; client `upsert(..., { onConflict: "route_id,user_id" })`
  kullanıyor, ayrı bir "zaten puanladın" kontrolü gerekmiyor.
- **Konum izni zamanlaması:** Genel onboarding yerine, kullanıcı ilk kez
  "Yakınımdaki" filtresine dokunduğunda gösterilen bir açıklama modali
  (`LocationRationaleModal`) ile — KVKK'nın "kullanım amacını önceden açıklama"
  şartını tam ihtiyaç anında, daha az sürtünmeyle karşılıyor.
- **Rota nokta limiti:** DB'de `st_npoints(path) <= 500` CHECK kısıtı var;
  istemci de aynı sınırı (`MAX_ROUTE_POINTS`) UI'da uygulayarak kullanıcıyı
  sunucu hatasından önce uyarıyor.

## Tasarım Kararları (Faz 0)

- **Harita:** Mapbox (25k MAU/ay ücretsiz), `MapService` katmanı arkasında
  soyutlandı — büyüme durumunda MapLibre'ye geçiş tek dosyada kalır.
- **Agrega hesaplama (puan ortalaması, oy sayısı):** Postgres trigger
  (`SECURITY DEFINER`) ile anlık ve atomik hesaplanıyor; kullanıcı bu
  alanlara asla client'tan yazamaz (RLS + guard trigger). İçerik
  gizleme/moderasyon gibi iş kararı gerektiren mantık Edge Function'larda
  kalacak (sonraki fazlarda eklenecek).
- **Görünürlük:** Rotalar, POI'ler ve forum içerikleri anon dahil herkese
  açık (keşfedilebilirlik için); yazma işlemleri her zaman kimlik doğrulama
  gerektirir. Canlı konum ve etkinlik sohbeti bunun istisnası — sadece
  onaylı katılımcılara açık.
- **Tema:** v1 kapsamında sadece koyu tema destekleniyor
  (`userInterfaceStyle: "dark"`), açık tema gelecekte eklenebilir.

## Teknik Borç

- **`routes.distance_km` client-hesaplı** (Faz 1): rota oluşturma ekranında
  dokunulan noktalar üzerinden istemcide haversine ile hesaplanıp gönderiliyor.
  Güvenlik açısından kritik değil (sadece bilgi amaçlı bir alan), ama
  yanlış/optimistik girilebilir. İleride bu alan filtreleme veya istatistik
  (örn. "en uzun rotalar" sıralaması, toplam km istatistikleri) için
  kullanılmaya başlanırsa, `path` sütunundan `ST_Length(path) / 1000` ile
  sunucuda (trigger veya `increment_route_view_count` benzeri bir
  `SECURITY DEFINER` fonksiyonla) yeniden hesaplanıp client değerinin
  üzerine yazılması gerekir.

## Sonraki Fazlar

| Faz | Kapsam |
|---|---|
| 1 | Rota keşfi, harita entegrasyonu, rota oluşturma/puanlama |
| 2 | GPX kayıt ve istatistikler |
| 3 | İşaretli noktalar (POI) + içerik raporlama altyapısı |
| 4 | Grup sürüşü etkinlikleri + sohbet + canlı konum |
| 5 | Soru-cevap forumu + kullanıcı engelleme |
| 6 | Store hazırlığı — gizlilik ekranları, hesap silme, FCM, beta derlemesi |
