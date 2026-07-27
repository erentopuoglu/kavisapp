import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import { ReportModal } from "@/features/moderation/components/ReportModal";
import { deletePoi, fetchMyVote, fetchPoiById, removeVote, voteOnPoi } from "@/features/poi/api/poiApi";
import { POI_TYPE_META, poiNetScore, type Poi, type PoiVote } from "@/features/poi/types";
import { AppMapMarker, AppMapView } from "@/lib/map";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

export default function PoiDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((state) => state.session);

  const [poi, setPoi] = useState<Poi | null>(null);
  const [myVote, setMyVote] = useState<PoiVote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPoiById(id);
      setPoi(data);
      if (session) {
        const vote = await fetchMyVote(id, session.user.id);
        setMyVote(vote);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    // Mount'ta POI verisini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleVote = async (direction: "up" | "down") => {
    if (!id || !session) return;
    setVoting(true);
    try {
      if (myVote?.vote === direction) {
        await removeVote(id, session.user.id);
      } else {
        await voteOnPoi(id, session.user.id, direction);
      }
      await load();
    } catch (err) {
      Alert.alert("Oy kaydedilemedi", describeError(err));
    } finally {
      setVoting(false);
    }
  };

  const handleDelete = () => {
    if (!poi) return;
    Alert.alert("İşaretli Noktayı Sil", "Bu işaretli nokta kalıcı olarak silinecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deletePoi(poi.id);
            router.replace("/(tabs)/harita");
          } catch (err) {
            Alert.alert("Silinemedi", describeError(err));
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error || !poi) {
    return (
      <ScreenContainer style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.errorText}>
          {error ?? "İşaretli nokta bulunamadı."}
        </AppText>
      </ScreenContainer>
    );
  }

  const meta = POI_TYPE_META[poi.type];
  const isOwn = session?.user.id === poi.creator_id;
  const coordinate = poi.location_geojson
    ? { latitude: poi.location_geojson.coordinates[1], longitude: poi.location_geojson.coordinates[0] }
    : null;

  return (
    <>
      <Stack.Screen options={{ title: poi.title, headerShown: true }} />
      <ScreenContainer padded={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.mapWrapper}>
            {coordinate ? (
              <AppMapView initialCamera={{ center: coordinate, zoom: 14 }}>
                <AppMapMarker marker={{ id: poi.id, coordinate }}>
                  <View style={styles.mapMarker}>
                    <MaterialCommunityIcons name={meta.icon} size={16} color={meta.color ?? colors.primary} />
                  </View>
                </AppMapMarker>
              </AppMapView>
            ) : null}
          </View>

          <View style={styles.content}>
            {isOwn && poi.is_hidden ? (
              <View style={styles.hiddenBanner}>
                <Ionicons name="eye-off-outline" size={16} color={colors.warning} />
                <AppText variant="caption" color={colors.warning} style={styles.hiddenBannerText}>
                  Bu içerik, topluluk raporları nedeniyle gizlendi. Sadece siz görebiliyorsunuz.
                </AppText>
              </View>
            ) : null}

            <View style={styles.typeRow}>
              <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color ?? colors.primary} />
              <AppText variant="caption" color={colors.textSecondary} style={styles.typeLabel}>
                {meta.label}
              </AppText>
            </View>

            <AppText variant="title">{poi.title}</AppText>
            {poi.description ? (
              <AppText variant="body" color={colors.textSecondary} style={styles.description}>
                {poi.description}
              </AppText>
            ) : null}

            <View style={styles.voteRow}>
              <Pressable
                style={[styles.voteButton, myVote?.vote === "up" && styles.voteButtonActiveUp]}
                onPress={() => handleVote("up")}
                disabled={voting || isOwn}
              >
                <Ionicons
                  name="thumbs-up"
                  size={18}
                  color={myVote?.vote === "up" ? colors.success : colors.textSecondary}
                />
                <AppText variant="bodyMedium" style={styles.voteCount}>
                  {poi.upvotes}
                </AppText>
              </Pressable>
              <Pressable
                style={[styles.voteButton, myVote?.vote === "down" && styles.voteButtonActiveDown]}
                onPress={() => handleVote("down")}
                disabled={voting || isOwn}
              >
                <Ionicons
                  name="thumbs-down"
                  size={18}
                  color={myVote?.vote === "down" ? colors.danger : colors.textSecondary}
                />
                <AppText variant="bodyMedium" style={styles.voteCount}>
                  {poi.downvotes}
                </AppText>
              </Pressable>
              <AppText variant="caption" color={colors.textSecondary} style={styles.netScore}>
                Net: {poiNetScore(poi)}
              </AppText>
            </View>
            {isOwn ? (
              <AppText variant="caption" color={colors.textSecondary} style={styles.ownNote}>
                Kendi işaretli noktanızı oylayamazsınız.
              </AppText>
            ) : null}

            {!isOwn ? (
              <Button
                label="Bildir"
                onPress={() => setShowReport(true)}
                variant="secondary"
                style={styles.reportButton}
              />
            ) : (
              <Button
                label="İşaretli Noktayı Sil"
                onPress={handleDelete}
                variant="danger"
                loading={deleting}
                style={styles.reportButton}
              />
            )}
          </View>
        </ScrollView>
      </ScreenContainer>

      <ReportModal
        visible={showReport}
        contentType="poi"
        contentId={poi.id}
        onClose={() => setShowReport(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  mapWrapper: {
    height: 220,
  },
  mapMarker: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
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
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  typeLabel: {
    marginLeft: spacing.xs,
  },
  description: {
    marginTop: spacing.sm,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voteButtonActiveUp: {
    borderColor: colors.success,
  },
  voteButtonActiveDown: {
    borderColor: colors.danger,
  },
  voteCount: {
    marginLeft: spacing.xs,
  },
  netScore: {
    marginLeft: "auto",
  },
  ownNote: {
    marginTop: spacing.sm,
  },
  reportButton: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
