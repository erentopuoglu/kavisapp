-- =====================================================================
-- Kavis — Faz 0 RLS Smoke Test'leri
-- =====================================================================
-- AMAÇ: "Başka kullanıcının verisine erişme denemesi" senaryolarını
-- otomatik olarak doğrulamak. Her test bir DO bloğu içinde çalışır ve
-- beklenmeyen bir sonuç bulursa RAISE EXCEPTION ile script'i durdurur.
-- Script sonuna kadar hatasız çalışırsa tüm testler geçmiş demektir.
--
-- ÇALIŞTIRMA:
--   Bu script SADECE local (`supabase start`) veya bir staging projesinde
--   çalıştırılmalıdır — production'da ASLA çalıştırmayın (test kullanıcıları
--   ve verileri oluşturup script sonunda temizler, ama yine de risklidir).
--
--   supabase db reset   (migration'ları uygular)
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/0000_rls_smoke_tests.sql
--
-- NOT: Bu script auth.users tablosuna doğrudan test kullanıcıları ekler.
-- Bu yalnızca superuser/service_role bağlantısıyla mümkündür (SQL Editor
-- veya `psql` ile doğrudan bağlantı) — bu yüzden anon/authenticated rolüne
-- geçişleri `SET LOCAL ROLE` + `SET LOCAL request.jwt.claims` ile simüle
-- ediyoruz (Supabase'in auth.uid() fonksiyonunun okuduğu ayar budur).
--
-- Bu dosya sadece SQL/RLS'i kapsar. Edge Function'ların HTTP davranışını
-- (örn. login-with-username'in yanlış şifre/var olmayan kullanıcı adı
-- senaryoları) psql'den test edemeyiz — onun için ayrı, curl tabanlı bir
-- script var: 0001_login_with_username_smoke_test.sh.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Test kullanıcıları (A, B) ve yardımcı fonksiyon
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values
    (user_a_id, 'test-user-a@kavis.test', crypt('test-password-a', gen_salt('bf')), now(), '{"username":"test_user_a"}'::jsonb),
    (user_b_id, 'test-user-b@kavis.test', crypt('test-password-b', gen_salt('bf')), now(), '{"username":"test_user_b"}'::jsonb)
  on conflict (id) do nothing;
end $$;

-- Rolü authenticated + auth.uid() belirli bir kullanıcıya eşitleyen yardımcı
create or replace function pg_temp.act_as(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create or replace function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end;
$$;

-- Claims'i temizleyip rolü sıfırlayan (superuser bağlantısına dönen)
-- yardımcı — sadece service_role'ün yapabileceği bir yazımı (is_admin/
-- is_hidden'ı elle true yapmak gibi) simüle etmek için kullanılıyor.
-- Guard trigger'lar `auth.role() <> 'service_role'` kontrolü yapıyor;
-- claims temizken auth.role() NULL döner, `NULL <> 'service_role'` de
-- NULL (plpgsql'de false muamelesi görür) olduğundan guard devreye
-- girmez — dosyanın en başındaki (herhangi bir act_as çağrısından önceki)
-- auth.users insert'lerinin de zaten dayandığı mekanizma budur.
create or replace function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) PROFILES
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  affected_rows int;
  is_still_banned boolean;
begin
  -- Anon profilleri okuyabilmeli (public select)
  perform pg_temp.act_as_anon();
  perform 1 from profiles where id = user_a_id;
  if not found then
    raise exception 'FAIL(profiles): anon kendi profilini bile göremiyor (select politikası bozuk)';
  end if;

  -- B, A'nın profilini güncelleyemez
  perform pg_temp.act_as(user_b_id);
  update profiles set bio = 'hacked by B' where id = user_a_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'FAIL(profiles): kullanıcı B, kullanıcı A''nın profilini güncelleyebildi!';
  end if;

  -- A kendi is_banned alanını true yapmaya çalışır, guard trigger engellemeli
  perform pg_temp.act_as(user_a_id);
  update profiles set is_banned = true where id = user_a_id;
  select is_banned into is_still_banned from profiles where id = user_a_id;
  if is_still_banned then
    raise exception 'FAIL(profiles): kullanıcı kendi is_banned alanını true yapabildi!';
  end if;

  -- A kendi username'ini kurala uymayan bir değere çevirmeye çalışır —
  -- profiles_username_format CHECK constraint reddetmeli (bkz.
  -- 0010_username_format_constraint.sql; istemciyi atlayıp doğrudan
  -- yazan bir istemciye karşı DB seviyesi savunma).
  perform pg_temp.act_as(user_a_id);
  begin
    update profiles set username = 'Geçersiz Ad!' where id = user_a_id;
    raise exception 'FAIL(profiles): kurala uymayan bir username kabul edildi (CHECK constraint çalışmıyor)!';
  exception
    when check_violation then
      null; -- beklenen davranış
  end;

  raise notice 'PASS: profiles RLS + guard trigger testleri geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 2) ROUTES
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  new_route_id uuid;
  affected_rows int;
  is_still_hidden boolean;
begin
  perform pg_temp.act_as(user_a_id);
  insert into routes (creator_id, title, path)
  values (user_a_id, 'Test Rotası', st_geogfromtext('LINESTRING(29.0 41.0, 29.1 41.1)'))
  returning id into new_route_id;

  -- B, A'nın rotasını silemez
  perform pg_temp.act_as(user_b_id);
  delete from routes where id = new_route_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'FAIL(routes): kullanıcı B, kullanıcı A''nın rotasını silebildi!';
  end if;

  -- A kendi rotasını gizlemeye (is_hidden=true) çalışır, guard trigger engellemeli
  perform pg_temp.act_as(user_a_id);
  update routes set is_hidden = true where id = new_route_id;
  select is_hidden into is_still_hidden from routes where id = new_route_id;
  if is_still_hidden then
    raise exception 'FAIL(routes): kullanıcı kendi rotasını is_hidden=true yaparak gizleyebildi!';
  end if;

  raise notice 'PASS: routes RLS + guard trigger testleri geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 3) POIS + POI_VOTES (kendi POI'sine oy veremez)
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  new_poi_id uuid;
  vote_failed boolean := false;
begin
  perform pg_temp.act_as(user_a_id);
  insert into pois (creator_id, type, location, title)
  values (user_a_id, 'gas_station', st_geogfromtext('POINT(29.0 41.0)'), 'Test Benzinlik')
  returning id into new_poi_id;

  begin
    insert into poi_votes (poi_id, user_id, vote) values (new_poi_id, user_a_id, 'up');
  exception when insufficient_privilege then
    vote_failed := true;
  end;

  if not vote_failed then
    raise exception 'FAIL(poi_votes): kullanıcı kendi POI''sine oy verebildi!';
  end if;

  raise notice 'PASS: poi_votes kendi-oy-engeli testi geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 3b) POIS is_hidden guard trigger (Faz 3) — kullanıcı kendi POI'sini
-- client'tan gizleyip/açığa çıkaramaz, bu sadece submit-report Edge
-- Function'ının kullandığı service_role ile mümkün olmalı.
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  new_poi_id uuid;
  is_still_hidden boolean;
begin
  perform pg_temp.act_as(user_a_id);
  insert into pois (creator_id, type, location, title)
  values (user_a_id, 'rest_stop', st_geogfromtext('POINT(29.2 41.2)'), 'Test Mola Noktası')
  returning id into new_poi_id;

  update pois set is_hidden = true where id = new_poi_id;
  select is_hidden into is_still_hidden from pois where id = new_poi_id;
  if is_still_hidden then
    raise exception 'FAIL(pois): kullanıcı kendi POI''sini is_hidden=true yaparak gizleyebildi!';
  end if;

  raise notice 'PASS: pois is_hidden guard trigger testi geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 4) GROUP RIDES + LIVE_LOCATIONS (en sıkı RLS)
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  v_ride_id uuid;
  insert_failed boolean := false;
  visible_rows int;
begin
  -- A bir etkinlik oluşturur ('upcoming' durumunda başlar)
  perform pg_temp.act_as(user_a_id);
  insert into group_rides (creator_id, title, scheduled_at)
  values (user_a_id, 'Test Sürüşü', now() + interval '1 day')
  returning id into v_ride_id;

  -- B katılım isteği gönderir ama henüz onaylanmadı ('requested')
  perform pg_temp.act_as(user_b_id);
  insert into group_ride_participants (ride_id, user_id) values (v_ride_id, user_b_id);

  -- B, henüz 'approved' değilken canlı konum ekleyemez
  begin
    insert into live_locations (ride_id, user_id, location)
    values (v_ride_id, user_b_id, st_geogfromtext('POINT(29.0 41.0)'));
  exception when insufficient_privilege then
    insert_failed := true;
  end;
  if not insert_failed then
    raise exception 'FAIL(live_locations): onaylanmamış katılımcı canlı konum ekleyebildi!';
  end if;

  -- A, B'yi onaylar
  perform pg_temp.act_as(user_a_id);
  update group_ride_participants set status = 'approved', responded_at = now()
  where ride_id = v_ride_id and user_id = user_b_id;

  -- Sürüş hâlâ 'upcoming' (henüz 'active' değil) — onaylı olsa bile B konum ekleyemez
  perform pg_temp.act_as(user_b_id);
  insert_failed := false;
  begin
    insert into live_locations (ride_id, user_id, location)
    values (v_ride_id, user_b_id, st_geogfromtext('POINT(29.0 41.0)'));
  exception when insufficient_privilege then
    insert_failed := true;
  end;
  if not insert_failed then
    raise exception 'FAIL(live_locations): sürüş "active" olmadan onaylı katılımcı bile konum ekleyebildi!';
  end if;

  -- A sürüşü 'active' yapar (gerçek akışta bu bir Edge Function'dır)
  perform pg_temp.act_as(user_a_id);
  update group_rides set status = 'active' where id = v_ride_id;

  -- Şimdi B (onaylı + sürüş active) konum ekleyebilmeli
  perform pg_temp.act_as(user_b_id);
  insert into live_locations (ride_id, user_id, location)
  values (v_ride_id, user_b_id, st_geogfromtext('POINT(29.0 41.0)'));

  -- Etkinlikle hiç ilgisi olmayan biri (yeni test kullanıcısı yerine anon
  -- ile simüle ediyoruz) bu canlı konumu GÖRMEMELİ
  perform pg_temp.act_as_anon();
  select count(*) into visible_rows from live_locations where ride_id = v_ride_id;
  if visible_rows <> 0 then
    raise exception 'FAIL(live_locations): anon/ilgisiz kullanıcı canlı konumu görebildi!';
  end if;

  raise notice 'PASS: group_rides / live_locations üyelik + durum tabanlı RLS testleri geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 5) REPORTS (kullanıcı sadece kendi raporunu görebilir)
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  new_report_id uuid;
  visible_rows int;
begin
  perform pg_temp.act_as(user_a_id);
  insert into reports (reporter_id, content_type, content_id, reason)
  values (user_a_id, 'user_profile', user_b_id, 'test raporu')
  returning id into new_report_id;

  perform pg_temp.act_as(user_b_id);
  select count(*) into visible_rows from reports where id = new_report_id;
  if visible_rows <> 0 then
    raise exception 'FAIL(reports): kullanıcı B, kullanıcı A''nın raporunu görebildi!';
  end if;

  raise notice 'PASS: reports görünürlük testi geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 6) GROUP_RIDE_PARTICIPANTS — kendi kendini onaylama açığı (Faz 4)
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  v_ride_id uuid;
  self_approve_failed boolean := false;
  final_status participant_status;
begin
  perform pg_temp.act_as(user_a_id);
  insert into group_rides (creator_id, title, scheduled_at)
  values (user_a_id, 'Test Sürüşü — Onay Açığı', now() + interval '1 day')
  returning id into v_ride_id;

  -- B katılım isteği gönderir ('requested')
  perform pg_temp.act_as(user_b_id);
  insert into group_ride_participants (ride_id, user_id) values (v_ride_id, user_b_id);

  -- B kendi isteğini doğrudan 'approved' yapmaya çalışır — RLS bunu
  -- engellemeli (sadece sahibi ya da Edge Function service_role ile olur).
  begin
    update group_ride_participants set status = 'approved' where ride_id = v_ride_id and user_id = user_b_id;
  exception when insufficient_privilege then
    self_approve_failed := true;
  end;

  select status into final_status from group_ride_participants where ride_id = v_ride_id and user_id = user_b_id;
  if final_status = 'approved' then
    raise exception 'FAIL(group_ride_participants): kullanıcı kendi katılım isteğini onaylayabildi!';
  end if;
  if not self_approve_failed and final_status <> 'requested' then
    raise exception 'FAIL(group_ride_participants): beklenmeyen durum geçişi (self-approve engeli eksik olabilir)';
  end if;

  -- B kendi isteğini 'left' yapabilmeli (izinli tek self-geçiş).
  update group_ride_participants set status = 'left' where ride_id = v_ride_id and user_id = user_b_id;
  select status into final_status from group_ride_participants where ride_id = v_ride_id and user_id = user_b_id;
  if final_status <> 'left' then
    raise exception 'FAIL(group_ride_participants): kullanıcı kendi isteğinden vazgeçip ''left'' yapamadı!';
  end if;

  raise notice 'PASS: group_ride_participants kendi-kendini-onaylama açığı kapalı.';
end $$;

-- ---------------------------------------------------------------------
-- 7) LIVE_LOCATIONS — etkinlik sahibi de canlı konum paylaşabilmeli
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  v_ride_id uuid;
begin
  perform pg_temp.act_as(user_a_id);
  insert into group_rides (creator_id, title, scheduled_at, status)
  values (user_a_id, 'Test Sürüşü — Sahip Konumu', now() - interval '1 hour', 'active')
  returning id into v_ride_id;

  -- A (sahip) hiçbir zaman kendi etkinliğine "approved participant" olarak
  -- eklenmez — ama select politikasıyla simetrik olarak canlı konumunu
  -- paylaşabilmeli.
  insert into live_locations (ride_id, user_id, location)
  values (v_ride_id, user_a_id, st_geogfromtext('POINT(29.0 41.0)'));

  raise notice 'PASS: etkinlik sahibi kendi canlı konumunu paylaşabiliyor.';
end $$;

-- ---------------------------------------------------------------------
-- 8) GROUP_RIDE_MESSAGES — üyelik zorunluluğu, iptal kilidi, sel koruması
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  v_ride_id uuid;
  outsider_insert_failed boolean := false;
  cancelled_insert_failed boolean := false;
  flood_failed boolean := false;
  visible_rows int;
  i int;
begin
  perform pg_temp.act_as(user_a_id);
  insert into group_rides (creator_id, title, scheduled_at)
  values (user_a_id, 'Test Sürüşü — Sohbet', now() + interval '1 day')
  returning id into v_ride_id;

  -- B henüz üye değilken (approved değil) sohbete yazamaz.
  perform pg_temp.act_as(user_b_id);
  begin
    insert into group_ride_messages (ride_id, user_id, message) values (v_ride_id, user_b_id, 'merhaba');
  exception when insufficient_privilege then
    outsider_insert_failed := true;
  end;
  if not outsider_insert_failed then
    raise exception 'FAIL(group_ride_messages): üye olmayan kullanıcı sohbete mesaj yazabildi!';
  end if;

  -- Anon da göremez.
  perform pg_temp.act_as_anon();
  select count(*) into visible_rows from group_ride_messages where ride_id = v_ride_id;
  if visible_rows <> 0 then
    raise exception 'FAIL(group_ride_messages): anon/üye olmayan sohbeti görebildi!';
  end if;

  -- Sel/flood koruması: dakikada en fazla 20 mesaj, 21.'si reddedilmeli.
  -- Trigger her INSERT'ten ÖNCE mevcut satır sayısını sayıyor; tam 20 satır
  -- oluşturup 21.'yi denemeliyiz.
  perform pg_temp.act_as(user_a_id);
  for i in 1..20 loop
    insert into group_ride_messages (ride_id, user_id, message) values (v_ride_id, user_a_id, 'mesaj ' || i);
  end loop;
  begin
    insert into group_ride_messages (ride_id, user_id, message) values (v_ride_id, user_a_id, 'taşıran mesaj');
  exception when raise_exception then
    flood_failed := true;
  end;
  if not flood_failed then
    raise exception 'FAIL(group_ride_messages): dakikada 20 mesaj sınırı çalışmıyor!';
  end if;

  -- Etkinlik iptal edilince yazma kapanır, okuma açık kalır.
  update group_rides set status = 'cancelled' where id = v_ride_id;
  cancelled_insert_failed := false;
  begin
    insert into group_ride_messages (ride_id, user_id, message) values (v_ride_id, user_a_id, 'iptal sonrası');
  exception when insufficient_privilege then
    cancelled_insert_failed := true;
  end;
  if not cancelled_insert_failed then
    raise exception 'FAIL(group_ride_messages): iptal edilen etkinlikte sohbete yazılabildi!';
  end if;

  select count(*) into visible_rows from group_ride_messages where ride_id = v_ride_id;
  if visible_rows = 0 then
    raise exception 'FAIL(group_ride_messages): iptal sonrası sohbet geçmişi okunamıyor!';
  end if;

  raise notice 'PASS: group_ride_messages üyelik + sel koruması + iptal kilidi testleri geçti.';
end $$;

-- ---------------------------------------------------------------------
-- 9) ADMIN / MODERASYON
-- ---------------------------------------------------------------------
-- NOT: admin-manage-user/admin-moderate-content Edge Function'ları Deno
-- HTTP fonksiyonları — bu SQL script'inden çağrılamazlar. "Edge
-- Function'ı admin olmadan çağıramaz" gereksinimi, o fonksiyonların
-- yetkisinin TAMAMEN dayandığı profiles.is_admin alanının forge
-- edilemediğini (aşağıdaki guard trigger testi) doğrulayarak SQL
-- seviyesinde karşılanıyor — fonksiyonun HTTP davranışı bu testin
-- kapsamı dışında.
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  user_c_id uuid := '00000000-0000-0000-0000-0000000000cc';
  new_poi_id uuid;
  is_still_admin boolean;
  visible_count int;
begin
  -- Test kullanıcısı C (admin olacak).
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
  values (user_c_id, 'test-user-c@kavis.test', crypt('test-password-c', gen_salt('bf')), now(), '{"username":"test_user_c"}'::jsonb)
  on conflict (id) do nothing;

  -- C kendini admin yapmaya çalışır — guard trigger engellemeli (tıpkı
  -- is_banned testindeki gibi).
  perform pg_temp.act_as(user_c_id);
  update profiles set is_admin = true where id = user_c_id;
  select is_admin into is_still_admin from profiles where id = user_c_id;
  if is_still_admin then
    raise exception 'FAIL(profiles): kullanıcı kendi is_admin alanını true yapabildi!';
  end if;

  -- Gerçek admin ataması — sadece service_role (Edge Function) yapabilir,
  -- burada act_as_service() ile simüle ediyoruz.
  perform pg_temp.act_as_service();
  update profiles set is_admin = true where id = user_c_id;

  -- A bir POI oluşturur, service_role onu gizli işaretler (submit-report'un
  -- otomatik gizlemesini veya admin-moderate-content'in 'hide' aksiyonunu
  -- simüle ediyor).
  perform pg_temp.act_as(user_a_id);
  insert into pois (creator_id, type, location, title)
  values (user_a_id, 'gas_station', st_geogfromtext('POINT(29.4 41.4)'), 'Test Gizlenecek Benzinlik')
  returning id into new_poi_id;

  perform pg_temp.act_as_service();
  update pois set is_hidden = true where id = new_poi_id;

  -- Sahibi olmayan normal kullanıcı (B) gizli POI'yi göremez.
  perform pg_temp.act_as(user_b_id);
  select count(*) into visible_count from pois where id = new_poi_id;
  if visible_count <> 0 then
    raise exception 'FAIL(pois): normal kullanıcı başkasının gizli POI''sini görebildi!';
  end if;

  -- Admin (C) aynı gizli POI'yi görebilir.
  perform pg_temp.act_as(user_c_id);
  select count(*) into visible_count from pois where id = new_poi_id;
  if visible_count = 0 then
    raise exception 'FAIL(pois): admin gizli POI''yi göremiyor!';
  end if;

  -- B, bu POI hakkında bir rapor oluşturur (kendi raporu, normal insert).
  perform pg_temp.act_as(user_b_id);
  insert into reports (reporter_id, content_type, content_id, reason)
  values (user_b_id, 'poi', new_poi_id, 'inappropriate');

  -- A (raportör değil, POI sahibi ama raporun kendisiyle ilgisi yok)
  -- B'nin raporunu göremez.
  perform pg_temp.act_as(user_a_id);
  select count(*) into visible_count from reports where content_id = new_poi_id;
  if visible_count <> 0 then
    raise exception 'FAIL(reports): normal kullanıcı başkasının raporunu görebildi!';
  end if;

  -- Admin (C) raporu görebilir.
  perform pg_temp.act_as(user_c_id);
  select count(*) into visible_count from reports where content_id = new_poi_id;
  if visible_count = 0 then
    raise exception 'FAIL(reports): admin raporları göremiyor!';
  end if;

  -- Banlı kullanıcı yeni içerik oluşturamaz (0009_admin_moderation.sql'in
  -- insert politikalarına eklediği is_current_user_banned() kontrolü).
  perform pg_temp.act_as_service();
  update profiles set is_banned = true where id = user_b_id;

  perform pg_temp.act_as(user_b_id);
  begin
    insert into pois (creator_id, type, location, title)
    values (user_b_id, 'rest_stop', st_geogfromtext('POINT(29.5 41.5)'), 'Banlı Kullanıcının POI''si');
    raise exception 'FAIL(pois): banlı kullanıcı yeni POI oluşturabildi!';
  exception when insufficient_privilege then
    null; -- beklenen davranış
  end;

  -- Temizlik: B'yi tekrar banlı olmaktan çıkar (dosyanın geri kalanı
  -- rollback ile temizleniyor olsa da, aynı transaction içinde B'ye
  -- bağımlı başka bir test bölümü varsa etkilenmesin diye).
  perform pg_temp.act_as_service();
  update profiles set is_banned = false where id = user_b_id;

  raise notice 'PASS: admin/moderasyon RLS testleri geçti (is_admin guard, gizli içerik + rapor görünürlüğü, banlı kullanıcı insert engeli).';
end $$;

-- ---------------------------------------------------------------------
-- 10) HAFTALIK LİDERLİK TABLOSU / ROZETLER (0011_weekly_leaderboard_badges.sql)
-- ---------------------------------------------------------------------
do $$
declare
  user_a_id uuid := '00000000-0000-0000-0000-0000000000aa';
  user_b_id uuid := '00000000-0000-0000-0000-0000000000bb';
  new_route_id uuid;
  any_badge_id uuid;
  leak_count int;
  leaderboard_row_count int;
begin
  -- A bir rota oluşturup o rotada canlı kayıt bir sürüş yapar. distance_km
  -- (routes.distance_km NULLABLE — bkz. Faz 1 teknik borcu) açıkça
  -- veriliyor, aksi halde %50 eşik karşılaştırması NULL'a karşı yapılır ve
  -- sürüş hiçbir zaman "bu rotayı sürdü" sayılmaz.
  perform pg_temp.act_as(user_a_id);
  insert into routes (creator_id, title, path, distance_km)
  values (user_a_id, 'Liderlik Test Rotası', st_geogfromtext('LINESTRING(29.0 41.0, 29.2 41.2)'), 10)
  returning id into new_route_id;

  insert into recorded_rides (user_id, route_id, track, distance_km, started_at, ended_at, source)
  values (
    user_a_id, new_route_id,
    st_geogfromtext('LINESTRING(29.0 41.0, 29.2 41.2)'),
    10, -- rotanın tamamı, %50 eşiğini rahatça geçer
    now(), now(), 'recorded'
  );

  -- B, A'nın recorded_rides satırını DOĞRUDAN (leaderboard fonksiyonunu
  -- atlayıp) göremez — bu, get_weekly_route_leaderboard'ın security
  -- definer olması YÜZÜNDEN recorded_rides'ın temel RLS'inin gevşemediğini
  -- doğruluyor (fonksiyon sadece KENDİ İÇİNDE bypass ediyor, B'nin normal
  -- sorgularını etkilemiyor).
  perform pg_temp.act_as(user_b_id);
  select count(*) into leak_count from recorded_rides where user_id = user_a_id;
  if leak_count <> 0 then
    raise exception 'FAIL(leaderboard): kullanıcı B, A''nın recorded_rides satırını doğrudan görebildi!';
  end if;

  -- Ama B, liderlik tablosu FONKSİYONUNU çağırabilir ve A'nın aktivitesi
  -- (sadece toplam sayı olarak, username ile) orada görünür — bu, RLS
  -- ihlali değil, fonksiyonun TASARLANMIŞ davranışı (madde: sıralama
  -- görünür, ham veri değil).
  select count(*) into leaderboard_row_count from get_weekly_route_leaderboard();
  if leaderboard_row_count = 0 then
    raise exception 'FAIL(leaderboard): get_weekly_route_leaderboard hiç sonuç döndürmedi (beklenen: en az A''nın satırı)!';
  end if;

  -- A kendine doğrudan (award_badge_if_needed'i atlayıp) bir rozet
  -- veremez — user_badges'te hiçbir insert politikası yok.
  perform pg_temp.act_as(user_a_id);
  select id into any_badge_id from badges limit 1;
  begin
    insert into user_badges (user_id, badge_id) values (user_a_id, any_badge_id);
    raise exception 'FAIL(user_badges): kullanıcı kendine doğrudan rozet verebildi!';
  exception
    when insufficient_privilege then
      null; -- beklenen davranış
  end;

  -- A, weekly_awards'a da yazamaz (hiçbir insert politikası yok).
  begin
    insert into weekly_awards (week_start, category, user_id)
    values (current_date, 'test_category', user_a_id);
    raise exception 'FAIL(weekly_awards): kullanıcı doğrudan weekly_awards''a yazabildi!';
  exception
    when insufficient_privilege then
      null; -- beklenen davranış
  end;

  raise notice 'PASS: haftalık liderlik tablosu / rozet RLS testleri geçti (recorded_rides sızmıyor, user_badges/weekly_awards yazılamıyor).';
end $$;

raise notice '=== TÜM RLS SMOKE TESTLERİ BAŞARIYLA GEÇTİ ===';

rollback; -- Test verilerini kalıcı bırakmamak için değişiklikleri geri al.
