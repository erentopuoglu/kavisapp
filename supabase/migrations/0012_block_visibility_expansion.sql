-- ---------------------------------------------------------------------
-- Engellemeyi tüm içerik yüzeylerine yayar: routes, pois, group_ride_messages,
-- live_locations + forum'un TEK YÖNLÜ engelleme davranışını KARŞILIKLI
-- (mutual) hale yükseltir.
-- ---------------------------------------------------------------------
-- BULGU — forum bugüne kadar aslında mutual DEĞİLDİ: 0007_faz5_forum_blocks.sql
-- sadece "A, B'yi engellediyse B'nin içeriği A'dan gizlenir" yönünü uyguluyordu
-- (kendi yorumunda "Tek yönlü" olarak açıkça belirtilmiş). Yani B, A'yı
-- engellemediği sürece A'nın içeriği B'ye hâlâ görünüyordu. Bu migration
-- forum'u da GERÇEK karşılıklılığa yükseltiyor: blocks tablosunda HANGİ
-- yönde olursa olsun bir kayıt varsa, iki taraf da birbirinin içeriğini
-- göremez. Gerekçe: (1) kullanıcının bu işi başlatan isteğinde forum deseni
-- açıkça "karşılıklı" olarak tanımlandı, (2) tek yönlü model, beni
-- engelleyen kişinin içeriğimi görmeye devam etmesine izin veriyordu — bu,
-- taciz senaryolarında (Apple Guideline 1.2 UGC beklentisi) yetersiz bir
-- koruma.
--
-- Tek bir yardımcı fonksiyon iki yöndeki blocks kaydını da kontrol eder;
-- her tabloda tekrar aynı OR'lu alt sorguyu yazmak yerine (is_ride_creator/
-- is_approved_participant ile aynı desen).
--
-- ÖNEMLİ — SECURITY DEFINER ZORUNLU: "blocks_select_own" politikası
-- (0000_init_schema.sql) sadece `auth.uid() = blocker_id` olan satırları
-- görünür kılıyor — yani ben, "başkası beni engelledi mi" yönündeki satırı
-- (blocked_id = benim id'im, blocker_id = başkası) SECURITY INVOKER bir
-- fonksiyon içinden KENDİ RLS'imle asla göremem. Bu fonksiyon SECURITY
-- DEFINER olmadan yazılsaydı, "either_way" adını taşımasına rağmen
-- fiilen yine tek yönlü çalışırdı (sadece kendi blocker_id=auth.uid()
-- satırlarımı görebildiğim için). `set search_path = public`, bu
-- projedeki tüm SECURITY DEFINER fonksiyonlarıyla aynı, arama yolu
-- enjeksiyonuna karşı standart önlem.
create or replace function is_blocked_either_way(other_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = other_user_id)
       or (blocker_id = other_user_id and blocked_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- FORUM — tek yönlüden karşılıklıya yükseltme.
-- ---------------------------------------------------------------------
drop policy if exists "forum_questions_select_visible" on forum_questions;
create policy "forum_questions_select_visible"
  on forum_questions for select
  using (
    (is_hidden = false or user_id = auth.uid())
    and not is_blocked_either_way(user_id)
  );

drop policy if exists "forum_answers_select_visible" on forum_answers;
create policy "forum_answers_select_visible"
  on forum_answers for select
  using (
    (is_hidden = false or user_id = auth.uid())
    and not is_blocked_either_way(user_id)
  );

-- ---------------------------------------------------------------------
-- ROUTES / POIS — aynı deseni uygula. Kapsam dışı bırakılan bilinçli bir
-- köşe durumu: bir grup sürüşünün rotası (group_rides.route_id), engellenen
-- kişi o rotanın sahibiyse teorik olarak bu politikayla da gizlenir. Şu an
-- istemci kodu group_rides'ı çekerken route_id'nin işaret ettiği routes
-- satırını genişletmiyor (src/features/group-rides/api/groupRidesApi.ts
-- sadece "select *" ile group_rides'ı çekiyor), yani bu senaryo bugün
-- ulaşılabilir değil — ileride rota önizlemesi eklenirse bu politikaya da
-- aşağıdaki grup sürüşü organizatör istisnasının bir benzeri gerekebilir.
drop policy if exists "routes_select_visible" on routes;
create policy "routes_select_visible"
  on routes for select
  using (
    (is_hidden = false or creator_id = auth.uid())
    and not is_blocked_either_way(creator_id)
  );

drop policy if exists "pois_select_visible" on pois;
create policy "pois_select_visible"
  on pois for select
  using (
    (is_hidden = false or creator_id = auth.uid())
    and not is_blocked_either_way(creator_id)
  );

-- ---------------------------------------------------------------------
-- GRUP SÜRÜŞÜ SOHBETİ VE CANLI KONUM — ORGANİZATÖR İSTİSNASI
-- ---------------------------------------------------------------------
-- Karar: blocks ilişkisinin taraflarından biri o SPESİFİK etkinliğin
-- organizatörüyse (creator_id), engelleme bu etkinlik bağlamında UYGULANMAZ
-- — ne organizatör bir katılımcıyı, ne de bir katılımcı organizatörü, o
-- etkinliğin sohbetinde/canlı konumunda gizlemez. Diğer tüm yüzeylerde
-- (forum, routes, pois, farklı bir etkinlik) engelleme normal şekilde
-- işlemeye devam eder.
--
-- Gerekçe:
--  1. GÜVENLİK: Canlı konum paylaşımının VAROLUŞ SEBEBİ, bir kaza/acil
--     durumda grubun birbirini bulabilmesi. Organizatör-katılımcı arasında
--     alakasız bir kişisel engelleme yüzünden konumun görünmez olması,
--     tam da bu özelliğin kritik olduğu anda (yolda bir şeyler ters
--     giderse) yardımı geciktirebilir.
--  2. İŞLEVSEL ZORUNLULUK: Organizatör, güzergah değişikliği/mola/iptal
--     gibi kritik duyuruları sohbette yapar — bunu okuyamayan bir
--     katılımcı etkinliğe güvenle devam edemez. Organizatör de tersine,
--     tüm katılımcıların konumunu/mesajını görebilmeli ki sürüşü
--     güvenle yönetebilsin.
--  3. BAĞLAM FARKI: Forum/rota/POI, kullanıcının rastgele karşılaştığı
--     açık bir sosyal yüzey — bir gönderiyi görmek için kimseyle aynı
--     "odada" olmayı seçmiş değil. Bir grup sürüşüne katılmaksa (istek +
--     organizatör onayı) BİLİNÇLİ bir katılım kararı; bu ortak, sınırlı
--     kapsamlı etkinlik bağlamı, genel engelleme tercihinden önceliklidir.
--
-- Bilinçli sınır: Organizatörle aram bozuksa (onu engellemişsem/o beni
-- engellemişse) çözüm bu ekranda "görünmez kılınmak" değil, etkinlikten
-- ayrılmaktır (group_ride_participants zaten status='left' geçişine izin
-- veriyor) veya mevcut rapor mekanizmasını kullanmaktır — organizatör
-- olmayan iki normal katılımcı arasındaysa engelleme aşağıda TAM olarak
-- uygulanır (aralarında organizatörün taşıdığı "tüm gruba karşı sorumluluk"
-- gerekçesi yok).
drop policy if exists "group_ride_messages_select" on group_ride_messages;
create policy "group_ride_messages_select"
  on group_ride_messages for select
  using (
    is_hidden = false
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and (
      not is_blocked_either_way(user_id)
      or is_ride_creator(ride_id, user_id)
      or is_ride_creator(ride_id, auth.uid())
    )
  );

drop policy if exists "live_locations_select_ride_members_only" on live_locations;
create policy "live_locations_select_ride_members_only"
  on live_locations for select
  using (
    exists (
      select 1 from group_rides gr
      where gr.id = live_locations.ride_id
        and gr.status = 'active'
    )
    and (is_ride_creator(ride_id, auth.uid()) or is_approved_participant(ride_id, auth.uid()))
    and (
      not is_blocked_either_way(user_id)
      or is_ride_creator(ride_id, user_id)
      or is_ride_creator(ride_id, auth.uid())
    )
  );
