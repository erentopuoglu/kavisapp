import Mapbox from "@rnmapbox/maps";
import { ComponentRef, PropsWithChildren, ReactNode, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import {
  computeFlyoverPlan,
  getFlyoverProgress,
  type FlyoverPlan,
  type FlyoverProgress,
  type FlyoverStop,
} from "@/lib/map/flyoverPath";
import { MAPBOX_PUBLIC_TOKEN, warnIfMapboxTokenMissing } from "@/lib/map/mapboxToken";
import type { CameraPosition, LatLng, MapMarkerData } from "@/lib/map/types";
import { colors } from "@/shared/theme";

// TEK GİRİŞ NOKTASI: Uygulamanın geri kalanı haritayla yalnızca bu dosyadaki
// bileşenler üzerinden konuşur. @rnmapbox/maps'e özgü hiçbir tip veya API
// başka bir dosyaya sızmamalı — sağlayıcı değişimi (örn. MapLibre) sadece
// burayı yeniden yazmakla mümkün olmalı. (Directions/Geocoding için aynı
// ilke src/lib/map/directions.ts ve geocoding.ts'de — onlar @rnmapbox/maps
// native modülüne değil düz HTTP'ye dayandığı için ayrı dosyalar. Flyover
// kamera YOLU'nun matematiği de aynı sebeple flyoverPath.ts'te ayrı — o
// dosya Mapbox'a hiç bağımlı değil, burası sadece onu native Camera/Terrain
// API'sine bağlıyor.)

// Konum verilmediğinde varsayılan kamera — Türkiye geneli.
const DEFAULT_CENTER: [number, number] = [35.2433, 38.9637];
const DEFAULT_ZOOM = 5;

// Mapbox'ın resmi yükseklik (elevation) tile seti — sadece Maps SDK
// içinden erişilebilir (Raster Tiles API üzerinden YOK), yani ayrı bir
// metrelenen API çağrısı değil, zaten sayılan harita oturumunun parçası
// (bkz. README "Store Öncesi Son Düzeltmeler" / flyover araştırma notları).
const TERRAIN_DEM_SOURCE_ID = "kavis-flyover-terrain-dem";
const TERRAIN_EXAGGERATION = 1.3; // doğal ama fark edilir — karikatürize etmeyen bir değer
const FLYOVER_PROGRESS_TICK_MS = 200;

let isConfigured = false;
function ensureConfigured() {
  if (isConfigured) return;
  warnIfMapboxTokenMissing();
  Mapbox.setAccessToken(MAPBOX_PUBLIC_TOKEN);
  isConfigured = true;
}

/** Sürüş özeti/rota detay ekranlarının AppMapView'e geçtiği flyover kontrolü.
 *  Mapbox'a özgü hiçbir şey yok (LatLng/callback'ler dışında) — Expo Go
 *  mock'u (MapService.expo-go.tsx) da BİREBİR aynı şekli kullanır. */
export type FlyoverControl = {
  active: boolean;
  coordinates: LatLng[];
  onProgress?: (progress: FlyoverProgress) => void;
  onFinish?: () => void;
};
export type { FlyoverProgress };

function toNativeOverviewStop(plan: FlyoverPlan, padding: number): Mapbox.CameraStop {
  const { minLat, maxLat, minLng, maxLng } = plan.overviewBounds;
  return {
    bounds: {
      ne: [maxLng, maxLat],
      sw: [minLng, minLat],
      paddingLeft: padding,
      paddingRight: padding,
      paddingTop: padding,
      paddingBottom: padding,
    },
    pitch: plan.overviewPitch,
    heading: 0,
    animationDuration: plan.overviewDurationMs,
    animationMode: "easeTo",
  };
}

function toNativeRoadStop(stop: FlyoverStop): Mapbox.CameraStop {
  return {
    centerCoordinate: [stop.coordinate.longitude, stop.coordinate.latitude],
    heading: stop.bearing,
    pitch: stop.pitch,
    zoomLevel: stop.zoom,
    animationDuration: stop.durationMs,
    // İlk durak (genel görünümden yola iniş) "flyTo" ile daha sinematik bir
    // eğri izler; geri kalan yol boyunca "linearTo" kullanılıyor — ardışık
    // duraklar zaten sık (~50m) olduğu için linearTo, flyTo'nun her adımda
    // tekrar yükselip alçalma eğilimini önleyip pürüzsüz bir takip sağlıyor.
    animationMode: stop.kind === "descend" ? "flyTo" : "linearTo",
  };
}

type AppMapViewProps = PropsWithChildren<{
  style?: ViewStyle;
  /** Sabit bir merkez/zoom kamerası. fitToCoordinates verilirse yok sayılır. */
  initialCamera?: CameraPosition;
  /** Verilen noktaların tümünü kapsayacak şekilde kamerayı otomatik uydurur
   *  (rota önizleme, tüm rotaları gösterme gibi durumlar için). Veri
   *  asenkron geldiğinde (örn. fetch sonrası) kamera otomatik uçarak
   *  günceller. */
  fitToCoordinates?: LatLng[];
  fitPadding?: number;
  showsUserLocation?: boolean;
  onMapPress?: (coordinate: LatLng) => void;
  /** 3D sinematik flyover — verilmezse haritanın davranışı hiç değişmez.
   *  active=true olduğunda: kamera normal (initialCamera/fitToCoordinates)
   *  konumundan çıkar, hesaplanan senaryoyu (genel görünüm → yola iniş →
   *  rota boyunca uçuş) native tarafta oynatır; terrain/gökyüzü katmanları
   *  SADECE bu süre boyunca mount edilir (bkz. dosya başındaki performans
   *  notu). active=false olduğunda normal kameraya geri döner. */
  flyover?: FlyoverControl;
}>;

export function AppMapView({
  style,
  initialCamera,
  fitToCoordinates,
  fitPadding = 56,
  showsUserLocation = false,
  onMapPress,
  flyover,
  children,
}: AppMapViewProps) {
  useEffect(() => {
    ensureConfigured();
  }, []);

  const cameraRef = useRef<ComponentRef<typeof Mapbox.Camera>>(null);
  const flyoverTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mapbox'a özgü flyover sürücüsü: flyover.active true olduğunda plan
  // hesaplanır, tüm duraklar TEK SEFERDE native tarafa verilir (her kare
  // için JS'den güncelleme YOK — bkz. flyoverPath.ts araştırma notu) ve
  // ilerleme çubuğu için hafif bir JS zamanlayıcı çalışır. false olduğunda
  // (durduruldu ya da bitti) zamanlayıcı temizlenir, aşağıdaki declarative
  // <Mapbox.Camera {...cameraSettings}> tekrar devreye girip kamerayı
  // normal görünüme yumuşakça geri döndürür.
  useEffect(() => {
    if (flyoverTimerRef.current) {
      clearInterval(flyoverTimerRef.current);
      flyoverTimerRef.current = null;
    }
    if (!flyover?.active) return;

    const plan = computeFlyoverPlan(flyover.coordinates);
    if (!plan) {
      // Anlamlı bir rota yoksa (< 2 nokta) sessizce biter — çağıran ekran
      // zaten "Oynat" düğmesini bu durumda devre dışı bırakmalı.
      flyover.onFinish?.();
      return;
    }

    const nativeStops: Mapbox.CameraStop[] = [
      toNativeOverviewStop(plan, fitPadding),
      ...plan.roadStops.map(toNativeRoadStop),
    ];

    // Terrain/RasterDemSource/SkyLayer bu render'da YENİ mount ediliyor —
    // cameraRef bu tam anda henüz native tarafa bağlanmamış olabilir
    // (gözlemlenen bir sorun: ref null iken setCamera sessizce hiçbir şey
    // yapmıyor, ne hata ne log). Ref hazır olana kadar birkaç kare dene.
    let cancelled = false;
    let attempts = 0;
    const trySetCamera = () => {
      if (cancelled) return;
      if (cameraRef.current) {
        cameraRef.current.setCamera({ type: "CameraStops", stops: nativeStops });
        return;
      }
      attempts += 1;
      if (attempts > 30) return; // ~yarım saniye+ denedik, native view hiç hazır olmadı
      requestAnimationFrame(trySetCamera);
    };
    trySetCamera();

    const startedAt = Date.now();
    flyoverTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      flyover.onProgress?.(getFlyoverProgress(plan, elapsed));
      if (elapsed >= plan.totalDurationMs && flyoverTimerRef.current) {
        clearInterval(flyoverTimerRef.current);
        flyoverTimerRef.current = null;
        flyover.onFinish?.();
      }
    }, FLYOVER_PROGRESS_TICK_MS);

    return () => {
      cancelled = true;
      if (flyoverTimerRef.current) {
        clearInterval(flyoverTimerRef.current);
        flyoverTimerRef.current = null;
      }
    };
    // flyover.coordinates/onProgress/onFinish her render'da yeni referans
    // olabilir (ekranlar genelde inline geçer) — sadece active DEĞİŞTİĞİNDE
    // yeniden tetiklenmesi bilinçli: aksi halde her render'da uçuş baştan
    // başlardı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyover?.active]);

  const cameraKey = fitToCoordinates
    ? fitToCoordinates.map((c) => `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`).join("|")
    : `${initialCamera?.center.latitude ?? ""},${initialCamera?.center.longitude ?? ""}`;

  const cameraSettings = useMemo(() => {
    if (fitToCoordinates && fitToCoordinates.length > 1) {
      const lats = fitToCoordinates.map((c) => c.latitude);
      const lngs = fitToCoordinates.map((c) => c.longitude);
      return {
        bounds: {
          ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
          sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
          paddingLeft: fitPadding,
          paddingRight: fitPadding,
          paddingTop: fitPadding,
          paddingBottom: fitPadding,
        },
      };
    }
    if (fitToCoordinates && fitToCoordinates.length === 1) {
      return {
        centerCoordinate: [fitToCoordinates[0].longitude, fitToCoordinates[0].latitude] as [number, number],
        zoomLevel: 13,
      };
    }
    if (initialCamera) {
      return {
        centerCoordinate: [initialCamera.center.longitude, initialCamera.center.latitude] as [
          number,
          number,
        ],
        zoomLevel: initialCamera.zoom,
      };
    }
    return { centerCoordinate: DEFAULT_CENTER, zoomLevel: DEFAULT_ZOOM };
    // cameraKey, bağımlılıkları özetleyen stabil bir string olarak kullanılıyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, fitPadding]);

  return (
    <Mapbox.MapView
      style={[styles.flex, style]}
      styleURL={Mapbox.StyleURL.Dark}
      onPress={(feature) => {
        if (!onMapPress) return;
        const point = feature.geometry as GeoJSON.Point;
        const [longitude, latitude] = point.coordinates;
        onMapPress({ latitude, longitude });
      }}
    >
      <Mapbox.Camera
        ref={cameraRef}
        animationDuration={400}
        // flyover aktifken declarative cameraSettings'i BİLEREK vermiyoruz —
        // aksi halde her render'da prop-diff, yukarıdaki imperative
        // setCamera('CameraStops') ile "kamera savaşı" yaşardı. flyover
        // kapanınca cameraSettings geri gelip kamerayı normal görünüme
        // yumuşakça (varsayılan animasyonla) döndürür.
        {...(flyover?.active ? {} : cameraSettings)}
      />
      {flyover?.active ? (
        <>
          <Mapbox.RasterDemSource
            id={TERRAIN_DEM_SOURCE_ID}
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxZoomLevel={14}
          >
            <Mapbox.Terrain style={{ exaggeration: TERRAIN_EXAGGERATION }} />
          </Mapbox.RasterDemSource>
          <Mapbox.SkyLayer
            id="kavis-flyover-sky"
            style={{ skyType: "atmosphere", skyAtmosphereSun: [0, 0] }}
          />
        </>
      ) : null}
      {showsUserLocation ? <Mapbox.UserLocation visible /> : null}
      {children}
    </Mapbox.MapView>
  );
}

type AppMapMarkerProps = {
  marker: MapMarkerData;
  children?: ReactNode;
  /** Kullanıcının işaretçiyi parmağıyla sürükleyip taşıyabilmesini sağlar
   *  (ör. rota oluşturmada ara nokta/waypoint'i yeniden konumlandırma). */
  draggable?: boolean;
  onDragEnd?: (coordinate: LatLng) => void;
};

export function AppMapMarker({ marker, children, draggable = false, onDragEnd }: AppMapMarkerProps) {
  return (
    <Mapbox.PointAnnotation
      id={marker.id}
      coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
      draggable={draggable}
      onDragEnd={(feature) => {
        if (!onDragEnd) return;
        const point = feature.geometry as GeoJSON.Point;
        const [longitude, latitude] = point.coordinates;
        onDragEnd({ latitude, longitude });
      }}
    >
      <View>{children ?? <View style={styles.defaultMarker} />}</View>
    </Mapbox.PointAnnotation>
  );
}

type AppMapPolylineProps = {
  id: string;
  coordinates: LatLng[];
  color?: string;
  width?: number;
};

export function AppMapPolyline({ id, coordinates, color = colors.primary, width = 4 }: AppMapPolylineProps) {
  if (coordinates.length < 2) return null;

  const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: coordinates.map((c) => [c.longitude, c.latitude]),
    },
  };

  return (
    <Mapbox.ShapeSource id={`${id}-source`} shape={geojson}>
      <Mapbox.LineLayer
        id={`${id}-layer`}
        style={{ lineColor: color, lineWidth: width, lineCap: "round", lineJoin: "round" }}
      />
    </Mapbox.ShapeSource>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  defaultMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
});
