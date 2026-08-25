// Kavis — content_type -> tablo eşlemesi, moderasyonla ilgili tüm Edge
// Function'lar arasında PAYLAŞILAN TEK KAYNAK.
//
// Bu dosya var olmadan önce submit-report/index.ts kendi kopyasını
// tutuyordu; Faz 5'te forum eklendiğinde o kopya güncellenmeyi unutuldu
// ve forum içeriğini raporlamak "Desteklenmeyen içerik türü" hatasıyla
// reddediliyordu. Aynı hatayı tekrarlamamak için tek eşleme, iki
// tüketici (submit-report, admin-moderate-content).
//
// NOT: report_content_type enum'ında ayrıca 'route' ve 'user_profile' de
// var ama ikisi de istemcide hiçbir "Bildir" akışına bağlı değil (rota
// için buton yok, profil raporlama hiç yapılmadı) — bu yüzden burada
// YOK. Eklenirlerse: route -> routes, user_profile için hedef tablo
// profiles ama is_hidden alanı yok, ayrı bir moderasyon mekanizması
// gerekir.
export const MODERATABLE_TABLES: Record<string, string> = {
  poi: "pois",
  group_ride_message: "group_ride_messages",
  forum_question: "forum_questions",
  forum_answer: "forum_answers",
};
