-- ---------------------------------------------------------------------
-- Uygulama içi admin/moderasyon bölümü için veri modeli.
-- ---------------------------------------------------------------------
-- profiles.is_banned Faz 0'dan beri şemada duruyor ama hiçbir RLS
-- politikası ona bakmıyordu — tamamen dekoratifti. Bu migration hem
-- gerçek bir insan-onaylı moderasyon akışı (is_admin + admin'e genişletilmiş
-- görünürlük) hem de is_banned'ı gerçekten işler hale getiriyor (aşağıdaki
-- 5. bölüm). Moderasyon AKSİYONLARI (gizle/geri aç/banla) hâlâ istemciden
-- doğrudan yazılamıyor — sadece Edge Function'lar (service_role) üzerinden,
-- bkz. supabase/functions/admin-manage-user, admin-moderate-content.

-- ---------------------------------------------------------------------
-- 1) profiles.is_admin
-- ---------------------------------------------------------------------
alter table profiles add column is_admin boolean not null default false;

-- guard_profiles_is_banned() ile birebir aynı desen — ayrı fonksiyon,
-- var olan is_banned guard'ını değiştirmiyor (0000_init_schema.sql'in
-- "her alan için açık ve test edilebilir ayrı fonksiyon" prensibiyle
-- tutarlı).
create or replace function guard_profiles_is_admin()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_guard_admin
  before update on profiles
  for each row execute function guard_profiles_is_admin();

-- ---------------------------------------------------------------------
-- 2) RLS politikalarında tekrar tekrar aynı alt sorguyu yazmamak için
--    küçük yardımcı fonksiyonlar (is_ride_creator/is_approved_participant
--    ile aynı desen).
-- ---------------------------------------------------------------------
create or replace function is_current_user_admin()
returns boolean language sql stable as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function is_current_user_banned()
returns boolean language sql stable as $$
  select coalesce((select is_banned from profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------
-- 3) Admin'e genişletilmiş SELECT — var olan politikaların YANINA
--    ekleniyor, hiçbiri değiştirilmiyor. Aynı komut için birden çok
--    select politikası Postgres'te OR'lanır: normal kullanıcı davranışı
--    aynı kalır, admin ek olarak gizli içeriği ve tüm raporları görebilir.
--    (profiles için yeni politika gerekmiyor — profiles_select_public
--    zaten herkese açık; is_banned de bugün aynı şekilde herkese
--    görünür, is_admin aynı emsalle tutarlı bırakıldı.)
-- ---------------------------------------------------------------------
create policy "routes_select_admin"
  on routes for select
  using (is_current_user_admin());

create policy "pois_select_admin"
  on pois for select
  using (is_current_user_admin());

create policy "forum_questions_select_admin"
  on forum_questions for select
  using (is_current_user_admin());

create policy "forum_answers_select_admin"
  on forum_answers for select
  using (is_current_user_admin());

create policy "group_ride_messages_select_admin"
  on group_ride_messages for select
  using (is_current_user_admin());

create policy "reports_select_admin"
  on reports for select
  using (is_current_user_admin());

-- ---------------------------------------------------------------------
-- 4) is_banned'ın gerçekten işlemesi (savunma katmanı).
-- ---------------------------------------------------------------------
-- Asıl ban, admin-manage-user Edge Function'ında GoTrue seviyesinde
-- (auth.admin.updateUserById ile ban_duration) uygulanıyor — bu, yeni
-- giriş/refresh'i tamamen engeller. Ama halihazırda geçerli bir access
-- token'ı olan banlı bir kullanıcı, süresi dolana kadar (~1 saat) yine
-- de istek atabilir; aşağıdaki politika güncellemeleri en azından bu
-- pencerede YENİ içerik üretimini engelliyor. Oy/puanlama/katılım gibi
-- daha düşük öncelikli insert yolları bu turda bilinçli olarak kapsam
-- dışı (bkz. README Teknik Borç).
drop policy if exists "routes_insert_own" on routes;
create policy "routes_insert_own"
  on routes for insert
  with check (auth.uid() = creator_id and not is_current_user_banned());

drop policy if exists "pois_insert_own" on pois;
create policy "pois_insert_own"
  on pois for insert
  with check (auth.uid() = creator_id and not is_current_user_banned());

drop policy if exists "forum_questions_insert_own" on forum_questions;
create policy "forum_questions_insert_own"
  on forum_questions for insert
  with check (auth.uid() = user_id and not is_current_user_banned());

drop policy if exists "forum_answers_insert_own" on forum_answers;
create policy "forum_answers_insert_own"
  on forum_answers for insert
  with check (auth.uid() = user_id and not is_current_user_banned());

drop policy if exists "group_ride_messages_insert" on group_ride_messages;
create policy "group_ride_messages_insert"
  on group_ride_messages for insert
  with check (
    auth.uid() = user_id
    and not is_current_user_banned()
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and exists (select 1 from group_rides gr where gr.id = ride_id and gr.status <> 'cancelled')
  );
