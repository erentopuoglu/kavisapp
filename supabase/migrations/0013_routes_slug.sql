-- ---------------------------------------------------------------------
-- routes.slug — kavisapp.com'daki /rotalar/{slug} sayfaları için kalıcı,
-- SEO-dostu bir tanımlayıcı. UUID'yi (routes.id) URL'de kullanmak yerine
-- ayrı bir kolon: sebep, arama motorları için okunabilir bir URL
-- ("mersin-ayvagedigi") istiyoruz ama bunu title'dan HER İSTEK'te
-- türetmek yerine bir kez üretip DONDURMAK gerekiyor — title değişirse
-- (ör. bir yazım hatası düzeltilirse) türetilmiş bir slug da değişir,
-- bu da yayında indexlenmiş bir URL'i kırar (arama sıralamasını sıfırlar,
-- düzeltmesi kalıcı yönlendirme/redirect yönetimi gerektirir). Bu yüzden
-- slug İLK üretildiği andan sonra title'dan tamamen bağımsızlaşıyor.
-- ---------------------------------------------------------------------

-- Türkçe karaktere duyarlı, saf/immutable bir slugify — hem burada
-- (trigger + geriye dönük doldurma) hem gerekirse başka bir yerden
-- (ör. ileride bir admin ekranından manuel slug önerisi) kullanılabilir.
-- Sıra ÖNEMLİ: Türkçe harfleri ASCII karşılıklarına çevirmek `lower()`'dan
-- ÖNCE yapılıyor — aksi halde 'İ' (noktalı büyük I) harfinin küçük hali,
-- veritabanının collation'ına göre belirsizleşebilir (Türkçe kurallarında
-- 'i̇' iki karakterli bir sonuca da dönüşebilir). Önce translate ile tek
-- karaktere sabitleyip SONRA lower() çağırmak bu belirsizliği ortadan
-- kaldırıyor.
create or replace function slugify_tr(input text)
returns text language sql immutable as $$
  select trim(both '-' from
    regexp_replace(
      lower(translate(input, 'ÇĞİıÖŞÜçğöşü', 'CGIiOSUcgosu')),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

alter table routes add column slug text;

-- Geriye dönük doldurma: var olan tüm rotalar için, oluşturulma sırasına
-- göre (en eski önce — bu, hangi rotanın "temiz" slug'ı hangi rotanın
-- -2/-3 son ekli halini alacağını DETERMİNİSTİK kılıyor) slug üretiliyor.
-- Aynı temel slug'a çarpan bir sonraki rota otomatik -2, -3... alır.
do $$
declare
  r record;
  base_slug text;
  candidate text;
  suffix int;
begin
  for r in select id, title from routes where slug is null order by created_at loop
    base_slug := slugify_tr(r.title);
    candidate := base_slug;
    suffix := 1;
    while exists (select 1 from routes where slug = candidate) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;
    update routes set slug = candidate where id = r.id;
  end loop;
end $$;

alter table routes alter column slug set not null;
alter table routes add constraint routes_slug_unique unique (slug);

-- Yeni bir rota eklendiğinde slug otomatik üretilir (çağıran zaten bir
-- değer verdiyse dokunulmaz — ileride elle düzeltme ihtiyacı olursa diye
-- kapı açık bırakılıyor). GÜNCELLEMEDE ise slug HER ZAMAN eskisine
-- zorlanır — bu projedeki guard trigger deseniyle birebir aynı (bkz.
-- guard_profiles_is_banned, guard_routes_is_hidden): istemci
-- routes_update_own ile kendi rotasını güncelleyebilir ama slug'a asla
-- dokunamaz, title değişse bile.
create or replace function set_route_slug()
returns trigger language plpgsql as $$
declare
  base_slug text;
  candidate text;
  suffix int := 1;
begin
  if tg_op = 'UPDATE' then
    new.slug := old.slug;
    return new;
  end if;

  if new.slug is not null and length(trim(new.slug)) > 0 then
    return new;
  end if;

  base_slug := slugify_tr(new.title);
  candidate := base_slug;
  while exists (select 1 from routes where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger trg_routes_set_slug
  before insert or update on routes
  for each row execute function set_route_slug();
