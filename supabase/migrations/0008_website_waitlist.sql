-- ---------------------------------------------------------------------
-- Faz 6 eki: kavisapp.com bekleme listesi ("Çıkınca haber ver").
-- ---------------------------------------------------------------------
-- Bu tablo mobil uygulamanın DEĞIL, kavisapp.com statik sitesinin
-- (web/) e-posta kayıt formu için. Anonim (anon rolü) insert edebilir,
-- kimse (anon/authenticated) okuyamaz — sadece Supabase Dashboard'dan
-- (service_role, RLS'i bypass eder) görülebilir.
--
-- Spam koruması iki katmanlı: (1) istemci tarafında honeypot alanı
-- (bkz. web/index.html) — bu SADECE basit botları caydırır, anon insert
-- endpoint'ine doğrudan istek atan bir bot bunu atlayabilir (bu projede
-- zaten kabul edilen bir risk kategorisi, bkz. reports_insert_own'daki
-- hız sınırı bypass'ı). (2) burada, DB seviyesinde: e-posta formatı
-- kabaca doğrulanıyor ve `unique (email)` ile aynı adresin tekrar tekrar
-- eklenmesi engelleniyor.

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  unique (email),
  check (char_length(email) <= 320),
  check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

alter table waitlist enable row level security;

-- Sadece INSERT — select/update/delete politikası yok, yani anon/
-- authenticated hiçbir şekilde okuyamaz/değiştiremez (RLS varsayılan
-- olarak reddeder). Sadece service_role (Dashboard, ileride bir export
-- Edge Function'ı) okuyabilir.
create policy "waitlist_insert_anon"
  on waitlist for insert
  to anon
  with check (
    char_length(email) <= 320
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );
