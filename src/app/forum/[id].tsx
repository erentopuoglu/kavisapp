import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { blockUser } from "@/features/blocks/api/blocksApi";
import {
  createAnswer,
  deleteAnswer,
  deleteQuestion,
  fetchAnswers,
  fetchQuestionById,
  setBestAnswer,
} from "@/features/forum/api/forumApi";
import { forumAuthorLabel, type AnswerWithProfile, type QuestionWithProfile } from "@/features/forum/types";
import { formatForumDate } from "@/features/forum/utils";
import { ReportModal } from "@/features/moderation/components/ReportModal";
import type { ReportContentType } from "@/features/moderation/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

type ReportTarget = { contentType: ReportContentType; contentId: string };

export default function ForumSoruDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((state) => state.session);
  const myUserId = session?.user.id;

  const [question, setQuestion] = useState<QuestionWithProfile | null>(null);
  const [answers, setAnswers] = useState<AnswerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [busyAnswerId, setBusyAnswerId] = useState<string | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const loadQuestion = useCallback(async () => {
    if (!id) return;
    const data = await fetchQuestionById(id);
    setQuestion(data);
  }, [id]);

  const loadAnswers = useCallback(async () => {
    if (!id) return;
    const data = await fetchAnswers(id);
    setAnswers(data);
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadQuestion(), loadAnswers()]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [loadQuestion, loadAnswers]);

  useEffect(() => {
    // Mount'ta soru + cevapları çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleSendAnswer = async () => {
    if (!id || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await createAnswer(id, draft.trim());
      setDraft("");
      await loadAnswers();
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setSending(false);
    }
  };

  const handleDeleteQuestion = () => {
    if (!question) return;
    Alert.alert("Soruyu Sil", "Bu soru ve tüm cevapları kalıcı olarak silinecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setDeletingQuestion(true);
          try {
            await deleteQuestion(question.id);
            router.replace("/(tabs)/forum");
          } catch (err) {
            Alert.alert("Silinemedi", describeError(err));
            setDeletingQuestion(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAnswer = (answerId: string) => {
    Alert.alert("Cevabı Sil", "Bu cevap kalıcı olarak silinecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setBusyAnswerId(answerId);
          try {
            await deleteAnswer(answerId);
            await loadAnswers();
          } catch (err) {
            Alert.alert("Silinemedi", describeError(err));
          } finally {
            setBusyAnswerId(null);
          }
        },
      },
    ]);
  };

  const handleToggleBest = async (answerId: string) => {
    if (!question) return;
    const nextBest = question.best_answer_id === answerId ? null : answerId;
    setBusyAnswerId(answerId);
    try {
      await setBestAnswer(question.id, nextBest);
      await loadQuestion();
    } catch (err) {
      Alert.alert("Güncellenemedi", describeError(err));
    } finally {
      setBusyAnswerId(null);
    }
  };

  const handleBlockUser = (userId: string, isQuestionAuthor: boolean) => {
    Alert.alert(
      "Kullanıcıyı Engelle",
      "Bu kullanıcının sorularını ve cevaplarını bir daha görmeyeceksiniz. Devam edilsin mi?",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Engelle",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(userId);
              if (isQuestionAuthor) {
                router.replace("/(tabs)/forum");
              } else {
                await loadAnswers();
              }
            } catch (err) {
              Alert.alert("Engellenemedi", describeError(err));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error || !question) {
    return (
      <ScreenContainer style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.errorText}>
          {error ?? "Soru bulunamadı."}
        </AppText>
      </ScreenContainer>
    );
  }

  const isOwnQuestion = myUserId === question.user_id;

  return (
    <>
      <Stack.Screen options={{ title: "Soru", headerShown: true }} />
      <ScreenContainer padded={false}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {isOwnQuestion && question.is_hidden ? (
              <View style={styles.hiddenBanner}>
                <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
                <AppText variant="caption" color={colors.warning} style={styles.hiddenBannerText}>
                  Bu içerik, topluluk raporları nedeniyle gizlendi. Sadece siz görebiliyorsunuz.
                </AppText>
              </View>
            ) : null}

            <AppText variant="title">{question.title}</AppText>
            <AppText variant="body" color={colors.textSecondary} style={styles.questionBody}>
              {question.body}
            </AppText>

            {question.bike_model_tag || question.tags.length > 0 ? (
              <View style={styles.tagRow}>
                {question.bike_model_tag ? (
                  <View style={[styles.tag, styles.bikeModelTag]}>
                    <AppText variant="caption" color={colors.primary}>
                      {question.bike_model_tag}
                    </AppText>
                  </View>
                ) : null}
                {question.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <AppText variant="caption" color={colors.textSecondary}>
                      {tag}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.authorRow}>
              <AppText variant="caption" color={colors.textSecondary}>
                {forumAuthorLabel(question.profiles)} · {formatForumDate(question.created_at)}
              </AppText>
              {!isOwnQuestion ? (
                <Pressable onPress={() => handleBlockUser(question.user_id, true)}>
                  <AppText variant="caption" color={colors.textDisabled}>
                    Kullanıcıyı Engelle
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            {isOwnQuestion ? (
              <Button
                label="Soruyu Sil"
                onPress={handleDeleteQuestion}
                variant="danger"
                loading={deletingQuestion}
                style={styles.questionActionButton}
              />
            ) : (
              <Button
                label="Bildir"
                onPress={() => setReportTarget({ contentType: "forum_question", contentId: question.id })}
                variant="secondary"
                style={styles.questionActionButton}
              />
            )}

            <View style={styles.divider} />

            <AppText variant="subtitle" style={styles.answersTitle}>
              Cevaplar ({answers.length})
            </AppText>

            {answers.length === 0 ? (
              <AppText variant="body" color={colors.textSecondary} style={styles.noAnswers}>
                Henüz cevap yok. İlk cevabı siz yazın.
              </AppText>
            ) : (
              answers.map((answer) => {
                const isOwnAnswer = myUserId === answer.user_id;
                const isBest = question.best_answer_id === answer.id;
                const busy = busyAnswerId === answer.id;
                return (
                  <View key={answer.id} style={[styles.answerCard, isBest && styles.answerCardBest]}>
                    {isBest ? (
                      <View style={styles.bestBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <AppText variant="caption" color={colors.success} style={styles.bestBadgeText}>
                          En İyi Cevap
                        </AppText>
                      </View>
                    ) : null}

                    <AppText variant="body">{answer.body}</AppText>

                    <View style={styles.authorRow}>
                      <AppText variant="caption" color={colors.textSecondary}>
                        {forumAuthorLabel(answer.profiles)} · {formatForumDate(answer.created_at)}
                      </AppText>
                      {!isOwnAnswer ? (
                        <Pressable onPress={() => handleBlockUser(answer.user_id, false)}>
                          <AppText variant="caption" color={colors.textDisabled}>
                            Engelle
                          </AppText>
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={styles.answerActionsRow}>
                      {isOwnQuestion ? (
                        <Pressable onPress={() => handleToggleBest(answer.id)} disabled={busy}>
                          <AppText variant="caption" color={isBest ? colors.textSecondary : colors.primary}>
                            {isBest ? "En iyi işaretini kaldır" : "En iyi cevap olarak işaretle"}
                          </AppText>
                        </Pressable>
                      ) : null}
                      {isOwnAnswer ? (
                        <Pressable onPress={() => handleDeleteAnswer(answer.id)} disabled={busy}>
                          <AppText variant="caption" color={colors.danger}>
                            Sil
                          </AppText>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => setReportTarget({ contentType: "forum_answer", contentId: answer.id })}
                        >
                          <AppText variant="caption" color={colors.textDisabled}>
                            Bildir
                          </AppText>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <View style={styles.inputField}>
              <TextField
                value={draft}
                onChangeText={setDraft}
                placeholder="Cevap yazın..."
                multiline
                errorText={sendError ?? undefined}
              />
            </View>
            <Pressable
              onPress={handleSendAnswer}
              disabled={sending || !draft.trim()}
              style={[styles.sendButton, (sending || !draft.trim()) && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </ScreenContainer>

      <ReportModal
        visible={!!reportTarget}
        contentType={reportTarget?.contentType ?? "forum_question"}
        contentId={reportTarget?.contentId ?? ""}
        onClose={() => setReportTarget(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  scrollContent: {
    padding: spacing.md,
  },
  hiddenBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  hiddenBannerText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  questionBody: {
    marginTop: spacing.sm,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bikeModelTag: {
    borderColor: colors.primary,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  questionActionButton: {
    marginTop: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  answersTitle: {
    marginBottom: spacing.sm,
  },
  noAnswers: {
    marginTop: spacing.sm,
  },
  answerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  answerCardBest: {
    borderColor: colors.success,
  },
  bestBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  bestBadgeText: {
    marginLeft: spacing.xs,
  },
  answerActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
