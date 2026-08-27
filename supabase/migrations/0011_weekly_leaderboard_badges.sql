-- ---------------------------------------------------------------------
-- Haftalık Liderlik Tablosu + Rozet Sistemi
-- ---------------------------------------------------------------------
-- Tasarım ilkeleri (kullanıcıyla onaylandı):
--  1) GÜVENLİK: mesafe/hız temelli hiçbir sıralama yok — sadece keşif ve
--     katkı (farklı rota sürme, rota paylaşma, POI ekleme, en iyi cevap).
--     Mesafe sadece kişisel istatistik (bkz. client tarafı), sıralamada
--     asla kullanılmaz.
--  2) Rozetler TAMAMEN KİŞİSEL — başka kullanıcıların rozetlerini kimse
--     göremez, karşılaştırma/sıralama yok (user_badges'te select_own
--     dışında politika yok).
--  3) Liderlik tablosu (rozetlerin aksine) haftalık, kategori bazlı ve
--     GÖRÜNÜR — kim önde, username ile gösterilir. Ama gösterilen alan
--     kasıtlı olarak minimum: sadece username + sayı, profil/e-posta/id
--     sızmaz (aşağıdaki fonksiyonların RETURNS TABLE şekline bakın).
--  4) Sıralama tamamen sunucuda hesaplanır — istemci hiçbir sayı
--     göndermez, sadece SELECT ile sonucu okur.
--  5) Engellenen kullanıcılar liderlik tablosunda görünmez (forum'daki
--     0007_faz5_forum_blocks.sql'deki `not exists (select 1 from blocks
--     where blocker_id = auth.uid() and blocked_id = ...)` deseniyle
--     birebir aynı).
-- ---------------------------------------------------------------------

-- =======================================================================
-- 1) forum_questions.best_answer_selected_at — "en iyi cevap ne zaman
--    seçildi" bilgisi şu ana kadar hiç tutulmuyordu (updated_at her
--    düzenlemede değişiyor, haftalık pencere için güvenilmez). Var olan
--    validate_best_answer() trigger'ı zaten sadece best_answer_id
--    değiştiğinde tetikleniyor — aynı trigger'a bu alanı da ekliyoruz.
-- =======================================================================
alter table forum_questions add column best_answer_selected_at timestamptz;

create or replace function validate_best_answer()
returns trigger language plpgsql as $$
begin
  if new.best_answer_id is not null then
    if not exists (
      select 1 from forum_answers
      where id = new.best_answer_id and question_id = new.id
    ) then
      raise exception 'best_answer_id bu soruya ait olmayan bir cevabı işaret edemez';
    end if;
    new.best_answer_selected_at := now();
  else
    new.best_answer_selected_at := null;
  end if;
  return new;
end;
$$;

-- =======================================================================
-- 2) recorded_rides — hile korumasının veri modeli
-- =======================================================================
-- source: sadece uygulama içi canlı kayıtlar ('recorded') liderlik
-- tablosuna girer, GPX içe aktarma ('gpx_import') asla girmez. Var olan
-- gpx_storage_path'in dolu/boş oluşuna dayanmak yerine (yan etki, niyet
-- değil) açık bir sütun — ileride canlı kaydı GPX olarak dışa aktarma
-- gibi bir özellik gpx_storage_path'i doldurabilir, source bundan
-- etkilenmemeli.
alter table recorded_rides add column source text not null default 'recorded'
  check (source in ('recorded', 'gpx_import'));

-- is_suspicious: istemci, kayıt sırasında herhangi bir konum noktası
-- işletim sisteminin "sahte konum" (mock location — expo-location'ın
-- coords.mocked alanı, Android'de gerçek bir sinyal) olarak işaretlemişse
-- bunu true gönderir. true olan bir sürüş SİLİNMEZ/gizlenmez (kullanıcı
-- kendi sürüşünü normal şekilde görmeye devam eder) — sadece hiçbir
-- liderlik hesabına girmez. Ayrıca aşağıdaki leaderboard fonksiyonları
-- ortalama hız için de kendi mantıksızlık eşiğini ayrıca uyguluyor
-- (bkz. get_weekly_route_leaderboard) — is_suspicious tek başına yeterli
-- değil, ikisi birlikte savunma katmanı.
alter table recorded_rides add column is_suspicious boolean not null default false;

-- ÖNEMLİ SINIR (dürüstçe belgelensin): bu iki alan da İSTEMCİNİN INSERT
-- anında bildirdiği değerlere dayanır. Uygulamayı tamamen atlayıp
-- doğrudan REST/supabase-js ile sahte bir "source='recorded'" satırı
-- yazan çok kararlı bir saldırganı bu engellemez — o seviye bir korumanın
-- (ör. cihaz attestation'ı, imzalı yükleme) bu özelliğin kapsamını fazlasıyla
-- aşan bir maliyeti var. Buradaki hedef, uygulamanın KENDİ GPX içe aktarma
-- özelliğinin ve yaygın sahte-konum uygulamalarının sıralamayı bozmasını
-- engellemek — gerçekçi tehdit modeli budur.
--
-- Yine de INSERT'ten SONRA sahibinin bu iki alanı geriye/ileriye oynatarak
-- (ör. gpx_import'u recorded'a, is_suspicious'ı false'a çevirerek)
-- sıralamayı manipüle etmesini guard trigger'la kapatıyoruz — is_banned/
-- is_hidden ile aynı desen.
create or replace function guard_recorded_rides_integrity_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.source := old.source;
    new.is_suspicious := old.is_suspicious;
  end if;
  return new;
end;
$$;

create trigger trg_recorded_rides_guard_integrity
  before update on recorded_rides
  for each row execute function guard_recorded_rides_integrity_fields();

-- =======================================================================
-- 3) BADGES — statik katalog, herkese açık okunur (rozetin adı/ikonu
--    gizli değil, sadece KİMİN KAZANDIĞI kişisel — bkz. user_badges).
-- =======================================================================
create table badges (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table badges enable row level security;

create policy "badges_select_public"
  on badges for select
  using (true);

-- İnsert/update/delete politikası YOK: katalog sadece migration ile
-- (service_role) yönetilir, hiçbir istemci rol'ü rozet tanımlayamaz.

insert into badges (key, title, description) values
  ('ilk_rota', 'İlk Adım', 'İlk rotanı paylaştın.'),
  ('rota_5', 'Anlatıcı', '5 rota paylaştın.'),
  ('rota_10', 'Kaşif Anlatıcı', '10 rota paylaştın.'),
  ('ilk_poi', 'Haritacı', 'İlk işaretli noktanı (POI) ekledin.'),
  ('poi_10', 'Bölge Uzmanı', '10 işaretli nokta ekledin.'),
  ('poi_25', 'Kaşif', '25 işaretli nokta ekledin.'),
  ('ilk_en_iyi_cevap', 'Bilge', 'İlk kez cevabın "en iyi" seçildi.'),
  ('en_iyi_cevap_10', 'Usta', '10 kez cevabın "en iyi" seçildi.'),
  ('farkli_rota_5', 'Yol Tutkunu', 'Canlı kayıtla 5 farklı rota sürdün.'),
  ('farkli_rota_10', 'Rota Avcısı', 'Canlı kayıtla 10 farklı rota sürdün.'),
  ('farkli_rota_25', 'Efsane Sürücü', 'Canlı kayıtla 25 farklı rota sürdün.'),
  ('haftalik_birincilik', 'Haftanın Yıldızı', 'Haftalık bir kategoride birinci oldun.'),
  ('sureklilik_4hafta', 'Süreklilik', '4 hafta üst üste en az bir kategoride aktif oldun.');

-- =======================================================================
-- 4) USER_BADGES — TAMAMEN KİŞİSEL. Sadece sahibi görebilir, hiçbir
--    istemci (kendisi dahil) doğrudan yazamaz — sadece aşağıdaki
--    SECURITY DEFINER fonksiyonlar (award_badge/finalize_weekly_awards)
--    service_role bağlamında insert eder.
-- =======================================================================
create table user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  badge_id uuid not null references badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

alter table user_badges enable row level security;

create policy "user_badges_select_own"
  on user_badges for select
  using (auth.uid() = user_id);

-- insert/update/delete politikası YOK — kullanıcı kendine rozet veremez,
-- silemez, tarihini değiştiremez. Tek yazma yolu aşağıdaki
-- award_badge_if_needed() (security definer).

create or replace function award_badge_if_needed(p_user_id uuid, p_badge_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into user_badges (user_id, badge_id)
  select p_user_id, b.id from badges b where b.key = p_badge_key
  on conflict (user_id, badge_id) do nothing;
end;
$$;

-- =======================================================================
-- 5) WEEKLY_AWARDS — haftalık kategori kazananlarının iç kaydı (idempotent
--    finalize_weekly_awards() için). Herkese açık bir "geçmiş kazananlar"
--    vitrini DEĞİL — hiçbir select/insert politikası yok, sadece
--    service_role (SECURITY DEFINER fonksiyon içinden) erişir.
-- =======================================================================
create table weekly_awards (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  category text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (week_start, category)
);

alter table weekly_awards enable row level security;
-- Bilerek HİÇBİR select/insert/update/delete politikası eklenmiyor —
-- anon/authenticated bu tabloya dair hiçbir şey yapamaz, sadece
-- SECURITY DEFINER fonksiyonlar (service_role bağlamında) erişir.

-- =======================================================================
-- 6) LİDERLİK TABLOSU FONKSİYONLARI
-- =======================================================================
-- Ortak sözleşme: her biri sadece (username, sayı) döner — profil id'si,
-- e-postası ya da başka hiçbir alan sızmaz (madde 5). week_start
-- verilmezse içinde bulunulan haftanın (Pazartesi başlangıçlı, Postgres
-- date_trunc('week', ...) varsayılanı) başlangıcı kullanılır.

-- routes ve pois zaten herkese açık okunabilir (routes_select_visible /
-- pois_select_visible) — bu iki fonksiyonun security definer olmasına
-- gerek yok, RLS'i atlamıyor, sadece agregasyon yapıyor.
create or replace function get_weekly_routes_shared_leaderboard(
  p_week_start date default date_trunc('week', now())::date,
  p_limit int default 10
)
returns table(username text, shared_count bigint)
language sql stable as $$
  select p.username, count(*)::bigint as shared_count
  from routes r
  join profiles p on p.id = r.creator_id
  where r.created_at >= p_week_start::timestamptz
    and r.created_at < (p_week_start + interval '7 days')
    and r.is_hidden = false
    and not exists (
      select 1 from blocks where blocker_id = auth.uid() and blocked_id = r.creator_id
    )
  group by p.username
  order by shared_count desc
  limit p_limit;
$$;

create or replace function get_weekly_pois_leaderboard(
  p_week_start date default date_trunc('week', now())::date,
  p_limit int default 10
)
returns table(username text, poi_count bigint)
language sql stable as $$
  select p.username, count(*)::bigint as poi_count
  from pois poi
  join profiles p on p.id = poi.creator_id
  where poi.created_at >= p_week_start::timestamptz
    and poi.created_at < (p_week_start + interval '7 days')
    and poi.is_hidden = false
    and not exists (
      select 1 from blocks where blocker_id = auth.uid() and blocked_id = poi.creator_id
    )
  group by p.username
  order by poi_count desc
  limit p_limit;
$$;

create or replace function get_weekly_best_answers_leaderboard(
  p_week_start date default date_trunc('week', now())::date,
  p_limit int default 10
)
returns table(username text, best_answer_count bigint)
language sql stable as $$
  select p.username, count(*)::bigint as best_answer_count
  from forum_questions q
  join forum_answers a on a.id = q.best_answer_id
  join profiles p on p.id = a.user_id
  where q.best_answer_selected_at >= p_week_start::timestamptz
    and q.best_answer_selected_at < (p_week_start + interval '7 days')
    and q.is_hidden = false
    and a.is_hidden = false
    and not exists (
      select 1 from blocks where blocker_id = auth.uid() and blocked_id = a.user_id
    )
  group by p.username
  order by best_answer_count desc
  limit p_limit;
$$;

-- recorded_rides KİŞİYE ÖZEL bir tablo (recorded_rides_select_own_or_shared)
-- — bu fonksiyon TÜM kullanıcıların sürüşlerini agregasyon için görmesi
-- gerektiğinden security definer. increment_route_view_count'taki "dar
-- kapsam" ilkesiyle aynı: SADECE toplam sayıyı döner, hiçbir ham sürüş
-- satırını (rota, konum, hız) dışarı sızdırmaz.
--
-- Hile koruması burada uygulanıyor:
--   - source = 'recorded' (GPX içe aktarma hariç)
--   - is_suspicious = false (sahte konum tespit edilmemiş)
--   - avg_speed_kmh mantıksız değilse (>200 km/sa sürdürülmüş ortalama
--     gerçekçi değil — MAX_PHYSICAL_SPEED_KMH=250 zaten her NOKTA için
--     kayıt anında uygulanıyor, bu ek bir SÜRÜŞ GENELİ sağlık kontrolü)
--   - sürüş mesafesi, bağlı olduğu rotanın mesafesinin en az %50'si
--     değilse "o rotayı sürdü" sayılmıyor (aksi halde birkaç saniyede
--     başlat/durdur yaparak onlarca rotayı "sürmüş" gibi görünmek
--     mümkün olurdu)
create or replace function get_weekly_route_leaderboard(
  p_week_start date default date_trunc('week', now())::date,
  p_limit int default 10
)
returns table(username text, distinct_routes bigint)
language sql stable security definer set search_path = public as $$
  select p.username, count(distinct rr.route_id)::bigint as distinct_routes
  from recorded_rides rr
  join routes r on r.id = rr.route_id
  join profiles p on p.id = rr.user_id
  where rr.started_at >= p_week_start::timestamptz
    and rr.started_at < (p_week_start + interval '7 days')
    and rr.source = 'recorded'
    and rr.is_suspicious = false
    and rr.route_id is not null
    and (rr.avg_speed_kmh is null or rr.avg_speed_kmh <= 200)
    -- routes.distance_km NULL olabilir (Faz 1 teknik borcu, client-hesaplı
    -- bir alan) — böyle bir durumda rotanın gerçek uzunluğunu path'ten
    -- (PostGIS) hesaplayarak eşiği yine de uygulayabiliyoruz, "sessizce
    -- hiç sayılmama" riskini kapatıyor.
    and rr.distance_km >= coalesce(r.distance_km, st_length(r.path) / 1000) * 0.5
    and not exists (
      select 1 from blocks where blocker_id = auth.uid() and blocked_id = rr.user_id
    )
  group by p.username
  order by distinct_routes desc
  limit p_limit;
$$;

-- =======================================================================
-- 7) HAFTALIK ÖDÜL FİNALİZASYONU — idempotent, cron YOK.
-- =======================================================================
-- Her kategori fonksiyonunu YUKARIDAKİ auth.uid()/blocks filtresi
-- OLMADAN (bu fonksiyon zaten security definer, tüm kullanıcılar için
-- objektif bir kazanan belirlemesi gerekiyor — engelleme bir kullanıcının
-- KENDİ GÖRÜNÜMÜNÜ etkiler, kimin ödül kazandığını değil) TEKRAR
-- sorguluyoruz; yukarıdaki 4 fonksiyonu yeniden kullanmak yerine burada
-- ayrı ayrı yazmamızın sebebi bu (auth.uid() bağımlılığını kaldırmak).
--
-- İstemci tarafı: liderlik tablosu ekranı açıldığında bu fonksiyon
-- (RPC ile) çağrılır, önce geçen haftanın ödülleri dağıtılmamışsa dağıtır,
-- sonra normal şekilde CARİ haftanın canlı sıralaması okunur. Aynı hafta
-- için tekrar tekrar çağrılması zararsızdır (unique (week_start, category)
-- + "zaten var mı" kontrolü).

-- "Süreklilik" rozeti için: bir kullanıcı verilen haftada 4 kategoriden
-- HERHANGİ birinde (aynı %50 rota eşiği ve source/is_suspicious filtreleriyle)
-- aktifse true. security definer — recorded_rides'ı tüm kullanıcılar için
-- kontrol edebilmesi gerekiyor.
create or replace function user_active_in_week(p_user_id uuid, p_week_start date)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from routes
      where creator_id = p_user_id and is_hidden = false
        and created_at >= p_week_start::timestamptz and created_at < (p_week_start + interval '7 days')
    )
    or exists (
      select 1 from pois
      where creator_id = p_user_id and is_hidden = false
        and created_at >= p_week_start::timestamptz and created_at < (p_week_start + interval '7 days')
    )
    or exists (
      select 1 from forum_questions q
      join forum_answers a on a.id = q.best_answer_id
      where a.user_id = p_user_id and q.is_hidden = false and a.is_hidden = false
        and q.best_answer_selected_at >= p_week_start::timestamptz
        and q.best_answer_selected_at < (p_week_start + interval '7 days')
    )
    or exists (
      select 1 from recorded_rides rr
      join routes r on r.id = rr.route_id
      where rr.user_id = p_user_id and rr.source = 'recorded' and rr.is_suspicious = false
        and rr.route_id is not null
        and rr.distance_km >= coalesce(r.distance_km, st_length(r.path) / 1000) * 0.5
        and rr.started_at >= p_week_start::timestamptz and rr.started_at < (p_week_start + interval '7 days')
    );
$$;

create or replace function finalize_weekly_awards()
returns void language plpgsql security definer set search_path = public as $$
declare
  prev_week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  -- Düz bir uuid skaleri BİLEREK tercih edildi: bir `record` değişkeni,
  -- SELECT INTO sıfır satır dönerse "atanmamış" durumda kalabiliyor ve
  -- sonraki .field erişimi hataya yol açabiliyor (PL/pgSQL'in bilinen bir
  -- tuzağı) — dört kategori aynı değişkeni sırayla kullandığı için bu
  -- riski tamamen ortadan kaldırıyoruz.
  winner_id uuid;
begin
  -- Rota paylaşma
  if not exists (select 1 from weekly_awards where week_start = prev_week_start and category = 'routes_shared') then
    select r.creator_id into winner_id
    from routes r
    where r.created_at >= prev_week_start::timestamptz
      and r.created_at < (prev_week_start + interval '7 days')
      and r.is_hidden = false
    group by r.creator_id
    order by count(*) desc
    limit 1;

    if winner_id is not null then
      insert into weekly_awards (week_start, category, user_id) values (prev_week_start, 'routes_shared', winner_id);
      perform award_badge_if_needed(winner_id, 'haftalik_birincilik');
    end if;
  end if;

  -- POI ekleme
  winner_id := null;
  if not exists (select 1 from weekly_awards where week_start = prev_week_start and category = 'pois_added') then
    select poi.creator_id into winner_id
    from pois poi
    where poi.created_at >= prev_week_start::timestamptz
      and poi.created_at < (prev_week_start + interval '7 days')
      and poi.is_hidden = false
    group by poi.creator_id
    order by count(*) desc
    limit 1;

    if winner_id is not null then
      insert into weekly_awards (week_start, category, user_id) values (prev_week_start, 'pois_added', winner_id);
      perform award_badge_if_needed(winner_id, 'haftalik_birincilik');
    end if;
  end if;

  -- En iyi cevap
  winner_id := null;
  if not exists (select 1 from weekly_awards where week_start = prev_week_start and category = 'best_answers') then
    select a.user_id into winner_id
    from forum_questions q
    join forum_answers a on a.id = q.best_answer_id
    where q.best_answer_selected_at >= prev_week_start::timestamptz
      and q.best_answer_selected_at < (prev_week_start + interval '7 days')
      and q.is_hidden = false
      and a.is_hidden = false
    group by a.user_id
    order by count(*) desc
    limit 1;

    if winner_id is not null then
      insert into weekly_awards (week_start, category, user_id) values (prev_week_start, 'best_answers', winner_id);
      perform award_badge_if_needed(winner_id, 'haftalik_birincilik');
    end if;
  end if;

  -- Farklı rota sürme
  winner_id := null;
  if not exists (select 1 from weekly_awards where week_start = prev_week_start and category = 'routes_ridden') then
    select rr.user_id into winner_id
    from recorded_rides rr
    join routes r on r.id = rr.route_id
    where rr.started_at >= prev_week_start::timestamptz
      and rr.started_at < (prev_week_start + interval '7 days')
      and rr.source = 'recorded'
      and rr.is_suspicious = false
      and rr.route_id is not null
      and (rr.avg_speed_kmh is null or rr.avg_speed_kmh <= 200)
      -- routes.distance_km NULL olabilir (Faz 1 teknik borcu) — coalesce
      -- ile PostGIS'ten gerçek uzunluk hesaplanıyor (bkz. yukarıdaki not).
      and rr.distance_km >= coalesce(r.distance_km, st_length(r.path) / 1000) * 0.5
    group by rr.user_id
    order by count(distinct rr.route_id) desc
    limit 1;

    if winner_id is not null then
      insert into weekly_awards (week_start, category, user_id) values (prev_week_start, 'routes_ridden', winner_id);
      perform award_badge_if_needed(winner_id, 'haftalik_birincilik');
    end if;
  end if;

  -- Süreklilik: geçen hafta dahil son 4 hafta boyunca üst üste en az bir
  -- kategoride aktif olan herkese rozet. weekly_awards'ta bunun için ayrı
  -- bir "işlendi" kaydı TUTMUYORUZ — award_badge_if_needed zaten idempotent
  -- (unique(user_id,badge_id)), bu taramanın her çağrıda tekrar çalışması
  -- zararsız ve bu ölçekte önemsiz maliyetli.
  perform award_badge_if_needed(streak_user.id, 'sureklilik_4hafta')
  from profiles streak_user
  where user_active_in_week(streak_user.id, prev_week_start)
    and user_active_in_week(streak_user.id, prev_week_start - interval '7 days')
    and user_active_in_week(streak_user.id, prev_week_start - interval '14 days')
    and user_active_in_week(streak_user.id, prev_week_start - interval '21 days');
end;
$$;

-- =======================================================================
-- 8) KADEMELİ ROZETLER — ilgili tabloya her yeni satır eklendiğinde (veya
--    en iyi cevap seçildiğinde) kullanıcının YAŞAM BOYU toplamını sayıp
--    eşiği geçtiyse rozeti verir. award_badge_if_needed idempotent olduğu
--    için tekrar tetiklenmesi zararsız.
-- =======================================================================

create or replace function check_route_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  total int;
begin
  select count(*) into total from routes where creator_id = new.creator_id and is_hidden = false;
  if total >= 1 then perform award_badge_if_needed(new.creator_id, 'ilk_rota'); end if;
  if total >= 5 then perform award_badge_if_needed(new.creator_id, 'rota_5'); end if;
  if total >= 10 then perform award_badge_if_needed(new.creator_id, 'rota_10'); end if;
  return new;
end;
$$;

create trigger trg_routes_check_badges
  after insert on routes
  for each row execute function check_route_badges();

create or replace function check_poi_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  total int;
begin
  select count(*) into total from pois where creator_id = new.creator_id and is_hidden = false;
  if total >= 1 then perform award_badge_if_needed(new.creator_id, 'ilk_poi'); end if;
  if total >= 10 then perform award_badge_if_needed(new.creator_id, 'poi_10'); end if;
  if total >= 25 then perform award_badge_if_needed(new.creator_id, 'poi_25'); end if;
  return new;
end;
$$;

create trigger trg_pois_check_badges
  after insert on pois
  for each row execute function check_poi_badges();

create or replace function check_best_answer_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  answer_owner uuid;
  total int;
begin
  if new.best_answer_id is null or new.best_answer_id is not distinct from old.best_answer_id then
    return new;
  end if;
  select user_id into answer_owner from forum_answers where id = new.best_answer_id;
  if answer_owner is null then
    return new;
  end if;

  select count(*) into total
  from forum_questions q
  join forum_answers a on a.id = q.best_answer_id
  where a.user_id = answer_owner;

  if total >= 1 then perform award_badge_if_needed(answer_owner, 'ilk_en_iyi_cevap'); end if;
  if total >= 10 then perform award_badge_if_needed(answer_owner, 'en_iyi_cevap_10'); end if;
  return new;
end;
$$;

create trigger trg_forum_questions_check_best_answer_badges
  after update of best_answer_id on forum_questions
  for each row execute function check_best_answer_badges();

-- Farklı rota sürme rozetleri: leaderboard fonksiyonuyla aynı %50 eşiği,
-- ama YAŞAM BOYU (haftalık değil) distinct sayım.
create or replace function check_route_ridden_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  route_distance numeric;
  total int;
begin
  if new.route_id is null or new.source <> 'recorded' or new.is_suspicious then
    return new;
  end if;

  select coalesce(distance_km, st_length(path) / 1000) into route_distance from routes where id = new.route_id;
  if route_distance is null or new.distance_km < route_distance * 0.5 then
    return new;
  end if;

  select count(distinct qualifying.route_id) into total
  from (
    select rr.route_id
    from recorded_rides rr
    join routes r on r.id = rr.route_id
    where rr.user_id = new.user_id
      and rr.source = 'recorded'
      and rr.is_suspicious = false
      and rr.route_id is not null
      -- routes.distance_km NULL olabilir (Faz 1 teknik borcu) — coalesce
      -- ile PostGIS'ten gerçek uzunluk hesaplanıyor (bkz. yukarıdaki not).
      and rr.distance_km >= coalesce(r.distance_km, st_length(r.path) / 1000) * 0.5
  ) qualifying;

  if total >= 5 then perform award_badge_if_needed(new.user_id, 'farkli_rota_5'); end if;
  if total >= 10 then perform award_badge_if_needed(new.user_id, 'farkli_rota_10'); end if;
  if total >= 25 then perform award_badge_if_needed(new.user_id, 'farkli_rota_25'); end if;
  return new;
end;
$$;

create trigger trg_recorded_rides_check_badges
  after insert on recorded_rides
  for each row execute function check_route_ridden_badges();
