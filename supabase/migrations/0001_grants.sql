-- =====================================================================
-- Kavis — Faz 0 Düzeltme: eksik şema-seviyesi GRANT'ları ekle
-- =====================================================================
-- RLS politikaları (using/with check) yalnızca rolün tabloya zaten temel
-- bir yetkisi (GRANT) varsa devreye girer — RLS bir FİLTRE'dir, GRANT ise
-- KAPI'dır. 0000_init_schema.sql hiç GRANT içermiyordu; normalde Supabase
-- yeni projelerde bunu otomatik tanımlar ama bu projede eksik kalmış ve
-- "permission denied for table profiles (42501)" hatasına yol açtı.
--
-- Bu script hem MEVCUT tablolara hem de BUNDAN SONRA oluşturulacak
-- tablolara (ALTER DEFAULT PRIVILEGES ile) yetki tanımlar. Idempotent'tir,
-- production'da güvenle tekrar çalıştırılabilir.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
