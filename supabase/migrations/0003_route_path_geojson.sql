-- =====================================================================
-- Kavis — Faz 1 BUG DÜZELTMESİ: routes.path GeoJSON olarak dönmüyordu
-- =====================================================================
-- KÖK NEDEN: PostgREST, `geography` tipli sütunları (routes.path)
-- varsayılan olarak EWKB HEX METNİ olarak döndürür (örn.
-- "0102000020E6100000...") — GeoJSON ({"type":"LineString",...}) DEĞİL.
-- Bizim istemci kodumuz (geoJsonLineStringToLatLngs) bu hex string'i
-- GeoJSON bekleyerek `.coordinates` okumaya çalışıyordu; string'in böyle
-- bir alanı olmadığından sessizce boş dizi ([]) dönüyordu → harita
-- ekranlarında polyline'a hiç koordinat gitmiyordu (rota çizgisi
-- görünmüyordu). Lng/lat sıralaması ile ilgisi yoktu — WKT yazma
-- (pointsToLineStringWkt) ve GeoJSON okuma (geoJsonLineStringToLatLngs)
-- kodları zaten tutarlıydı (ikisi de longitude'u önce alıyordu).
--
-- ÇÖZÜM: routes tablosuna path'in GeoJSON temsilini tutan ayrı bir
-- `path_geojson` sütunu eklendi; bu sütun her insert/update'te
-- ST_AsGeoJSON ile otomatik senkronlanıyor. İstemci artık `path` yerine
-- `path_geojson` okuyor.
-- =====================================================================

alter table routes add column if not exists path_geojson jsonb;

create or replace function sync_route_path_geojson()
returns trigger language plpgsql as $$
begin
  new.path_geojson := st_asgeojson(new.path)::jsonb;
  return new;
end;
$$;

drop trigger if exists trg_routes_sync_path_geojson on routes;
create trigger trg_routes_sync_path_geojson
  before insert or update of path on routes
  for each row execute function sync_route_path_geojson();

-- Mevcut tüm satırları (test amaçlı oluşturulan "deneme" rotası dahil,
-- hangi id'ye sahip olduğunu bilmeye gerek kalmadan) tek seferlik geriye
-- dönük doldurur.
update routes set path_geojson = st_asgeojson(path)::jsonb where path_geojson is null;
