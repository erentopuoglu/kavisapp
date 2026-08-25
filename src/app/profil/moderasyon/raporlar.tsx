import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from "react-native";

import { dismissReports, fetchContentPreview, fetchPendingReports, hideContent } from "@/features/admin/api/adminApi";
import { CONTENT_TYPE_LABELS, type ContentPreview, type PendingReportGroup } from "@/features/admin/types";
import { REPORT_REASONS } from "@/features/moderation/types";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

type GroupWithPreview = PendingReportGroup & { preview: ContentPreview };

function groupKey(group: PendingReportGroup): string {
  return `${group.contentType}:${group.contentId}`;
}

export default function BekleyenRaporlarScreen() {
  const [groups, setGroups] = useState<GroupWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pending = await fetchPendingReports();
      const withPreviews = await Promise.all(
        pending.map(async (group) => ({
          ...group,
          preview: await fetchContentPreview(group.contentType, group.contentId),
        }))
      );
      setGroups(withPreviews);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount'ta bekleyen raporları çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleHide = (group: GroupWithPreview) => {
    Alert.alert("İçeriği Gizle", "Bu içerik topluluktan gizlenecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Gizle",
        style: "destructive",
        onPress: async () => {
          setBusyKey(groupKey(group));
          try {
            await hideContent(group.contentType, group.contentId);
            setGroups((prev) => prev.filter((g) => groupKey(g) !== groupKey(group)));
          } catch (err) {
            Alert.alert("Gizlenemedi", describeError(err));
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);
  };

  const handleDismiss = (group: GroupWithPreview) => {
    Alert.alert("Raporları Reddet", "Bu içerikle ilgili bekleyen raporlar asılsız olarak işaretlenecek.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Reddet",
        onPress: async () => {
          setBusyKey(groupKey(group));
          try {
            await dismissReports(group.contentType, group.contentId);
            setGroups((prev) => prev.filter((g) => groupKey(g) !== groupKey(group)));
          } catch (err) {
            Alert.alert("Reddedilemedi", describeError(err));
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Bekleyen Raporlar", headerShown: true }} />
      <ScreenContainer padded={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
            <AppText variant="body" color={colors.danger} style={styles.errorText}>
              {error}
            </AppText>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={groupKey}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                <AppText variant="body" color={colors.textSecondary} style={styles.errorText}>
                  Bekleyen rapor yok.
                </AppText>
              </View>
            }
            renderItem={({ item }) => {
              const busy = busyKey === groupKey(item);
              return (
                <View style={styles.card}>
                  <View style={styles.typeRow}>
                    <AppText variant="caption" color={colors.primary}>
                      {CONTENT_TYPE_LABELS[item.contentType as keyof typeof CONTENT_TYPE_LABELS] ?? item.contentType}
                    </AppText>
                    <AppText variant="caption" color={colors.textDisabled}>
                      {item.reports.length} rapor
                    </AppText>
                  </View>

                  {item.preview ? (
                    <>
                      <AppText variant="bodyMedium" numberOfLines={1}>
                        {item.preview.title}
                      </AppText>
                      {item.preview.snippet ? (
                        <AppText variant="caption" color={colors.textSecondary} numberOfLines={3} style={styles.snippet}>
                          {item.preview.snippet}
                        </AppText>
                      ) : null}
                      <AppText variant="caption" color={colors.textDisabled} style={styles.author}>
                        {item.preview.authorUsername}
                        {item.preview.isHidden ? " · zaten gizli" : ""}
                      </AppText>
                    </>
                  ) : (
                    <AppText variant="caption" color={colors.textDisabled} style={styles.snippet}>
                      İçerik bulunamadı (silinmiş olabilir).
                    </AppText>
                  )}

                  <View style={styles.reasonsBlock}>
                    {item.reports.map((report) => (
                      <View key={report.id} style={styles.reasonRow}>
                        <Ionicons name="flag" size={12} color={colors.textDisabled} />
                        <AppText variant="caption" color={colors.textSecondary} style={styles.reasonText}>
                          {REASON_LABELS[report.reason] ?? report.reason}
                          {report.details ? ` — ${report.details}` : ""}
                          {" · "}
                          {report.profiles?.username ?? "kullanıcı"}
                        </AppText>
                      </View>
                    ))}
                  </View>

                  <View style={styles.actionsRow}>
                    <Button
                      label="Reddet"
                      onPress={() => handleDismiss(item)}
                      variant="secondary"
                      loading={busy}
                      style={styles.actionButton}
                    />
                    <Button
                      label="Gizle"
                      onPress={() => handleHide(item)}
                      variant="danger"
                      loading={busy}
                      style={styles.actionButton}
                    />
                  </View>
                </View>
              );
            }}
          />
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  listContent: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  snippet: {
    marginTop: spacing.xs,
  },
  author: {
    marginTop: spacing.xs,
  },
  reasonsBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  reasonText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
