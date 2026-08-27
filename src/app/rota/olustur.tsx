import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { getCurrentCoordinates } from "@/lib/location/location";
import {
  AppMapMarker,
  AppMapPolyline,
  AppMapView,
  DirectionsError,
  fetchDirections,
  type GeocodingResult,
  type LatLng,
  MAX_DIRECTIONS_WAYPOINTS,
  searchPlaces,
} from "@/lib/map";
import { createRoute, MAX_ROUTE_POINTS } from "@/features/routes/api/routesApi";
import { simplifyToMaxPoints, totalDistanceKm } from "@/shared/utils/geo";
import { AppText } from "@/shared/components/AppText";
import { Button } from "@/shared/components/Button";
import { ScreenContainer } from "@/shared/components/ScreenContainer";
import { TextField } from "@/shared/components/TextField";
import { colors, radius, spacing } from "@/shared/theme";

type Mode = "guided" | "freeform";
type Step = "draw" | "form";

const MODE_OPTIONS: { key: Mode; label: string }[] = [
  { key: "guided", label: "Yol Takipli" },
  { key: "freeform", label: "Serbest Çizim" },
];

// Arama-yazarken debounce — her tuş vuruşunda Geocoding isteği atmamak için
// (bkz. README "Mapbox Maliyet Analizi").
const SEARCH_DEBOUNCE_MS = 400;

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Rota kaydedilirken bir hata oluştu.";
}

function formatDurationMin(min: number): string {
  const hours = Math.floor(min / 60);
  const mins = Math.round(min % 60);
  if (hours <= 0) return `${mins} dk`;
  return `${hours} sa ${mins} dk`;
}

export default function RotaOlusturScreen() {
  const [mode, setMode] = useState<Mode>("guided");
  const [step, setStep] = useState<Step>("draw");

  // Serbest çizim — mevcut nokta-nokta davranış birebir korunuyor.
  const [freeformPoints, setFreeformPoints] = useState<LatLng[]>([]);

  // Yol takipli — sıralı: [başlangıç, ...ara noktalar, bitiş].
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);
  const [directionsInfo, setDirectionsInfo] = useState<{ distanceKm: number; durationMin: number } | null>(
    null
  );
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [directionsError, setDirectionsError] = useState<string | null>(null);

  // Adres/yer arama (her iki modda da kullanılabilir).
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuotaExceeded, setSearchQuotaExceeded] = useState(false);

  // Kullanıcının mevcut konumu — izin ZATEN verilmişse haritayı oradan açar.
  // Bu ekranda ayrı bir izin isteme akışı yok (bkz. kesfet.tsx'teki
  // rationale modal) — izin yoksa sessizce varsayılan (Türkiye geneli)
  // kamerada kalınır.
  const [initialCamera, setInitialCamera] = useState<LatLng | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [durationText, setDurationText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCurrentCoordinates().then((coordinate) => {
      if (!cancelled && coordinate) setInitialCamera(coordinate);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Waypoint listesi her değiştiğinde (ekleme/sürükleme/geri alma) tek bir
  // yerden Directions API'yi tetikler — ayrı ayrı her mutasyon noktasında
  // çağrı yapmak yerine (bkz. MapService.tsx'teki aynı "özet key" deseni).
  const waypointsKey = waypoints.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`).join("|");
  useEffect(() => {
    if (mode !== "guided") return;
    if (waypoints.length < 2) {
      // Harici sistemle (Mapbox Directions) senkronizasyon — nokta sayısı
      // yetersizken önceki sonucu temizlemek amaçlı, react-hooks/set-state-in-effect
      // burada yanlış pozitif (bkz. kesfet.tsx'teki aynı gerekçe).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRouteCoordinates([]);
      setDirectionsInfo(null);
      setDirectionsError(null);
      return;
    }
    let cancelled = false;
    setDirectionsLoading(true);
    setDirectionsError(null);
    fetchDirections(waypoints)
      .then((result) => {
        if (cancelled) return;
        setRouteCoordinates(result.coordinates);
        setDirectionsInfo({ distanceKm: result.distanceKm, durationMin: result.durationMin });
      })
      .catch((err) => {
        if (cancelled) return;
        setRouteCoordinates([]);
        setDirectionsInfo(null);
        setDirectionsError(err instanceof DirectionsError ? err.message : "Yol tarifi alınamadı.");
      })
      .finally(() => {
        if (!cancelled) setDirectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // waypointsKey, waypoints'in içerik-eşitliğini özetleyen stabil bir string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointsKey, mode]);

  // Arama kutusu — debounce'lu.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timeout = setTimeout(() => {
      searchPlaces(query, initialCamera ?? undefined)
        .then((results) => setSearchResults(results))
        .catch((err) => {
          setSearchResults([]);
          if (!searchQuotaExceeded) {
            setSearchQuotaExceeded(true);
            Alert.alert("Sınıra ulaşıldı", err instanceof Error ? err.message : "Adres arama şu an kullanılamıyor.");
          }
        })
        .finally(() => setSearchLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchQuery, initialCamera, searchQuotaExceeded]);

  const handleFreeformPress = (coordinate: LatLng) => {
    if (freeformPoints.length >= MAX_ROUTE_POINTS) {
      Alert.alert("Nokta sınırına ulaşıldı", `Bir rota en fazla ${MAX_ROUTE_POINTS} nokta içerebilir.`);
      return;
    }
    setFreeformPoints((prev) => [...prev, coordinate]);
  };

  const handleGuidedSelect = (coordinate: LatLng) => {
    if (waypoints.length >= MAX_DIRECTIONS_WAYPOINTS) {
      Alert.alert("Nokta sınırına ulaşıldı", `Bir rota en fazla ${MAX_DIRECTIONS_WAYPOINTS} nokta içerebilir.`);
      return;
    }
    if (waypoints.length === 0) {
      setWaypoints([coordinate]);
    } else if (waypoints.length === 1) {
      setWaypoints([...waypoints, coordinate]);
    } else {
      // Yeni ara nokta her zaman bitişten hemen önce eklenir — basit ve
      // öngörülebilir bir davranış; kullanıcı ekledikten sonra sürükleyerek
      // konumunu ince ayarlayabilir.
      setWaypoints([...waypoints.slice(0, -1), coordinate, waypoints[waypoints.length - 1]]);
    }
  };

  const handleWaypointDragEnd = (index: number, coordinate: LatLng) => {
    setWaypoints((prev) => prev.map((wp, i) => (i === index ? coordinate : wp)));
  };

  const handleSelectSearchResult = (result: GeocodingResult) => {
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchResults([]);
    if (mode === "guided") {
      handleGuidedSelect(result.coordinate);
    } else {
      handleFreeformPress(result.coordinate);
    }
  };

  const handleUndo = () => {
    if (mode === "guided") {
      setWaypoints((prev) => {
        if (prev.length <= 1) return [];
        if (prev.length === 2) return [prev[0]];
        return [...prev.slice(0, -2), prev[prev.length - 1]];
      });
    } else {
      setFreeformPoints((prev) => prev.slice(0, -1));
    }
  };

  const handleReset = () => {
    if (mode === "guided") {
      setWaypoints([]);
    } else {
      setFreeformPoints([]);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Eksik bilgi", "Rota başlığı gerekli.");
      return;
    }

    let pointsToSave: LatLng[];
    let distanceKm: number | undefined;
    let durationMin: number | undefined;

    if (mode === "guided") {
      if (!directionsInfo || routeCoordinates.length < 2) {
        Alert.alert("Rota eksik", "Önce başlangıç ve bitiş noktası seçip yol tarifinin hesaplanmasını bekleyin.");
        return;
      }
      // Directions API'nin tam geometrisi (overview=full) uzun rotalarda
      // MAX_ROUTE_POINTS'i kolayca aşabilir — depolamadan önce sadeleştir.
      pointsToSave = simplifyToMaxPoints(routeCoordinates, MAX_ROUTE_POINTS);
      distanceKm = directionsInfo.distanceKm;
      durationMin = directionsInfo.durationMin;
    } else {
      const parsed = durationText.trim() ? Number(durationText.trim()) : undefined;
      if (durationText.trim() && (Number.isNaN(parsed) || (parsed ?? 0) <= 0)) {
        Alert.alert("Geçersiz süre", "Tahmini süre pozitif bir sayı olmalı.");
        return;
      }
      pointsToSave = freeformPoints;
      durationMin = parsed;
    }

    setSubmitting(true);
    try {
      const route = await createRoute({
        title: title.trim(),
        description: description.trim() || undefined,
        region: region.trim() || undefined,
        estimatedDurationMin: durationMin,
        points: pointsToSave,
        distanceKm,
      });
      router.replace({ pathname: "/rota/[id]", params: { id: route.id } });
    } catch (err) {
      Alert.alert("Kaydedilemedi", describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "draw") {
    const activePoints = mode === "guided" ? (routeCoordinates.length > 1 ? routeCoordinates : waypoints) : freeformPoints;
    const canUndo = mode === "guided" ? waypoints.length > 0 : freeformPoints.length > 0;
    const canGoNext = mode === "guided" ? routeCoordinates.length >= 2 && !directionsLoading : freeformPoints.length >= 2;
    const nextLabel =
      mode === "guided"
        ? directionsInfo
          ? `İleri (${directionsInfo.distanceKm.toFixed(1)} km)`
          : "İleri"
        : `İleri (${totalDistanceKm(freeformPoints).toFixed(1)} km)`;

    const hintText =
      mode === "guided"
        ? waypoints.length === 0
          ? "Başlangıç noktası için haritaya dokunun veya yukarıdan arayın"
          : waypoints.length === 1
            ? "Bitiş noktası için haritaya dokunun veya arayın"
            : directionsLoading
              ? "Yol tarifi hesaplanıyor..."
              : directionsInfo
                ? `${directionsInfo.distanceKm.toFixed(1)} km · ~${formatDurationMin(directionsInfo.durationMin)} — ara nokta eklemek için dokunun, noktaları sürükleyerek rotayı değiştirebilirsiniz`
                : "Yol tarifi bekleniyor..."
        : `Rotayı çizmek için haritaya dokunun (${freeformPoints.length}/${MAX_ROUTE_POINTS} nokta)`;

    return (
      <>
        <Stack.Screen options={{ title: "Rota Oluştur", headerShown: true }} />
        <ScreenContainer padded={false}>
          <View style={styles.mapWrapper}>
            <AppMapView
              onMapPress={mode === "guided" ? handleGuidedSelect : handleFreeformPress}
              showsUserLocation
              fitToCoordinates={activePoints.length > 0 ? activePoints : undefined}
              initialCamera={activePoints.length === 0 && initialCamera ? { center: initialCamera, zoom: 12 } : undefined}
            >
              {mode === "guided" && routeCoordinates.length > 1 ? (
                <AppMapPolyline id="guided-route" coordinates={routeCoordinates} />
              ) : null}
              {mode === "freeform" ? <AppMapPolyline id="draft-route" coordinates={freeformPoints} /> : null}

              {mode === "guided"
                ? waypoints.map((wp, index) => {
                    const isStart = index === 0;
                    const isEnd = index === waypoints.length - 1 && waypoints.length > 1;
                    const role = isStart ? "start" : isEnd ? "end" : "mid";
                    const color = isStart ? colors.success : isEnd ? colors.danger : colors.primary;
                    // key/id'ye rol de dahil: bir nokta yeni bir ara nokta
                    // eklenmesiyle "bitiş"ten "ara nokta"ya düşünce (ya da
                    // tersi), @rnmapbox/maps'in PointAnnotation'ı aynı
                    // index'te SADECE coordinate'i günceller ama children'ın
                    // (rengin) görsel içeriğini native tarafta cache'leyip
                    // güncellemeyebiliyor — rol değiştiğinde key'in de
                    // değişmesi React'a component'i (ve dolayısıyla native
                    // annotation'ı) SIFIRDAN mount ettirir, bu da doğru
                    // rengin garantiye alınmasını sağlar.
                    return (
                      <AppMapMarker
                        key={`wp-${index}-${role}`}
                        marker={{ id: `wp-${index}-${role}`, coordinate: wp }}
                        draggable
                        onDragEnd={(coord) => handleWaypointDragEnd(index, coord)}
                      >
                        <View style={[styles.waypointDot, { backgroundColor: color }]} />
                      </AppMapMarker>
                    );
                  })
                : null}
            </AppMapView>

            <View style={styles.topOverlay}>
              <View style={styles.modeRow}>
                {MODE_OPTIONS.map((option) => {
                  const active = mode === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setMode(option.key)}
                      style={[styles.modePill, active && styles.modePillActive]}
                    >
                      <AppText variant="caption" color={active ? colors.textPrimary : colors.textSecondary}>
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.searchWrapper}>
                <TextField
                  placeholder="Yer veya adres ara (örn. Anamur)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchLoading ? (
                  <ActivityIndicator style={styles.searchLoadingIcon} color={colors.primary} size="small" />
                ) : null}
                {searchResults.length > 0 ? (
                  <View style={styles.searchResultsBox}>
                    {searchResults.map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.searchResultRow}
                        onPress={() => handleSelectSearchResult(item)}
                      >
                        <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                        <View style={styles.searchResultTextWrap}>
                          <AppText variant="bodyMedium" numberOfLines={1}>
                            {item.name}
                          </AppText>
                          {item.fullAddress ? (
                            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                              {item.fullAddress}
                            </AppText>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              {searchResults.length === 0 ? (
                <View style={styles.hintBanner}>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {hintText}
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.drawControls}>
              <Pressable
                style={[styles.controlButton, !canUndo && styles.controlButtonDisabled]}
                onPress={handleUndo}
                disabled={!canUndo}
              >
                <Ionicons name="arrow-undo" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                style={[styles.controlButton, !canUndo && styles.controlButtonDisabled]}
                onPress={handleReset}
                disabled={!canUndo}
              >
                <Ionicons name="trash" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {mode === "guided" && directionsError ? (
            <View style={styles.errorBanner}>
              <AppText variant="caption" color={colors.danger}>
                {directionsError}
              </AppText>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Button
              label={nextLabel}
              onPress={() => setStep("form")}
              disabled={!canGoNext}
              loading={mode === "guided" && directionsLoading}
            />
          </View>
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Rota Bilgileri", headerShown: true }} />
      <ScreenContainer>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="örn. Kuzey Kıyı Turu" />
          <TextField
            label="Açıklama (opsiyonel)"
            value={description}
            onChangeText={setDescription}
            placeholder="Rota hakkında kısa bilgi"
            multiline
            numberOfLines={3}
            style={styles.multilineInput}
          />
          <TextField label="Bölge (opsiyonel)" value={region} onChangeText={setRegion} placeholder="örn. Karadeniz" />

          {mode === "guided" ? (
            <View style={styles.summaryBox}>
              <AppText variant="caption" color={colors.textSecondary}>
                Mesafe: {directionsInfo?.distanceKm.toFixed(1)} km · Tahmini süre:{" "}
                {directionsInfo ? formatDurationMin(directionsInfo.durationMin) : "—"} · Mapbox yol tarifinden
                otomatik dolduruldu
              </AppText>
            </View>
          ) : (
            <>
              <TextField
                label="Tahmini Süre (dakika, opsiyonel)"
                value={durationText}
                onChangeText={setDurationText}
                placeholder="örn. 120"
                keyboardType="number-pad"
              />
              <View style={styles.summaryBox}>
                <AppText variant="caption" color={colors.textSecondary}>
                  Mesafe: {totalDistanceKm(freeformPoints).toFixed(1)} km · {freeformPoints.length} nokta
                </AppText>
              </View>
            </>
          )}

          <Button label="Kaydet" onPress={handleSave} loading={submitting} style={styles.saveButton} />
          <Button label="Geri Dön (Çizimi Düzenle)" onPress={() => setStep("draw")} variant="secondary" />
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    flex: 1,
  },
  topOverlay: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignSelf: "center",
  },
  modePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  searchWrapper: {
    position: "relative",
  },
  searchLoadingIcon: {
    position: "absolute",
    right: spacing.md,
    top: spacing.md,
  },
  searchResultsBox: {
    marginTop: -spacing.sm,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchResultTextWrap: {
    flex: 1,
  },
  hintBanner: {
    alignSelf: "center",
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  waypointDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  drawControls: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg + 90,
    gap: spacing.sm,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonDisabled: {
    opacity: 0.4,
  },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerMuted,
  },
  footer: {
    padding: spacing.md,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  summaryBox: {
    marginBottom: spacing.md,
  },
  saveButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
