-- =====================================================================
-- Kavis — Faz 3 şema ekleri (0000-0004 zaten uygulanmış projeler için
-- artımlı düzeltme)
-- =====================================================================
-- Yeni/sıfır bir projede buna gerek yok — güncel 0000_init_schema.sql
-- bunları zaten içeriyor.
--
-- pois.location_geojson — routes.path_geojson / recorded_rides.track_geojson
-- ile birebir aynı desen (PostgREST geography sütununu GeoJSON değil EWKB
-- hex olarak döndürüyor; Faz 1'de bulunan bug'ı burada baştan önlüyoruz).
--
-- Not: Faz 3'ün diğer parçası olan rapor hız sınırı + kendi kendini onaran
-- "gizle" taraması Edge Function'da (supabase/functions/submit-report)
-- yaşıyor — şema değişikliği gerektirmiyor, ayrıca `supabase functions
-- deploy submit-report` ile deploy edilmesi gerekiyor.
-- =====================================================================

alter table pois add column if not exists location_geojson jsonb;

create or replace function sync_poi_location_geojson()
returns trigger language plpgsql as $$
begin
  new.location_geojson := st_asgeojson(new.location)::jsonb;
  return new;
end;
$$;

drop trigger if exists trg_pois_sync_location_geojson on pois;
create trigger trg_pois_sync_location_geojson
  before insert or update of location on pois
  for each row execute function sync_poi_location_geojson();

update pois set location_geojson = st_asgeojson(location)::jsonb
where location_geojson is null;
