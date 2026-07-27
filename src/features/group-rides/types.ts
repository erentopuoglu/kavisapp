import type { Database } from "@/lib/supabase/types";
import { colors } from "@/shared/theme";

export type GroupRide = Database["public"]["Tables"]["group_rides"]["Row"];
export type GroupRideParticipant = Database["public"]["Tables"]["group_ride_participants"]["Row"];
export type GroupRideMessage = Database["public"]["Tables"]["group_ride_messages"]["Row"];
export type LiveLocation = Database["public"]["Tables"]["live_locations"]["Row"];
export type GroupRideStatus = GroupRide["status"];
export type ParticipantStatus = GroupRideParticipant["status"];

export type ParticipantWithProfile = GroupRideParticipant & {
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export type MessageWithProfile = GroupRideMessage & {
  profiles: { username: string; display_name: string | null } | null;
};

export const GROUP_RIDE_STATUS_META: Record<GroupRideStatus, { label: string; color: string }> = {
  upcoming: { label: "Yaklaşan", color: colors.primary },
  active: { label: "Aktif", color: colors.success },
  completed: { label: "Tamamlandı", color: colors.textSecondary },
  cancelled: { label: "İptal Edildi", color: colors.danger },
};

export const PARTICIPANT_STATUS_META: Record<ParticipantStatus, { label: string; color: string }> = {
  requested: { label: "Bekliyor", color: colors.warning },
  approved: { label: "Onaylandı", color: colors.success },
  rejected: { label: "Reddedildi", color: colors.danger },
  left: { label: "Ayrıldı", color: colors.textSecondary },
};

// Canlı konum pin tazeliği — Faz 4 onayında belirlenen eşikler.
export const LIVE_LOCATION_STALE_AFTER_MS = 30_000;
export const LIVE_LOCATION_DROP_AFTER_MS = 5 * 60_000;

// Konum paylaşımı bu periyotta güncellenir (foreground-only, v1 kapsamı).
export const LIVE_LOCATION_UPDATE_INTERVAL_MS = 10_000;
export const LIVE_LOCATION_MIN_DISTANCE_M = 15;
