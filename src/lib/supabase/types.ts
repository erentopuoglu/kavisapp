// Bu dosya elle yazılmıştır ve supabase/migrations/0000_init_schema.sql ile
// birebir eşleşecek şekilde tasarlanmıştır. Proje bir Supabase projesine
// bağlandıktan sonra gerçek/otomatik üretilmiş tipler için:
//
//   npm run gen:types
//
// komutunu çalıştırıp bu dosyanın üzerine yazın (script package.json'da tanımlı).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Supabase PostgREST, postgis sütunlarını (geography) otomatik olarak
// GeoJSON'a çevirip döndürür; biz de yazarken aynı şekle uyuyoruz.
export type GeoJsonPoint = { type: "Point"; coordinates: [number, number] };
export type GeoJsonLineString = { type: "LineString"; coordinates: [number, number][] };
// PostGIS geography sütunlarına yazarken WKT metni (örn. "POINT(lng lat)",
// "LINESTRING(lng1 lat1, lng2 lat2)") gönderiyoruz — tip örtük olarak cast
// ediyor. Okurken PostgREST bunu otomatik GeoJSON'a çevirip döndürüyor.
export type WktGeography = string;

export type PoiType =
  | "gas_station"
  | "motorcycle_friendly_cafe"
  | "dangerous_curve"
  | "gravel_road"
  | "rest_stop"
  | "scenic_viewpoint"
  | "repair_shop";

export type VoteValue = "up" | "down";
export type GroupRideStatus = "upcoming" | "active" | "completed" | "cancelled";
export type ParticipantStatus = "requested" | "approved" | "rejected" | "left";
export type ReportContentType =
  | "poi"
  | "route"
  | "forum_question"
  | "forum_answer"
  | "group_ride_message"
  | "user_profile";
export type ReportStatus = "pending" | "reviewed" | "actioned" | "dismissed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          bike_model: string | null;
          is_banned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          bike_model?: string | null;
        };
        Update: Partial<{
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          bike_model: string | null;
        }>;
        Relationships: [];
      };
      routes: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          description: string | null;
          // PostgREST bu sütunu EWKB hex metni olarak döndürür (GeoJSON
          // DEĞİL) — haritada göstermek için path_geojson kullanın.
          path: string;
          path_geojson: GeoJsonLineString | null;
          distance_km: number | null;
          estimated_duration_min: number | null;
          region: string | null;
          avg_curve_quality: number;
          avg_road_surface: number;
          avg_scenery: number;
          avg_traffic: number;
          rating_count: number;
          view_count: number;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          creator_id: string;
          title: string;
          description?: string | null;
          path: WktGeography;
          distance_km?: number | null;
          estimated_duration_min?: number | null;
          region?: string | null;
        };
        Update: Partial<{
          title: string;
          description: string | null;
          distance_km: number | null;
          estimated_duration_min: number | null;
          region: string | null;
        }>;
        Relationships: [];
      };
      route_ratings: {
        Row: {
          id: string;
          route_id: string;
          user_id: string;
          curve_quality: number;
          road_surface: number;
          scenery: number;
          traffic: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          route_id: string;
          user_id: string;
          curve_quality: number;
          road_surface: number;
          scenery: number;
          traffic: number;
          comment?: string | null;
        };
        Update: Partial<{
          curve_quality: number;
          road_surface: number;
          scenery: number;
          traffic: number;
          comment: string | null;
        }>;
        Relationships: [];
      };
      recorded_rides: {
        Row: {
          id: string;
          user_id: string;
          route_id: string | null;
          // PostgREST bu sütunu EWKB hex metni olarak döndürür — haritada
          // göstermek için track_geojson kullanın.
          track: string | null;
          track_geojson: GeoJsonLineString | null;
          distance_km: number | null;
          duration_seconds: number | null;
          avg_speed_kmh: number | null;
          max_speed_kmh: number | null;
          started_at: string;
          ended_at: string | null;
          is_shared: boolean;
          gpx_storage_path: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          route_id?: string | null;
          track?: WktGeography | null;
          distance_km?: number | null;
          duration_seconds?: number | null;
          avg_speed_kmh?: number | null;
          max_speed_kmh?: number | null;
          started_at: string;
          ended_at?: string | null;
          is_shared?: boolean;
          gpx_storage_path?: string | null;
        };
        Update: Partial<{
          is_shared: boolean;
          ended_at: string | null;
          route_id: string | null;
          gpx_storage_path: string | null;
        }>;
        Relationships: [];
      };
      pois: {
        Row: {
          id: string;
          creator_id: string;
          type: PoiType;
          // PostgREST bu sütunu EWKB hex metni olarak döndürür — haritada
          // göstermek için location_geojson kullanın.
          location: string;
          location_geojson: GeoJsonPoint | null;
          title: string;
          description: string | null;
          upvotes: number;
          downvotes: number;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          creator_id: string;
          type: PoiType;
          location: WktGeography;
          title: string;
          description?: string | null;
        };
        Update: Partial<{
          type: PoiType;
          title: string;
          description: string | null;
        }>;
        Relationships: [];
      };
      poi_votes: {
        Row: {
          id: string;
          poi_id: string;
          user_id: string;
          vote: VoteValue;
          created_at: string;
        };
        Insert: {
          poi_id: string;
          user_id: string;
          vote: VoteValue;
        };
        Update: Partial<{ vote: VoteValue }>;
        Relationships: [];
      };
      group_rides: {
        Row: {
          id: string;
          creator_id: string;
          route_id: string | null;
          title: string;
          description: string | null;
          // PostgREST bu sütunu EWKB hex metni olarak döndürür — haritada
          // göstermek için start_point_geojson kullanın.
          start_point: string | null;
          start_point_geojson: GeoJsonPoint | null;
          start_address: string | null;
          scheduled_at: string;
          max_participants: number | null;
          status: GroupRideStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          creator_id: string;
          route_id?: string | null;
          title: string;
          description?: string | null;
          start_point?: WktGeography | null;
          start_address?: string | null;
          scheduled_at: string;
          max_participants?: number | null;
        };
        Update: Partial<{
          title: string;
          description: string | null;
          scheduled_at: string;
          max_participants: number | null;
          status: GroupRideStatus;
        }>;
        Relationships: [];
      };
      group_ride_participants: {
        Row: {
          id: string;
          ride_id: string;
          user_id: string;
          status: ParticipantStatus;
          requested_at: string;
          responded_at: string | null;
        };
        Insert: {
          ride_id: string;
          user_id: string;
          status?: ParticipantStatus;
        };
        Update: Partial<{
          status: ParticipantStatus;
          responded_at: string | null;
        }>;
        Relationships: [];
      };
      group_ride_messages: {
        Row: {
          id: string;
          ride_id: string;
          user_id: string;
          message: string;
          is_hidden: boolean;
          created_at: string;
        };
        Insert: {
          ride_id: string;
          user_id: string;
          message: string;
        };
        Update: Partial<{ is_hidden: boolean }>;
        Relationships: [];
      };
      live_locations: {
        Row: {
          id: string;
          ride_id: string;
          user_id: string;
          // PostgREST bu sütunu EWKB hex metni olarak döndürür — haritada
          // göstermek için location_geojson kullanın.
          location: string;
          location_geojson: GeoJsonPoint | null;
          heading: number | null;
          speed_kmh: number | null;
          updated_at: string;
        };
        Insert: {
          ride_id: string;
          user_id: string;
          location: WktGeography;
          heading?: number | null;
          speed_kmh?: number | null;
        };
        Update: Partial<{
          location: WktGeography;
          heading: number | null;
          speed_kmh: number | null;
        }>;
        Relationships: [];
      };
      forum_questions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          bike_model_tag: string | null;
          tags: string[];
          best_answer_id: string | null;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          title: string;
          body: string;
          bike_model_tag?: string | null;
          tags?: string[];
        };
        Update: Partial<{
          title: string;
          body: string;
          bike_model_tag: string | null;
          tags: string[];
          best_answer_id: string | null;
        }>;
        Relationships: [];
      };
      forum_answers: {
        Row: {
          id: string;
          question_id: string;
          user_id: string;
          body: string;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          question_id: string;
          user_id: string;
          body: string;
        };
        Update: Partial<{ body: string; is_hidden: boolean }>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          content_type: ReportContentType;
          content_id: string;
          reason: string;
          details: string | null;
          status: ReportStatus;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          reporter_id: string;
          content_type: ReportContentType;
          content_id: string;
          reason: string;
          details?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      blocks: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      nearby_routes: {
        Args: {
          user_lng: number;
          user_lat: number;
          radius_meters?: number;
        };
        Returns: Database["public"]["Tables"]["routes"]["Row"][];
      };
      increment_route_view_count: {
        Args: { p_route_id: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
