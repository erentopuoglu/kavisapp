import type { Database } from "@/lib/supabase/types";

export type ReportContentType = Database["public"]["Tables"]["reports"]["Row"]["content_type"];

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "inappropriate", label: "Uygunsuz içerik" },
  { value: "misinformation", label: "Yanlış/yanıltıcı bilgi" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Diğer" },
];
