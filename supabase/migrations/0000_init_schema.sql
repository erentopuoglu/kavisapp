-- =====================================================================
-- Kavis — Faz 0 Başlangıç Şeması
-- Tüm tablolar + RLS politikaları (tüm fazlar için baştan tasarlandı)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0.5 ŞEMA YETKİLERİ (GRANT)
-- ---------------------------------------------------------------------
-- RLS politikaları yalnızca rolün tabloya zaten temel bir yetkisi (GRANT)
-- varsa devreye girer — RLS bir FİLTRE'dir, GRANT ise KAPI'dır. Bu bloksuz
-- "permission denied for table X (42501)" hatası alınır. ALTER DEFAULT
-- PRIVILEGES sayesinde bundan sonra oluşturulacak tablolar da otomatik
-- yetkilenir.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. ENUM TİPLERİ
-- ---------------------------------------------------------------------
create type poi_type as enum (
  'gas_station',
  'motorcycle_friendly_cafe',
  'dangerous_curve',
  'gravel_road',
  'rest_stop',
  'scenic_viewpoint',
  'repair_shop'
);

create type vote_value as enum ('up', 'down');

create type group_ride_status as enum ('upcoming', 'active', 'completed', 'cancelled');

create type participant_status as enum ('requested', 'approved', 'rejected', 'left');

create type report_content_type as enum (
  'poi', 'route', 'forum_question', 'forum_answer', 'group_ride_message', 'user_profile'
);

create type report_status as enum ('pending', 'reviewed', 'actioned', 'dismissed');

-- ---------------------------------------------------------------------
-- 2. ORTAK YARDIMCI FONKSİYONLAR
-- ---------------------------------------------------------------------

-- updated_at otomatik güncelleme
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Moderasyon alanlarını (is_hidden / is_banned) sadece service_role değiştirebilir.
-- Normal kullanıcı isteği bu trigger sayesinde eski değeri korur; sadece
-- Edge Function (service_role anahtarıyla) gerçek değişikliği yapabilir.
-- Her tablo için ayrı guard fonksiyonu tanımlıyoruz (generic/dynamic SQL yerine
-- açık ve test edilebilir olsun diye):
create or replace function guard_profiles_is_banned()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.is_banned := old.is_banned;
  end if;
  return new;
end;
$$;

create or replace function guard_routes_is_hidden()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.is_hidden := old.is_hidden;
  end if;
  return new;
end;
$$;

create or replace function guard_pois_is_hidden()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.is_hidden := old.is_hidden;
  end if;
  return new;
end;
$$;

create or replace function guard_forum_is_hidden()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.is_hidden := old.is_hidden;
  end if;
  return new;
end;
$$;

-- NOT: is_ride_creator() ve is_approved_participant() fonksiyonları burada
-- DEĞİL, bölüm 10'da (group_rides + group_ride_participants tabloları
-- oluşturulduktan hemen sonra) tanımlanıyor. Bu iki fonksiyon `language sql`
-- olduğu için gövdelerindeki tablo referansları CREATE FUNCTION anında
-- çözülür (plpgsql'in aksine) — referans verdikleri tablolar henüz yoksa
-- "relation does not exist" hatasıyla migration başarısız olur.

-- ---------------------------------------------------------------------
-- 3. PROFILES
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  bio text,
  bike_model text,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Herkes (anon dahil) profilleri görebilir — paylaşılan rota/etkinlik
-- sayfalarında yaratıcı bilgisi gösterebilmek için.
create policy "profiles_select_public"
  on profiles for select
  using (true);

create policy "profiles_insert_own"
  on profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- delete yok: hesap silme yalnızca Edge Function (service_role) ile,
-- auth.users satırı silindiğinde cascade ile temizlenir.

create trigger trg_profiles_guard_ban
  before update on profiles
  for each row execute function guard_profiles_is_banned();

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- auth.users içine yeni kayıt olduğunda otomatik profile satırı oluştur
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)),
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'avatar_url', null)
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- 4. ROUTES (Rotalar)
-- ---------------------------------------------------------------------
create table routes (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  path geography(linestring, 4326) not null,
  constraint routes_path_point_limit check (st_npoints(path::geometry) <= 500),
  -- PostgREST, geography sütunlarını (path) varsayılan olarak EWKB hex
  -- metni olarak döndürür, GeoJSON DEĞİL. İstemcinin ihtiyaç duyduğu
  -- GeoJSON temsili bu ayrı sütunda, trg_routes_sync_path_geojson trigger'ı
  -- ile otomatik senkron tutulur.
  path_geojson jsonb,
  distance_km numeric(6,2),
  estimated_duration_min integer,
  region text,
  avg_curve_quality numeric(3,2) not null default 0,
  avg_road_surface numeric(3,2) not null default 0,
  avg_scenery numeric(3,2) not null default 0,
  avg_traffic numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  view_count integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_routes_path on routes using gist (path);
create index idx_routes_creator on routes (creator_id);
create index idx_routes_region on routes (region);

alter table routes enable row level security;

create policy "routes_select_visible"
  on routes for select
  using (is_hidden = false or creator_id = auth.uid());

create policy "routes_insert_own"
  on routes for insert
  with check (auth.uid() = creator_id);

create policy "routes_update_own"
  on routes for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create policy "routes_delete_own"
  on routes for delete
  using (auth.uid() = creator_id);

create trigger trg_routes_guard_hidden
  before update on routes
  for each row execute function guard_routes_is_hidden();

create trigger trg_routes_updated_at
  before update on routes
  for each row execute function set_updated_at();

create or replace function sync_route_path_geojson()
returns trigger language plpgsql as $$
begin
  new.path_geojson := st_asgeojson(new.path)::jsonb;
  return new;
end;
$$;

create trigger trg_routes_sync_path_geojson
  before insert or update of path on routes
  for each row execute function sync_route_path_geojson();

-- "Yakınımdaki rotalar" — supabase-js query builder ST_DWithin kuramadığı
-- için bir RPC olarak sunuluyor. SECURITY INVOKER (varsayılan): çağıranın
-- RLS'i geçerli kalır, sadece zaten görünür rotalar arasında filtreler.
create or replace function nearby_routes(user_lng double precision, user_lat double precision, radius_meters double precision default 50000)
returns setof routes language sql stable as $$
  select r.*
  from routes r
  where st_dwithin(r.path, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
  order by st_distance(r.path, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) asc;
$$;

-- routes_update_own politikası sadece creator_id = auth.uid() olduğunda
-- güncellemeye izin veriyor; ama view_count'u HERKESİN artırabilmesi
-- gerekiyor (rota sahibi olmayan bir kullanıcı rotayı görüntülediğinde).
-- Bu yüzden dar kapsamlı bir SECURITY DEFINER fonksiyon: SADECE view_count
-- alanına +1 yapar, başka hiçbir sütuna dokunmaz.
create or replace function increment_route_view_count(p_route_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update routes set view_count = view_count + 1 where id = p_route_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. ROUTE_RATINGS (Rota Puanlamaları)
-- ---------------------------------------------------------------------
create table route_ratings (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  curve_quality smallint not null check (curve_quality between 1 and 5),
  road_surface smallint not null check (road_surface between 1 and 5),
  scenery smallint not null check (scenery between 1 and 5),
  traffic smallint not null check (traffic between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, user_id)
);

alter table route_ratings enable row level security;

create policy "route_ratings_select_public"
  on route_ratings for select
  using (true);

-- Kullanıcı sadece kendi puanını yazabilir VE kendi oluşturduğu rotayı
-- puanlayamaz (rota sahibinin kendi rotasına 5 yıldız vermesini engeller).
create policy "route_ratings_insert_own"
  on route_ratings for insert
  with check (
    auth.uid() = user_id
    and user_id <> (select creator_id from routes where id = route_id)
  );

create policy "route_ratings_update_own"
  on route_ratings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and user_id <> (select creator_id from routes where id = route_id)
  );

create policy "route_ratings_delete_own"
  on route_ratings for delete
  using (auth.uid() = user_id);

create trigger trg_route_ratings_updated_at
  before update on route_ratings
  for each row execute function set_updated_at();

-- Puan ortalamalarını client hesaplayamaz; her insert/update/delete sonrası
-- routes tablosundaki agrega alanlar bu SECURITY DEFINER fonksiyonla
-- otomatik yeniden hesaplanır (kullanıcı tarafından kurcalanamaz).
create or replace function recompute_route_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_route_id uuid;
begin
  target_route_id := coalesce(new.route_id, old.route_id);

  update routes r set
    avg_curve_quality = coalesce((select avg(curve_quality) from route_ratings where route_id = target_route_id), 0),
    avg_road_surface  = coalesce((select avg(road_surface)  from route_ratings where route_id = target_route_id), 0),
    avg_scenery       = coalesce((select avg(scenery)       from route_ratings where route_id = target_route_id), 0),
    avg_traffic       = coalesce((select avg(traffic)       from route_ratings where route_id = target_route_id), 0),
    rating_count      = coalesce((select count(*)           from route_ratings where route_id = target_route_id), 0)
  where r.id = target_route_id;

  return null;
end;
$$;

create trigger trg_route_ratings_recompute
  after insert or update or delete on route_ratings
  for each row execute function recompute_route_rating();

-- ---------------------------------------------------------------------
-- 6. RECORDED_RIDES (GPX Kayıtları)
-- ---------------------------------------------------------------------
create table recorded_rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  track geography(linestring, 4326),
  -- Canlı kayıt + GPX içe aktarma her ikisi de kaydetmeden önce Douglas-
  -- Peucker ile sadeleştiriyor (bkz. src/shared/utils/geo.ts), ama yine de
  -- savunma amaçlı bir üst sınır: routes'tan farklı olarak GPX kayıtları
  -- saatlerce sürebildiği için limit çok daha yüksek.
  constraint recorded_rides_track_point_limit check (track is null or st_npoints(track::geometry) <= 3500),
  -- PostgREST bu sütunu EWKB hex metni olarak döndürür (GeoJSON DEĞİL) —
  -- bkz. routes.path_geojson'daki aynı desen (Faz 1'de bulunan bug).
  track_geojson jsonb,
  distance_km numeric(6,2),
  duration_seconds integer,
  avg_speed_kmh numeric(5,2),
  max_speed_kmh numeric(5,2),
  started_at timestamptz not null,
  ended_at timestamptz,
  is_shared boolean not null default false,
  gpx_storage_path text,
  created_at timestamptz not null default now()
);

create index idx_recorded_rides_track on recorded_rides using gist (track);
create index idx_recorded_rides_user on recorded_rides (user_id);

create or replace function sync_recorded_ride_track_geojson()
returns trigger language plpgsql as $$
begin
  if new.track is null then
    new.track_geojson := null;
  else
    new.track_geojson := st_asgeojson(new.track)::jsonb;
  end if;
  return new;
end;
$$;

create trigger trg_recorded_rides_sync_track_geojson
  before insert or update of track on recorded_rides
  for each row execute function sync_recorded_ride_track_geojson();

alter table recorded_rides enable row level security;

create policy "recorded_rides_select_own_or_shared"
  on recorded_rides for select
  using (auth.uid() = user_id or is_shared = true);

create policy "recorded_rides_insert_own"
  on recorded_rides for insert
  with check (auth.uid() = user_id);

create policy "recorded_rides_update_own"
  on recorded_rides for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recorded_rides_delete_own"
  on recorded_rides for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 7. POIS (Topluluk İşaretli Noktalar)
-- ---------------------------------------------------------------------
create table pois (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  type poi_type not null,
  location geography(point, 4326) not null,
  -- PostgREST bu sütunu EWKB hex metni olarak döndürür (GeoJSON DEĞİL) —
  -- routes.path_geojson / recorded_rides.track_geojson ile aynı desen.
  location_geojson jsonb,
  title text not null,
  description text,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pois_location on pois using gist (location);
create index idx_pois_type on pois (type);

create or replace function sync_poi_location_geojson()
returns trigger language plpgsql as $$
begin
  new.location_geojson := st_asgeojson(new.location)::jsonb;
  return new;
end;
$$;

create trigger trg_pois_sync_location_geojson
  before insert or update of location on pois
  for each row execute function sync_poi_location_geojson();

alter table pois enable row level security;

create policy "pois_select_visible"
  on pois for select
  using (is_hidden = false or creator_id = auth.uid());

create policy "pois_insert_own"
  on pois for insert
  with check (auth.uid() = creator_id);

create policy "pois_update_own"
  on pois for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create policy "pois_delete_own"
  on pois for delete
  using (auth.uid() = creator_id);

create trigger trg_pois_guard_hidden
  before update on pois
  for each row execute function guard_pois_is_hidden();

create trigger trg_pois_updated_at
  before update on pois
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 8. POI_VOTES (Doğrulama Oylaması)
-- ---------------------------------------------------------------------
create table poi_votes (
  id uuid primary key default gen_random_uuid(),
  poi_id uuid not null references pois(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  vote vote_value not null,
  created_at timestamptz not null default now(),
  unique (poi_id, user_id)
);

alter table poi_votes enable row level security;

create policy "poi_votes_select_public"
  on poi_votes for select
  using (true);

create policy "poi_votes_insert_own_not_self"
  on poi_votes for insert
  with check (
    auth.uid() = user_id
    and user_id <> (select creator_id from pois where id = poi_id)
  );

create policy "poi_votes_update_own"
  on poi_votes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "poi_votes_delete_own"
  on poi_votes for delete
  using (auth.uid() = user_id);

create or replace function recompute_poi_votes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_poi_id uuid;
begin
  target_poi_id := coalesce(new.poi_id, old.poi_id);

  update pois p set
    upvotes   = coalesce((select count(*) from poi_votes where poi_id = target_poi_id and vote = 'up'), 0),
    downvotes = coalesce((select count(*) from poi_votes where poi_id = target_poi_id and vote = 'down'), 0)
  where p.id = target_poi_id;

  return null;
end;
$$;

create trigger trg_poi_votes_recompute
  after insert or update or delete on poi_votes
  for each row execute function recompute_poi_votes();

-- ---------------------------------------------------------------------
-- 9. GROUP_RIDES (Grup Sürüşü Etkinlikleri)
-- ---------------------------------------------------------------------
create table group_rides (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  title text not null,
  description text,
  start_point geography(point, 4326),
  -- PostgREST bu sütunu EWKB hex metni olarak döndürür (GeoJSON DEĞİL) —
  -- routes.path_geojson / pois.location_geojson ile aynı desen.
  start_point_geojson jsonb,
  start_address text,
  scheduled_at timestamptz not null,
  max_participants integer,
  status group_ride_status not null default 'upcoming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_group_rides_start_point on group_rides using gist (start_point);
create index idx_group_rides_scheduled_at on group_rides (scheduled_at);

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

create trigger trg_group_rides_sync_start_point_geojson
  before insert or update of start_point on group_rides
  for each row execute function sync_group_ride_start_point_geojson();

alter table group_rides enable row level security;

create policy "group_rides_select_public"
  on group_rides for select
  using (true);

create policy "group_rides_insert_own"
  on group_rides for insert
  with check (auth.uid() = creator_id);

create policy "group_rides_update_own"
  on group_rides for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

create policy "group_rides_delete_own"
  on group_rides for delete
  using (auth.uid() = creator_id);

create trigger trg_group_rides_updated_at
  before update on group_rides
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 10. GROUP_RIDE_PARTICIPANTS (Katılım İstekleri)
-- ---------------------------------------------------------------------
create table group_ride_participants (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references group_rides(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status participant_status not null default 'requested',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (ride_id, user_id)
);

-- Bu iki yardımcı fonksiyon, gövdelerinde group_rides ve
-- group_ride_participants tablolarına referans verdiği için (language sql,
-- CREATE anında çözülür) her iki tablo da oluşturulduktan SONRA, ama bu
-- tablolar üzerindeki RLS politikalarından ÖNCE tanımlanmalı.
create or replace function is_ride_creator(p_ride_id uuid, p_user_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from group_rides where id = p_ride_id and creator_id = p_user_id
  );
$$;

-- Bir kullanıcının bir grup sürüşünde "approved" katılımcı olup olmadığı
create or replace function is_approved_participant(p_ride_id uuid, p_user_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from group_ride_participants
    where ride_id = p_ride_id
      and user_id = p_user_id
      and status = 'approved'
  );
$$;

alter table group_ride_participants enable row level security;

-- Kendi kaydını, etkinlik sahibini veya aynı etkinliğin onaylı
-- katılımcılarını görebilir (kim katılıyor listesini görmek için).
create policy "group_ride_participants_select"
  on group_ride_participants for select
  using (
    auth.uid() = user_id
    or is_ride_creator(ride_id, auth.uid())
    or is_approved_participant(ride_id, auth.uid())
  );

create policy "group_ride_participants_insert_self_request"
  on group_ride_participants for insert
  with check (auth.uid() = user_id and status = 'requested');

-- ÖNEMLİ: with check sadece "auth.uid() = user_id or is_ride_creator(...)"
-- olsaydı, bir katılımcı kendi 'requested' satırını doğrudan
-- status='approved' yaparak etkinlik sahibinin onayını ve
-- manage-group-ride-participant Edge Function'ının kontenjan kontrolünü
-- tamamen atlayabilirdi. Bu yüzden kullanıcının kendi satırında yapabildiği
-- TEK geçiş 'left' (sürüşten ayrılma) — approve/reject sadece sahibinin
-- (ki gerçek akışta bunu da Edge Function üzerinden yapar) elinde.
create policy "group_ride_participants_update"
  on group_ride_participants for update
  using (auth.uid() = user_id or is_ride_creator(ride_id, auth.uid()))
  with check (
    (auth.uid() = user_id and status = 'left')
    or is_ride_creator(ride_id, auth.uid())
  );

create policy "group_ride_participants_delete"
  on group_ride_participants for delete
  using (auth.uid() = user_id or is_ride_creator(ride_id, auth.uid()));

-- Not: Katılımcı limiti kontrolü ve onay/red bildirimleri Faz 4'te
-- bir Edge Function (manage-group-ride-participant) üzerinden yürütülecek;
-- RLS burada temel erişim kontrolünü sağlar, iş kuralları Edge Function'da.

-- ---------------------------------------------------------------------
-- 11. GROUP_RIDE_MESSAGES (Etkinlik Sohbeti)
-- ---------------------------------------------------------------------
create table group_ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references group_rides(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_group_ride_messages_ride on group_ride_messages (ride_id, created_at);

alter table group_ride_messages enable row level security;

create policy "group_ride_messages_select"
  on group_ride_messages for select
  using (
    is_hidden = false
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
  );

-- İptal edilen bir etkinlikte sohbete yazma kapanır (okuma açık kalır —
-- select politikası durumdan bağımsız). Sadece 'cancelled' engelleniyor;
-- 'completed' sürüşlerde sohbet kasıtlı olarak açık bırakılıyor.
create policy "group_ride_messages_insert"
  on group_ride_messages for insert
  with check (
    auth.uid() = user_id
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status <> 'cancelled')
  );

create policy "group_ride_messages_delete_own"
  on group_ride_messages for delete
  using (auth.uid() = user_id);

create trigger trg_group_ride_messages_guard_hidden
  before update on group_ride_messages
  for each row execute function guard_forum_is_hidden();

-- Sel/flood koruması: bir kullanıcı aynı etkinlikte dakikada ~20 mesajdan
-- fazla gönderemez. RLS'in aksine bu bir INSERT trigger'ı — hangi yoldan
-- (istemci, doğrudan REST, ileride başka bir Edge Function) yazılırsa
-- yazılsın atlanamaz.
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

create trigger trg_group_ride_messages_rate_limit
  before insert on group_ride_messages
  for each row execute function guard_group_ride_message_rate_limit();

-- ---------------------------------------------------------------------
-- 12. LIVE_LOCATIONS (Canlı Konum) — EN SIKI RLS
-- ---------------------------------------------------------------------
create table live_locations (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references group_rides(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  location geography(point, 4326) not null,
  -- PostgREST bu sütunu EWKB hex metni olarak döndürür (GeoJSON DEĞİL) —
  -- routes.path_geojson / pois.location_geojson ile aynı desen.
  location_geojson jsonb,
  heading numeric,
  speed_kmh numeric,
  updated_at timestamptz not null default now(),
  unique (ride_id, user_id)
);

create index idx_live_locations_ride on live_locations (ride_id);

create or replace function sync_live_location_geojson()
returns trigger language plpgsql as $$
begin
  new.location_geojson := st_asgeojson(new.location)::jsonb;
  return new;
end;
$$;

create trigger trg_live_locations_sync_location_geojson
  before insert or update of location on live_locations
  for each row execute function sync_live_location_geojson();

-- updated_at HER ZAMAN sunucu saatiyle yazılır (client cihaz saati asla
-- güvenilmez) — canlı konum "tazelik" göstergesi (soluklaşma/düşme) bu
-- alana dayanıyor, istemcinin göndereceği herhangi bir değer yok sayılır.
create trigger trg_live_locations_updated_at
  before update on live_locations
  for each row execute function set_updated_at();

alter table live_locations enable row level security;

-- Sadece aynı etkinliğin onaylı üyeleri (veya sahibi) okuyabilir,
-- ve etkinlik "active" durumda olmalı.
create policy "live_locations_select_ride_members_only"
  on live_locations for select
  using (
    exists (
      select 1 from group_rides gr
      where gr.id = live_locations.ride_id
        and gr.status = 'active'
    )
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
  );

-- Not: select politikasıyla simetrik olarak sahibi de dahil — etkinliği
-- yöneten kişi kendi katılımcı satırı olmadan da (ki normal akışta olmaz)
-- canlı konumunu paylaşabilmeli.
create policy "live_locations_insert_own"
  on live_locations for insert
  with check (
    auth.uid() = user_id
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status = 'active')
  );

create policy "live_locations_update_own"
  on live_locations for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status = 'active')
  );

create policy "live_locations_delete_own"
  on live_locations for delete
  using (auth.uid() = user_id);

-- Not: Sürüş bittiğinde (`end-group-ride` Edge Function, status -> 'completed'
-- yaparken) aynı Edge Function service_role ile o ride_id'ye ait TÜM
-- live_locations satırlarını siler. Böylece canlı konum verisi kalıcı
-- olarak saklanmaz.

-- Realtime (Postgres Changes): istemci sohbet mesajlarını ve canlı konum
-- güncellemelerini anlık almak için bu tabloları dinliyor. RLS, Realtime
-- akışına da uygulanır — erişimi olmayan satırlar hiç yayınlanmaz.
alter publication supabase_realtime add table group_ride_messages;
alter publication supabase_realtime add table live_locations;

-- ---------------------------------------------------------------------
-- 13. FORUM_QUESTIONS / FORUM_ANSWERS (Soru-Cevap)
-- ---------------------------------------------------------------------
create table forum_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  bike_model_tag text,
  tags text[] not null default '{}',
  best_answer_id uuid,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_forum_questions_tags on forum_questions using gin (tags);
create index idx_forum_questions_bike_model on forum_questions (bike_model_tag);

create table forum_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references forum_questions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_forum_answers_question on forum_answers (question_id);

alter table forum_questions
  add constraint fk_best_answer
  foreign key (best_answer_id) references forum_answers(id) on delete set null;

alter table forum_questions enable row level security;
alter table forum_answers enable row level security;

create policy "forum_questions_select_visible"
  on forum_questions for select
  using (is_hidden = false or user_id = auth.uid());

create policy "forum_questions_insert_own"
  on forum_questions for insert
  with check (auth.uid() = user_id);

create policy "forum_questions_update_own"
  on forum_questions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "forum_questions_delete_own"
  on forum_questions for delete
  using (auth.uid() = user_id);

create policy "forum_answers_select_visible"
  on forum_answers for select
  using (is_hidden = false or user_id = auth.uid());

create policy "forum_answers_insert_own"
  on forum_answers for insert
  with check (auth.uid() = user_id);

create policy "forum_answers_update_own"
  on forum_answers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "forum_answers_delete_own"
  on forum_answers for delete
  using (auth.uid() = user_id);

-- best_answer_id sadece soru sahibi tarafından, sadece kendi sorusuna ait
-- bir cevaba işaret edecek şekilde ayarlanabilir.
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
  end if;
  return new;
end;
$$;

create trigger trg_forum_questions_validate_best_answer
  before update of best_answer_id on forum_questions
  for each row execute function validate_best_answer();

create trigger trg_forum_questions_guard_hidden
  before update on forum_questions
  for each row execute function guard_forum_is_hidden();

create trigger trg_forum_answers_guard_hidden
  before update on forum_answers
  for each row execute function guard_forum_is_hidden();

create trigger trg_forum_questions_updated_at
  before update on forum_questions
  for each row execute function set_updated_at();

create trigger trg_forum_answers_updated_at
  before update on forum_answers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 14. REPORTS (İçerik Raporlama)
-- ---------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  content_type report_content_type not null,
  content_id uuid not null,
  reason text not null,
  details text,
  status report_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index idx_reports_content on reports (content_type, content_id);

alter table reports enable row level security;

-- Kullanıcı sadece kendi yaptığı raporları görebilir; başkasının
-- raporlarına veya moderasyon durumuna erişemez.
create policy "reports_select_own"
  on reports for select
  using (auth.uid() = reporter_id);

create policy "reports_insert_own"
  on reports for insert
  with check (auth.uid() = reporter_id);

-- update/delete yok: durum değişikliği (reviewed/actioned) yalnızca
-- moderasyon Edge Function'ı (service_role) tarafından yapılır.

-- ---------------------------------------------------------------------
-- 15. BLOCKS (Kullanıcı Engelleme)
-- ---------------------------------------------------------------------
create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table blocks enable row level security;

create policy "blocks_select_own"
  on blocks for select
  using (auth.uid() = blocker_id);

create policy "blocks_insert_own"
  on blocks for insert
  with check (auth.uid() = blocker_id);

create policy "blocks_delete_own"
  on blocks for delete
  using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------
-- 16. STORAGE BUCKETS (Faz 0: avatars, Faz 2: gpx-files)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- gpx-files: SADECE GPX içe aktarmada orijinal dosyayı saklamak için
-- (canlı kayıtlar `track`'ten anlık üretiliyor, Storage'a yüklenmiyor).
-- avatars'ın aksine PRIVATE — sadece sahibi okuyabilir/yazabilir.
insert into storage.buckets (id, name, public)
values ('gpx-files', 'gpx-files', false)
on conflict (id) do nothing;

create policy "gpx_files_owner_read"
  on storage.objects for select
  using (bucket_id = 'gpx-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gpx_files_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'gpx-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gpx_files_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'gpx-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Not: 'poi-photos' (Faz 3) bucket'ı ilgili fazda aynı owner-folder
-- desenine göre eklenecek.
