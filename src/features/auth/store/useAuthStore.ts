import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";

import { deleteAccount as apiDeleteAccount, fetchProfile, signOut as apiSignOut } from "@/features/auth/api/authApi";
import type { Profile } from "@/features/auth/types";
import { supabase } from "@/lib/supabase/client";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  isInitializing: boolean;
  init: () => () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const { message, details, hint, code } = err as {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string;
    };
    if (message) {
      const parts = [message, details, hint, code ? `kod: ${code}` : null].filter(Boolean);
      return parts.join(" — ");
    }
  }
  return String(err);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  profileError: null,
  isInitializing: true,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, isInitializing: false });
      if (data.session) void get().refreshProfile();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isInitializing: false });
      if (session) {
        void get().refreshProfile();
      } else {
        set({ profile: null });
      }
    });

    return () => subscription.unsubscribe();
  },

  refreshProfile: async () => {
    const { session } = get();
    if (!session) return;
    set({ profileError: null });
    try {
      const profile = await fetchProfile(session.user.id);
      set({ profile, profileError: null });
    } catch (err) {
      const message = describeError(err);
      console.error("[useAuthStore] Profil çekilemedi (user id:", session.user.id, "):", message, err);
      set({ profileError: message });
    }
  },

  signOut: async () => {
    await apiSignOut();
    set({ session: null, profile: null, profileError: null });
  },

  deleteAccount: async () => {
    await apiDeleteAccount();
    set({ session: null, profile: null, profileError: null });
  },
}));
