-- =====================================================================
-- Kavis — Faz 1 şema ekleri (0000_init_schema.sql zaten uygulanmış
-- projeler için artımlı düzeltme)
-- =====================================================================
-- Bu dosya sadece MEVCUT bir Kavis Supabase projesine (0000 + 0001 zaten
-- çalıştırılmış) Faz 1 için gereken ek kısıtları ve fonksiyonları uygular.
-- Yeni/sıfır bir projede buna gerek yok — güncel 0000_init_schema.sql
-- bunları zaten içeriyor.
-- =====================================================================

-- 1) Bir rotanın path'i en fazla 500 nokta içerebilir (aşırı büyük/karmaşık
--    geometrilerle depolama/performans sorunlarını önlemek için).
alter table routes
  add constraint routes_path_point_limit check (st_npoints(path::geometry) <= 500);

-- 2) "Yakınımdaki rotalar" RPC'si.
create or replace function nearby_routes(user_lng double precision, user_lat double precision, radius_meters double precision default 50000)
returns setof routes language sql stable as $$
  select r.*
  from routes r
  where st_dwithin(r.path, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
  order by st_distance(r.path, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) asc;
$$;

-- 3) view_count'u herkesin artırabilmesi için dar kapsamlı SECURITY DEFINER
--    fonksiyon (routes_update_own politikası sadece creator_id'ye izin verir).
create or replace function increment_route_view_count(p_route_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update routes set view_count = view_count + 1 where id = p_route_id;
end;
$$;

-- 4) Kullanıcı kendi rotasını puanlayamaz.
drop policy if exists "route_ratings_insert_own" on route_ratings;
create policy "route_ratings_insert_own"
  on route_ratings for insert
  with check (
    auth.uid() = user_id
    and user_id <> (select creator_id from routes where id = route_id)
  );

drop policy if exists "route_ratings_update_own" on route_ratings;
create policy "route_ratings_update_own"
  on route_ratings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and user_id <> (select creator_id from routes where id = route_id)
  );

-- Not: (route_id, user_id) unique kısıtı 0000_init_schema.sql'de zaten
-- tanımlıydı (route_ratings tablosunun ilk halinden beri) — burada tekrar
-- eklemeye gerek yok. İkinci puanlama denemesi istemci tarafında upsert
-- (on conflict route_id,user_id) ile update'e dönüştürülüyor.
