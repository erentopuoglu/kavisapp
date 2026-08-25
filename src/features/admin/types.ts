import type { ReportContentType } from "@/features/moderation/types";
import type { Database } from "@/lib/supabase/types";

// submit-report/admin-moderate-content Edge Function'larının paylaştığı
// supabase/functions/_shared/moderatable.ts ile aynı kapsam — 'route' ve
// 'user_profile', report_content_type enum'ında olmasına rağmen hiçbir
// "Bildir" akışına bağlı değil, bu yüzden burada da yok.
export type ModeratableContentType = "poi" | "group_ride_message" | "forum_question" | "forum_answer";

export type Report = Database["public"]["Tables"]["reports"]["Row"];

export type ReportWithReporter = Report & {
  profiles: { username: string; display_name: string | null } | null;
};

// Bekleyen raporlar admin ekranında content_type+content_id'ye göre
// gruplanıyor — aynı içerik birden fazla kişi tarafından raporlanmış
// olabilir (3. raportörle otomatik gizlenene kadar).
export type PendingReportGroup = {
  contentType: ReportContentType;
  contentId: string;
  reports: ReportWithReporter[];
};

export type ContentPreview = {
  title: string;
  snippet: string | null;
  authorUsername: string;
  isHidden: boolean;
} | null;

export type HiddenContentItem = {
  contentType: ModeratableContentType;
  contentId: string;
  title: string;
  snippet: string | null;
  authorUsername: string;
  updatedAt: string;
};

export type AdminStats = {
  userCount: number;
  routeCount: number;
  poiCount: number;
  pendingReportCount: number;
};

export type AdminProfile = Database["public"]["Tables"]["profiles"]["Row"];

export const CONTENT_TYPE_LABELS: Record<ModeratableContentType, string> = {
  poi: "İşaretli Nokta",
  group_ride_message: "Grup Sürüşü Mesajı",
  forum_question: "Forum Sorusu",
  forum_answer: "Forum Cevabı",
};
