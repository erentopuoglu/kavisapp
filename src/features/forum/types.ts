import type { Database } from "@/lib/supabase/types";

export type ForumQuestion = Database["public"]["Tables"]["forum_questions"]["Row"];
export type ForumAnswer = Database["public"]["Tables"]["forum_answers"]["Row"];

export type ForumProfile = { username: string; display_name: string | null };

export type QuestionWithProfile = ForumQuestion & {
  profiles: ForumProfile | null;
};

export type AnswerWithProfile = ForumAnswer & {
  profiles: ForumProfile | null;
};

export function forumAuthorLabel(profile: ForumProfile | null): string {
  return profile?.display_name ?? profile?.username ?? "Kullanıcı";
}
