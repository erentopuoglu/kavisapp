import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useAuthStore } from "@/features/auth/store/useAuthStore";
import {
  approveParticipant,
  endGroupRide,
  fetchGroupRideById,
  fetchMyParticipation,
  fetchParticipants,
  leaveApprovedRide,
  rejectParticipant,
  requestToJoin,
  setGroupRideStatus,
  withdrawJoinRequest,
} from "@/features/group-rides/api/groupRidesApi";
import { StatusBadge } from "@/features/group-rides/components/StatusBadge";
import {
  GROUP_RIDE_STATUS_META,
  PARTICIPANT_STATUS_META,
  type GroupRide,
  type ParticipantWithProfile,
} from "@/features/group-rides/types";
import { formatScheduledAt } from "@/features/group-rides/utils";
import { AppMapMarker, AppMapView } from "@/lib/map";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { colors, radius, spacing } from "@/shared/theme";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Bir hata oluştu.";
}

export default function EtkinlikDetayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((state) => state.session);

  const [ride, setRide] = useState<GroupRide | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [myParticipation, setMyParticipation] = useState<ParticipantWithProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [rideData, participantsData] = await Promise.all([
        fetchGroupRideById(id),
        fetchParticipants(id),
      ]);
      setRide(rideData);
      setParticipants(participantsData);
      if (session) {
        const mine = await fetchMyParticipation(id, session.user.id);
        setMyParticipation(mine);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    // Mount'ta etkinlik + katılımcı verisini çek — harici sistemle senkronizasyon.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error || !ride) {
    return (
      <ScreenContainer style={styles.center}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <AppText variant="body" color={colors.danger} style={styles.errorText}>
          {error ?? "Etkinlik bulunamadı."}
        </AppText>
      </ScreenContainer>
    );
  }

  const isCreator = session?.user.id === ride.creator_id;
  const statusMeta = GROUP_RIDE_STATUS_META[ride.status];
  const coordinate = ride.start_point_geojson
    ? { latitude: ride.start_point_geojson.coordinates[1], longitude: ride.start_point_geojson.coordinates[0] }
    : null;
  const approvedParticipants = participants.filter((p) => p.status === "approved");
  const requestedParticipants = participants.filter((p) => p.status === "requested");
  const canAccessChatAndLive = isCreator || myParticipation?.status === "approved";

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      Alert.alert("İşlem başarısız", describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = () => {
    if (!session) return;
    void withBusy(() => requestToJoin(ride.id, session.user.id));
  };
  const handleWithdraw = () => {
    if (!session) return;
    void withBusy(() => withdrawJoinRequest(ride.id, session.user.id));
  };
  const handleLeave = () => {
    if (!session) return;
    Alert.alert("Sürüşten Ayrıl", "Bu etkinlikten ayrılmak istediğinize emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Ayrıl", style: "destructive", onPress: () => withBusy(() => leaveApprovedRide(ride.id, session.user.id)) },
    ]);
  };
  const handleStart = () => withBusy(() => setGroupRideStatus(ride.id, "active"));
  const handleCancel = () =>
    Alert.alert("Etkinliği İptal Et", "Bu etkinlik iptal edilecek. Emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "İptal Et", style: "destructive", onPress: () => withBusy(() => setGroupRideStatus(ride.id, "cancelled")) },
    ]);
  const handleEnd = () =>
    Alert.alert(
      "Sürüşü Bitir",
      "Sürüş tamamlanacak ve tüm katılımcıların canlı konumu kalıcı olarak silinecek. Emin misiniz?",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Bitir", style: "destructive", onPress: () => withBusy(() => endGroupRide(ride.id)) },
      ]
    );
  const handleApprove = (userId: string) => withBusy(() => approveParticipant(ride.id, userId));
  const handleReject = (userId: string) => withBusy(() => rejectParticipant(ride.id, userId));

  return (
    <>
      <Stack.Screen options={{ title: ride.title, headerShown: true }} />
      <ScreenContainer padded={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {coordinate ? (
            <View style={styles.mapWrapper}>
              <AppMapView initialCamera={{ center: coordinate, zoom: 13 }}>
                <AppMapMarker marker={{ id: ride.id, coordinate }} />
              </AppMapView>
            </View>
          ) : null}

          <View style={styles.content}>
            <View style={styles.headerRow}>
              <AppText variant="title" style={styles.title}>
                {ride.title}
              </AppText>
              <StatusBadge label={statusMeta.label} color={statusMeta.color} />
            </View>

            <AppText variant="body" color={colors.textSecondary} style={styles.scheduledAt}>
              {formatScheduledAt(ride.scheduled_at)}
            </AppText>
            {ride.start_address ? (
              <AppText variant="body" color={colors.textSecondary}>
                {ride.start_address}
              </AppText>
            ) : null}
            {ride.description ? (
              <AppText variant="body" style={styles.description}>
                {ride.description}
              </AppText>
            ) : null}

            <AppText variant="caption" color={colors.textSecondary} style={styles.participantCount}>
              {approvedParticipants.length}
              {ride.max_participants ? ` / ${ride.max_participants}` : ""} katılımcı
            </AppText>

            {ride.status === "cancelled" ? (
              <View style={styles.cancelledBanner}>
                <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                <AppText variant="caption" color={colors.danger} style={styles.cancelledBannerText}>
                  Bu etkinlik iptal edildi. Sohbet geçmişi görüntülenebilir ama yeni mesaj gönderilemez.
                </AppText>
              </View>
            ) : null}

            {!isCreator && !myParticipation ? (
              <Button label="Katılma İsteği Gönder" onPress={handleJoin} loading={busy} style={styles.actionButton} />
            ) : null}
            {!isCreator && myParticipation?.status === "requested" ? (
              <>
                <AppText variant="caption" color={colors.warning} style={styles.pendingText}>
                  İsteğiniz sahibinin onayını bekliyor.
                </AppText>
                <Button
                  label="İsteği Geri Çek"
                  onPress={handleWithdraw}
                  variant="secondary"
                  loading={busy}
                  style={styles.actionButton}
                />
              </>
            ) : null}
            {!isCreator && myParticipation?.status === "approved" ? (
              <Button
                label="Sürüşten Ayrıl"
                onPress={handleLeave}
                variant="secondary"
                loading={busy}
                style={styles.actionButton}
              />
            ) : null}

            {canAccessChatAndLive ? (
              <Button
                label="Sohbete Git"
                onPress={() => router.push({ pathname: "/etkinlik/[id]/sohbet", params: { id: ride.id } })}
                variant="secondary"
                style={styles.actionButton}
              />
            ) : null}
            {canAccessChatAndLive && ride.status === "active" ? (
              <Button
                label="Canlı Takip"
                onPress={() => router.push({ pathname: "/etkinlik/[id]/canli", params: { id: ride.id } })}
                style={styles.actionButton}
              />
            ) : null}

            {isCreator && ride.status === "upcoming" ? (
              <View style={styles.creatorRow}>
                <View style={styles.creatorRowItem}>
                  <Button label="Sürüşü Başlat" onPress={handleStart} loading={busy} />
                </View>
                <View style={styles.creatorRowItem}>
                  <Button label="İptal Et" onPress={handleCancel} variant="danger" loading={busy} />
                </View>
              </View>
            ) : null}
            {isCreator && ride.status === "active" ? (
              <Button label="Sürüşü Bitir" onPress={handleEnd} variant="danger" loading={busy} style={styles.actionButton} />
            ) : null}

            {isCreator && requestedParticipants.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="bodyMedium" style={styles.sectionTitle}>
                  Bekleyen İstekler
                </AppText>
                {requestedParticipants.map((participant) => (
                  <View key={participant.id} style={styles.participantRow}>
                    <AppText variant="body" style={styles.participantName}>
                      {participant.profiles?.display_name ?? participant.profiles?.username ?? "Kullanıcı"}
                    </AppText>
                    <View style={styles.participantActions}>
                      <Pressable onPress={() => handleApprove(participant.user_id)} style={styles.iconButton}>
                        <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                      </Pressable>
                      <Pressable onPress={() => handleReject(participant.user_id)} style={styles.iconButton}>
                        <Ionicons name="close-circle" size={24} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {approvedParticipants.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="bodyMedium" style={styles.sectionTitle}>
                  Katılımcılar
                </AppText>
                {approvedParticipants.map((participant) => (
                  <View key={participant.id} style={styles.participantRow}>
                    <AppText variant="body" style={styles.participantName}>
                      {participant.profiles?.display_name ?? participant.profiles?.username ?? "Kullanıcı"}
                    </AppText>
                    <StatusBadge
                      label={PARTICIPANT_STATUS_META.approved.label}
                      color={PARTICIPANT_STATUS_META.approved.color}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </ScreenContainer>
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
    height: 200,
  },
  content: {
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  scheduledAt: {
    marginTop: spacing.xs,
  },
  description: {
    marginTop: spacing.sm,
  },
  participantCount: {
    marginTop: spacing.sm,
  },
  cancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  cancelledBannerText: {
    marginLeft: spacing.xs,
    flex: 1,
  },
  pendingText: {
    marginTop: spacing.md,
  },
  actionButton: {
    marginTop: spacing.md,
  },
  creatorRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  creatorRowItem: {
    flex: 1,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  participantName: {
    flex: 1,
  },
  participantActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.xs,
  },
});
