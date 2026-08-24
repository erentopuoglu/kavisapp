import type { Database } from "@/lib/supabase/types";

export type Block = Database["public"]["Tables"]["blocks"]["Row"];

export type BlockedUser = Block & {
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};
