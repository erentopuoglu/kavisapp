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
                           poi, group-rides, forum, moderation, profile)
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
                           (Mapbox'a özgü kod sadece burada yaşar)
supabase/
  migrations/              0000_init_schema.sql — tüm tablolar + RLS
  tests/                   RLS smoke test script'leri
```

### Harita soyutlaması

Uygulama Mapbox kullanıyor, ancak hiçbir ekran `@rnmapbox/maps`'i doğrudan
import etmiyor — hepsi `src/lib/map/MapService.tsx` üzerinden geçiyor
(`AppMapView`, `AppMapMarker`). Mapbox'ın 25.000 MAU'luk ücretsiz sınırına
yaklaşılırsa, sağlayıcı değişimi (örn. MapLibre + MapTiler/self-host) sadece
bu dosyanın yeniden yazılmasını gerektirir; geri kalan kod değişmez.

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

Mapbox native modül içerdiği için **Expo Go çalışmaz** — bir Development
Client build'i gerekir:

```bash
npx expo prebuild
npx expo run:android   # veya: npx expo run:ios (macOS gerekir)
```

Ardından geliştirme sırasında:

```bash
npm start
```

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
