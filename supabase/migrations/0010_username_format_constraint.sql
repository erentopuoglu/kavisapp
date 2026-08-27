-- ---------------------------------------------------------------------
-- Denetim bulgusu: profiles.username formatı sadece istemcide
-- (USERNAME_PATTERN, kayit.tsx) ve login-with-username Edge Function'ında
-- doğrulanıyordu — DB seviyesinde hiçbir CHECK yoktu (sadece `unique`).
-- Uygulamayı atlayıp doğrudan supabase-js/REST ile profiles.username'i
-- güncelleyen bir istemci herhangi bir uzunlukta/karakterde bir değer
-- yazabilirdi (bu alan herkese açık okunuyor — rota/forum/etkinlik
-- yazarlığında görünüyor).
-- ---------------------------------------------------------------------

-- NOT VALID: canlı tabloda şu an ne olduğunu bilmeden (bu ortamdan
-- production'a bağlanamıyoruz) migration'ın güvenle uygulanabilmesi için.
-- Var olan satırlar hemen kontrol edilmez ama BUNDAN SONRAKİ her INSERT/
-- UPDATE (dolayısıyla asıl kapatılmak istenen açık — istemcinin doğrudan
-- yazması) anında bu kurala tabi olur. İstenirse var olan veriler elle
-- temizlendikten sonra ayrıca şu çalıştırılabilir:
--   alter table profiles validate constraint profiles_username_format;
alter table profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,20}$') not valid;

-- ---------------------------------------------------------------------
-- handle_new_user()'daki e-posta türetilen yedek username (Google OAuth
-- gibi username toplamayan akışlarda kullanılıyor) yukarıdaki kuralı hiç
-- garanti etmiyordu: e-postanın "@" öncesi kısmı büyük harf, nokta, "+"
-- gibi karakterler içerebilir (ör. "John.Doe+test@gmail.com") — bu yeni
-- CHECK ile böyle bir INSERT artık BAŞARISIZ OLURDU, yani bu düzeltme
-- olmadan constraint'i eklemek Google ile kayıt olan kullanıcıları
-- kırardı. Bu yüzden aynı migration'da fonksiyon da güncelleniyor:
-- e-posta kısmı küçük harfe çevrilip izin verilmeyen karakterler
-- temizleniyor, çok kısa kalırsa "kullanici" tabanına düşülüyor.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  explicit_username text;
begin
  explicit_username := nullif(lower(trim(new.raw_user_meta_data->>'username')), '');

  base_username := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g');
  if length(base_username) < 3 then
    base_username := 'kullanici';
  end if;
  base_username := left(base_username, 15);

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(explicit_username, base_username || '_' || substr(new.id::text, 1, 4)),
    coalesce(new.raw_user_meta_data->>'full_name', null),
    coalesce(new.raw_user_meta_data->>'avatar_url', null)
  );
  return new;
end;
$$;
