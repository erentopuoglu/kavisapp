import type { ReportContentType } from "@/features/moderation/types";
import { supabase } from "@/lib/supabase/client";
import type {
  AdminProfile,
  AdminStats,
  ContentPreview,
  HiddenContentItem,
  ModeratableContentType,
  PendingReportGroup,
  ReportWithReporter,
} from "@/features/admin/types";

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const withContext = error as { context?: Response; message?: string };
  if (withContext.context) {
    try {
      const body = (await withContext.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // gövde okunamadı, aşağıdaki genel mesaja düş
    }
  }
  return withContext.message ?? fallback;
}

// ---------------------------------------------------------------------
// Bekleyen raporlar
// ---------------------------------------------------------------------

export async function fetchPendingReports(): Promise<PendingReportGroup[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*, profiles(username, display_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as ReportWithReporter[];
  const groups = new Map<string, PendingReportGroup>();
  for (const row of rows) {
    const key = `${row.content_type}:${row.content_id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.reports.push(row);
    } else {
      groups.set(key, { contentType: row.content_type, contentId: row.content_id, reports: [row] });
    }
  }
  return Array.from(groups.values());
}

// content_type -> tablo eşlemesi, supabase/functions/_shared/moderatable.ts
// ile aynı kapsam (bkz. ModeratableContentType'ın yorumu).
function isModeratable(contentType: ReportContentType): contentType is ModeratableContentType {
  return (
    contentType === "poi" ||
    contentType === "group_ride_message" ||
    contentType === "forum_question" ||
    contentType === "forum_answer"
  );
}

export async function fetchContentPreview(
  contentType: ReportContentType,
  contentId: string
): Promise<ContentPreview> {
  if (!isModeratable(contentType)) return null;

  if (contentType === "poi") {
    const { data } = await supabase
      .from("pois")
      .select("title, description, is_hidden, profiles(username)")
      .eq("id", contentId)
      .maybeSingle();
    const poi = data as { title: string; description: string | null; is_hidden: boolean; profiles: { username: string } | null } | null;
    if (!poi) return null;
    return {
      title: poi.title,
      snippet: poi.description,
      authorUsername: poi.profiles?.username ?? "Kullanıcı",
      isHidden: poi.is_hidden,
    };
  }

  if (contentType === "forum_question") {
    const { data } = await supabase
      .from("forum_questions")
      .select("title, body, is_hidden, profiles(username)")
      .eq("id", contentId)
      .maybeSingle();
    const question = data as { title: string; body: string; is_hidden: boolean; profiles: { username: string } | null } | null;
    if (!question) return null;
    return {
      title: question.title,
      snippet: question.body,
      authorUsername: question.profiles?.username ?? "Kullanıcı",
      isHidden: question.is_hidden,
    };
  }

  if (contentType === "forum_answer") {
    const { data } = await supabase
      .from("forum_answers")
      .select("body, is_hidden, profiles(username)")
      .eq("id", contentId)
      .maybeSingle();
    const answer = data as { body: string; is_hidden: boolean; profiles: { username: string } | null } | null;
    if (!answer) return null;
    return {
      title: "Forum Cevabı",
      snippet: answer.body,
      authorUsername: answer.profiles?.username ?? "Kullanıcı",
      isHidden: answer.is_hidden,
    };
  }

  // group_ride_message
  const { data } = await supabase
    .from("group_ride_messages")
    .select("message, is_hidden, profiles(username)")
    .eq("id", contentId)
    .maybeSingle();
  const message = data as { message: string; is_hidden: boolean; profiles: { username: string } | null } | null;
  if (!message) return null;
  return {
    title: "Grup Sürüşü Mesajı",
    snippet: message.message,
    authorUsername: message.profiles?.username ?? "Kullanıcı",
    isHidden: message.is_hidden,
  };
}

// ---------------------------------------------------------------------
// Gizlenmiş içerikler
// ---------------------------------------------------------------------

export async function fetchHiddenContent(): Promise<HiddenContentItem[]> {
  const [pois, questions, answers, messages] = await Promise.all([
    supabase
      .from("pois")
      .select("id, title, description, updated_at, profiles(username)")
      .eq("is_hidden", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("forum_questions")
      .select("id, title, body, updated_at, profiles(username)")
      .eq("is_hidden", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("forum_answers")
      .select("id, body, updated_at, profiles(username)")
      .eq("is_hidden", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("group_ride_messages")
      .select("id, message, created_at, profiles(username)")
      .eq("is_hidden", true)
      .order("created_at", { ascending: false }),
  ]);

  if (pois.error) throw pois.error;
  if (questions.error) throw questions.error;
  if (answers.error) throw answers.error;
  if (messages.error) throw messages.error;

  const items: HiddenContentItem[] = [];
  type Author = { profiles: { username: string } | null };

  for (const poi of (pois.data ?? []) as unknown as (Author & {
    id: string;
    title: string;
    description: string | null;
    updated_at: string;
  })[]) {
    items.push({
      contentType: "poi",
      contentId: poi.id,
      title: poi.title,
      snippet: poi.description,
      authorUsername: poi.profiles?.username ?? "Kullanıcı",
      updatedAt: poi.updated_at,
    });
  }
  for (const question of (questions.data ?? []) as unknown as (Author & {
    id: string;
    title: string;
    body: string;
    updated_at: string;
  })[]) {
    items.push({
      contentType: "forum_question",
      contentId: question.id,
      title: question.title,
      snippet: question.body,
      authorUsername: question.profiles?.username ?? "Kullanıcı",
      updatedAt: question.updated_at,
    });
  }
  for (const answer of (answers.data ?? []) as unknown as (Author & { id: string; body: string; updated_at: string })[]) {
    items.push({
      contentType: "forum_answer",
      contentId: answer.id,
      title: "Forum Cevabı",
      snippet: answer.body,
      authorUsername: answer.profiles?.username ?? "Kullanıcı",
      updatedAt: answer.updated_at,
    });
  }
  for (const message of (messages.data ?? []) as unknown as (Author & {
    id: string;
    message: string;
    created_at: string;
  })[]) {
    items.push({
      contentType: "group_ride_message",
      contentId: message.id,
      title: "Grup Sürüşü Mesajı",
      snippet: message.message,
      authorUsername: message.profiles?.username ?? "Kullanıcı",
      updatedAt: message.created_at,
    });
  }

  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
}

// ---------------------------------------------------------------------
// Kullanıcılar
// ---------------------------------------------------------------------

export async function fetchUsers(searchText = ""): Promise<AdminProfile[]> {
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
  const term = searchText.trim();
  if (term) {
    query = query.ilike("username", `%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------
// Sayaçlar
// ---------------------------------------------------------------------

export async function fetchStats(): Promise<AdminStats> {
  const [users, routes, pois, pendingReports] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("routes").select("id", { count: "exact", head: true }),
    supabase.from("pois").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return {
    userCount: users.count ?? 0,
    routeCount: routes.count ?? 0,
    poiCount: pois.count ?? 0,
    pendingReportCount: pendingReports.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Aksiyonlar (Edge Function invoke sarmalayıcıları)
// ---------------------------------------------------------------------

export async function banUser(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-manage-user", {
    body: { user_id: userId, action: "ban" },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, "Kullanıcı banlanamadı."));
  if (data?.error) throw new Error(data.error as string);
}

export async function unbanUser(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-manage-user", {
    body: { user_id: userId, action: "unban" },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, "Ban kaldırılamadı."));
  if (data?.error) throw new Error(data.error as string);
}

async function moderateContent(
  contentType: ReportContentType,
  contentId: string,
  action: "hide" | "unhide" | "dismiss",
  fallback: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("admin-moderate-content", {
    body: { content_type: contentType, content_id: contentId, action },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, fallback));
  if (data?.error) throw new Error(data.error as string);
}

export async function hideContent(contentType: ReportContentType, contentId: string): Promise<void> {
  return moderateContent(contentType, contentId, "hide", "İçerik gizlenemedi.");
}

export async function unhideContent(contentType: ReportContentType, contentId: string): Promise<void> {
  return moderateContent(contentType, contentId, "unhide", "İçerik geri açılamadı.");
}

export async function dismissReports(contentType: ReportContentType, contentId: string): Promise<void> {
  return moderateContent(contentType, contentId, "dismiss", "Rapor reddedilemedi.");
}
