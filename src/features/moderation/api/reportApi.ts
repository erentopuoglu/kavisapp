import type { ReportContentType } from "@/features/moderation/types";
import { supabase } from "@/lib/supabase/client";

export type SubmitReportInput = {
  contentType: ReportContentType;
  contentId: string;
  reason: string;
  details?: string;
};

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const withContext = error as { context?: Response; message?: string };
  if (withContext.context) {
    try {
      const body = (await withContext.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // gövde okunamadı, aşağıdaki genel mesaja düş
    }
  }
  return withContext.message ?? "Rapor gönderilemedi.";
}

// Rapor ekleme, hız sınırı kontrolü ve gizleme kararı tamamen
// submit-report Edge Function'ında (service_role) veriliyor — istemci
// sadece çağırıyor, sonucu bekliyor.
export async function submitReport(input: SubmitReportInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke("submit-report", {
    body: {
      content_type: input.contentType,
      content_id: input.contentId,
      reason: input.reason,
      details: input.details ?? null,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }
  if (data?.error) {
    throw new Error(data.error as string);
  }
}
