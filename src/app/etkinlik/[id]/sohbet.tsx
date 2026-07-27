import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { fetchGroupRideById } from "@/features/group-rides/api/groupRidesApi";
import { fetchMessages, sendMessage, subscribeToMessages } from "@/features/group-rides/api/groupRideMessagesApi";
import type { GroupRideMessage, MessageWithProfile } from "@/features/group-rides/types";
import { ReportModal } from "@/features/moderation/components/ReportModal";
import { supabase } from "@/lib/supabase/client";
import { AppText } from "@/shared/components/AppText";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Mesaj gönderilemedi.";
}

export default function EtkinlikSohbetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((state) => state.session);

  const [messages, setMessages] = useState<MessageWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatLocked, setChatLocked] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [ride, initialMessages] = await Promise.all([fetchGroupRideById(id), fetchMessages(id)]);
      setChatLocked(ride.status === "cancelled");
      setMessages(initialMessages);
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Mount'ta sohbet geçmişini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Realtime INSERT payload'ı ham satırdır, profiles join'i içermez —
  // kendi mesajımız değilse gönderenin adını ayrıca çekip dolduruyoruz.
  const profileCacheRef = useRef<Map<string, { username: string; display_name: string | null }>>(new Map());

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToMessages(id, (message: GroupRideMessage) => {
      setMessages((prev) => [...prev, { ...message, profiles: null }]);

      if (message.user_id === session?.user.id) return;
      const cached = profileCacheRef.current.get(message.user_id);
      if (cached) {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, profiles: cached } : m))
        );
        return;
      }
      supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", message.user_id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          profileCacheRef.current.set(message.user_id, data);
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, profiles: data } : m)));
        });
    });
    return unsubscribe;
  }, [id, session?.user.id]);

  const handleSend = async () => {
    if (!id || !session || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await sendMessage(id, session.user.id, draft.trim());
      setDraft("");
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Etkinlik Sohbeti", headerShown: true }} />
      <ScreenContainer padded={false}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                const isOwn = item.user_id === session?.user.id;
                return (
                  <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                    <View style={[styles.bubble, isOwn && styles.bubbleOwn]}>
                      {!isOwn ? (
                        <AppText variant="caption" color={colors.textSecondary}>
                          {item.profiles?.display_name ?? item.profiles?.username ?? "Kullanıcı"}
                        </AppText>
                      ) : null}
                      <AppText variant="body">{item.message}</AppText>
                    </View>
                    {!isOwn ? (
                      <Pressable onPress={() => setReportTarget(item.id)} style={styles.reportIcon}>
                        <Ionicons name="flag-outline" size={16} color={colors.textDisabled} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <AppText variant="body" color={colors.textSecondary}>
                    Henüz mesaj yok.
                  </AppText>
                </View>
              }
            />
          )}

          {chatLocked ? (
            <View style={styles.lockedBanner}>
              <AppText variant="caption" color={colors.textSecondary}>
                Bu etkinlik iptal edildiği için sohbet salt okunur.
              </AppText>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <View style={styles.inputField}>
                <TextField
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Mesaj yazın..."
                  errorText={sendError ?? undefined}
                />
              </View>
              <Pressable
                onPress={handleSend}
                disabled={sending || !draft.trim()}
                style={[styles.sendButton, (sending || !draft.trim()) && styles.sendButtonDisabled]}
              >
                <Ionicons name="send" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </ScreenContainer>

      <ReportModal
        visible={!!reportTarget}
        contentType="group_ride_message"
        contentId={reportTarget ?? ""}
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  listContent: {
    padding: spacing.md,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  bubbleRowOwn: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bubbleOwn: {
    backgroundColor: colors.primaryMuted,
  },
  reportIcon: {
    padding: spacing.xs,
  },
  lockedBanner: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
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
