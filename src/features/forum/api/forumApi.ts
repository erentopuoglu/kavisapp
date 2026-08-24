import { supabase } from "@/lib/supabase/client";
import type { AnswerWithProfile, ForumAnswer, ForumQuestion, QuestionWithProfile } from "@/features/forum/types";

const PROFILE_SELECT = "*, profiles(username, display_name)";

export type QuestionFilters = {
  searchText?: string;
  bikeModel?: string;
};

export async function fetchQuestions(filters: QuestionFilters = {}): Promise<QuestionWithProfile[]> {
  let query = supabase.from("forum_questions").select(PROFILE_SELECT);

  const term = filters.searchText?.trim();
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }

  const bikeModel = filters.bikeModel?.trim();
  if (bikeModel) {
    query = query.ilike("bike_model_tag", `%${bikeModel}%`);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as QuestionWithProfile[];
}

export async function fetchQuestionById(questionId: string): Promise<QuestionWithProfile> {
  const { data, error } = await supabase
    .from("forum_questions")
    .select(PROFILE_SELECT)
    .eq("id", questionId)
    .single();
  if (error) throw error;
  return data as unknown as QuestionWithProfile;
}

export type CreateQuestionInput = {
  title: string;
  body: string;
  bikeModelTag?: string;
  tags?: string[];
};

export async function createQuestion(input: CreateQuestionInput): Promise<ForumQuestion> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Soru sormak için giriş yapmalısınız.");

  const { data, error } = await supabase
    .from("forum_questions")
    .insert({
      user_id: user.id,
      title: input.title,
      body: input.body,
      bike_model_tag: input.bikeModelTag ?? null,
      tags: input.tags ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from("forum_questions").delete().eq("id", questionId);
  if (error) throw error;
}

export async function setBestAnswer(questionId: string, answerId: string | null): Promise<void> {
  const { error } = await supabase
    .from("forum_questions")
    .update({ best_answer_id: answerId })
    .eq("id", questionId);
  if (error) throw error;
}

export async function fetchAnswers(questionId: string): Promise<AnswerWithProfile[]> {
  const { data, error } = await supabase
    .from("forum_answers")
    .select(PROFILE_SELECT)
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AnswerWithProfile[];
}

export async function createAnswer(questionId: string, body: string): Promise<ForumAnswer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Cevap yazmak için giriş yapmalısınız.");

  const { data, error } = await supabase
    .from("forum_answers")
    .insert({ question_id: questionId, user_id: user.id, body })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAnswer(answerId: string): Promise<void> {
  const { error } = await supabase.from("forum_answers").delete().eq("id", answerId);
  if (error) throw error;
}
