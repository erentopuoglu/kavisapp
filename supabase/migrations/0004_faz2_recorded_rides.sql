-- =====================================================================
-- Kavis — Faz 2 şema ekleri (0000-0003 zaten uygulanmış projeler için
-- artımlı düzeltme)
-- =====================================================================
-- Yeni/sıfır bir projede buna gerek yok — güncel 0000_init_schema.sql
-- bunları zaten içeriyor.
-- =====================================================================

-- 1) recorded_rides.track için nokta limiti (savunma amaçlı; canlı kayıt
--    ve GPX içe aktarma zaten kaydetmeden önce sadeleştiriyor).
alter table recorded_rides
  add constraint recorded_rides_track_point_limit
  check (track is null or st_npoints(track::geometry) <= 3500);

-- 2) track_geojson — routes.path_geojson ile birebir aynı desen (Faz 1'de
--    bulunan "PostgREST geography sütununu GeoJSON değil EWKB hex olarak
--    döndürür" bug'ını burada baştan önlüyoruz).
alter table recorded_rides add column if not exists track_geojson jsonb;

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

drop trigger if exists trg_recorded_rides_sync_track_geojson on recorded_rides;
create trigger trg_recorded_rides_sync_track_geojson
  before insert or update of track on recorded_rides
  for each row execute function sync_recorded_ride_track_geojson();

update recorded_rides set track_geojson = st_asgeojson(track)::jsonb
where track_geojson is null and track is not null;

-- 3) gpx-files Storage bucket'ı (sadece GPX içe aktarmada orijinal
--    dosyayı saklamak için; private, sahibi-klasörü deseni).
insert into storage.buckets (id, name, public)
values ('gpx-files', 'gpx-files', false)
on conflict (id) do nothing;

drop policy if exists "gpx_files_owner_read" on storage.objects;
create policy "gpx_files_owner_read"
  on storage.objects for select
  using (bucket_id = 'gpx-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "gpx_files_owner_write" on storage.objects;
create policy "gpx_files_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'gpx-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "gpx_files_owner_delete" on storage.objects;
create policy "gpx_files_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'gpx-files' and (storage.foldername(name))[1] = auth.uid()::text);
