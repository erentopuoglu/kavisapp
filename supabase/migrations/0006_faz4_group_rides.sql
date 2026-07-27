-- =====================================================================
-- Kavis — Faz 4 şema ekleri (0000-0005 zaten uygulanmış projeler için
-- artımlı düzeltme)
-- =====================================================================
-- Yeni/sıfır bir projede buna gerek yok — güncel 0000_init_schema.sql
-- bunları zaten içeriyor.
--
-- 1) group_rides.start_point_geojson ve live_locations.location_geojson —
--    routes.path_geojson / pois.location_geojson ile birebir aynı desen
--    (PostgREST geography sütununu GeoJSON değil EWKB hex olarak döndürür).
-- 2) group_ride_messages için dakikada ~20 mesaj sel/flood koruması
--    (INSERT trigger — RLS'in aksine hangi yoldan yazılırsa yazılsın
--    atlanamaz).
-- 3) İptal edilen ('cancelled') bir etkinlikte sohbete yazma kapanır;
--    okuma politikası durumdan bağımsız olduğu için okuma zaten açık kalır.
-- 4) live_locations.updated_at her zaman sunucu saatiyle yazılır — canlı
--    konum "tazelik" göstergesi buna dayanıyor, client saatine güvenilmez.
-- 5) live_locations_insert_own / update_own politikaları select ile simetrik
--    hâle getirildi (is_ride_creator OR is_approved_participant) — aksi
--    hâlde etkinlik sahibi kendi canlı konumunu hiç paylaşamıyordu.
-- 6) group_ride_messages ve live_locations Realtime yayınına (supabase_realtime)
--    eklendi — sohbet ve canlı konum anlık güncelleniyor.
-- 7) GÜVENLİK DÜZELTMESİ: group_ride_participants_update politikasının
--    with check'i sadece "kendi satırın ya da sahipsin" kontrol ediyordu,
--    HANGİ status'e geçildiğini kontrol etmiyordu — yani bir katılımcı
--    kendi 'requested' satırını doğrudan 'approved' yaparak sahibinin
--    onayını ve kontenjan kontrolünü tamamen atlayabiliyordu. Artık
--    kullanıcı kendi satırında sadece 'left'e geçebilir.
--
-- Ayrıca gerekli: iki yeni Edge Function deploy edilmeli:
--   supabase functions deploy manage-group-ride-participant
--   supabase functions deploy end-group-ride
-- =====================================================================

-- --- 1) group_rides.start_point_geojson ---------------------------------
alter table group_rides add column if not exists start_point_geojson jsonb;

create or replace function sync_group_ride_start_point_geojson()
returns trigger language plpgsql as $$
begin
  if new.start_point is null then
    new.start_point_geojson := null;
  else
    new.start_point_geojson := st_asgeojson(new.start_point)::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_group_rides_sync_start_point_geojson on group_rides;
create trigger trg_group_rides_sync_start_point_geojson
  before insert or update of start_point on group_rides
  for each row execute function sync_group_ride_start_point_geojson();

update group_rides set start_point_geojson = st_asgeojson(start_point)::jsonb
where start_point is not null and start_point_geojson is null;

-- --- 2) live_locations.location_geojson + updated_at sunucu saati ------
alter table live_locations add column if not exists location_geojson jsonb;

create or replace function sync_live_location_geojson()
returns trigger language plpgsql as $$
begin
  new.location_geojson := st_asgeojson(new.location)::jsonb;
  return new;
end;
$$;

drop trigger if exists trg_live_locations_sync_location_geojson on live_locations;
create trigger trg_live_locations_sync_location_geojson
  before insert or update of location on live_locations
  for each row execute function sync_live_location_geojson();

drop trigger if exists trg_live_locations_updated_at on live_locations;
create trigger trg_live_locations_updated_at
  before update on live_locations
  for each row execute function set_updated_at();

update live_locations set location_geojson = st_asgeojson(location)::jsonb
where location_geojson is null;

-- --- 3) Sohbet sel/flood koruması ----------------------------------------
create or replace function guard_group_ride_message_rate_limit()
returns trigger language plpgsql as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from group_ride_messages
  where ride_id = new.ride_id
    and user_id = new.user_id
    and created_at > now() - interval '1 minute';

  if recent_count >= 20 then
    raise exception 'Çok hızlı mesaj gönderiyorsunuz, lütfen biraz bekleyin.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_group_ride_messages_rate_limit on group_ride_messages;
create trigger trg_group_ride_messages_rate_limit
  before insert on group_ride_messages
  for each row execute function guard_group_ride_message_rate_limit();

-- --- 4) İptal edilen etkinlikte sohbete yazma kilidi ---------------------
drop policy if exists "group_ride_messages_insert" on group_ride_messages;
create policy "group_ride_messages_insert"
  on group_ride_messages for insert
  with check (
    auth.uid() = user_id
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status <> 'cancelled')
  );

-- --- 5) live_locations insert/update: etkinlik sahibi de dahil ----------
drop policy if exists "live_locations_insert_own" on live_locations;
create policy "live_locations_insert_own"
  on live_locations for insert
  with check (
    auth.uid() = user_id
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status = 'active')
  );

drop policy if exists "live_locations_update_own" on live_locations;
create policy "live_locations_update_own"
  on live_locations for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status = 'active')
  );

-- --- 6) Realtime: sohbet + canlı konum yayına eklensin -------------------
do $$
begin
  alter publication supabase_realtime add table group_ride_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table live_locations;
exception when duplicate_object then null;
end $$;

-- --- 7) Güvenlik düzeltmesi: kendi kendini onaylama açığı ---------------
drop policy if exists "group_ride_participants_update" on group_ride_participants;
create policy "group_ride_participants_update"
  on group_ride_participants for update
  using (auth.uid() = user_id or is_ride_creator(ride_id, auth.uid()))
  with check (
    (auth.uid() = user_id and status = 'left')
    or is_ride_creator(ride_id, auth.uid())
  );
