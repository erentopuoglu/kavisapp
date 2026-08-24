-- ---------------------------------------------------------------------
-- Faz 5: Forum görünürlüğüne kullanıcı engellemesini bağlar.
-- ---------------------------------------------------------------------
-- `blocks` tablosu Faz 0'dan beri RLS ile korunarak duruyordu ama hiçbir
-- select politikası ondan haberdar değildi — bir kullanıcıyı engellemek
-- şimdiye kadar hiçbir görünürlük etkisi yaratmıyordu. Bu migration,
-- forum soru/cevap listelerini `auth.uid()`'e özel olarak filtreleyecek
-- şekilde iki select politikasını güncelliyor: is_hidden/sahiplik kontrolü
-- aynı kalıyor, ayrıca engellenen kullanıcının içeriği de gizleniyor.
--
-- Tek yönlü: A, B'yi engellerse B'nin içeriği A'dan gizlenir; A'nın
-- içeriği B'den gizlenmez (blocks.blocker_id/blocked_id şemasıyla
-- tutarlı). Client-side filtre değil RLS tercih edildi — bu projede
-- güvenlik kararları hep sunucu tarafında (bkz. Faz 4 politika
-- simetrisi düzeltmeleri), istemciye güvenmiyoruz.
--
-- Ekstra index gerekmiyor: blocks(blocker_id, blocked_id) unique kısıtı
-- zaten bu alt sorgunun (blocker_id = ? and blocked_id = ?) erişim
-- deseniyle birebir örtüşüyor.

drop policy if exists "forum_questions_select_visible" on forum_questions;
create policy "forum_questions_select_visible"
  on forum_questions for select
  using (
    (is_hidden = false or user_id = auth.uid())
    and not exists (
      select 1 from blocks
      where blocker_id = auth.uid() and blocked_id = forum_questions.user_id
    )
  );

drop policy if exists "forum_answers_select_visible" on forum_answers;
create policy "forum_answers_select_visible"
  on forum_answers for select
  using (
    (is_hidden = false or user_id = auth.uid())
    and not exists (
      select 1 from blocks
      where blocker_id = auth.uid() and blocked_id = forum_answers.user_id
    )
  );
