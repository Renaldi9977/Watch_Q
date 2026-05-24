import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserProfile {
  name: string;
  avatar: string;
  frameColor: string;
}

interface AppState {
  profile: UserProfile | null;
  theme: "default" | "live" | "anime" | "random";
  setProfile: (profile: UserProfile) => void;
  setTheme: (theme: AppState["theme"]) => void;
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      profile: null,
      theme: "default",
      setProfile: (profile) => set({ profile }),
      setTheme: (theme) => set({ theme }),
      logout: () => set({ profile: null }),
    }),
    {
      name: "watch-party-storage",
      storage: createJSONStorage(() => localStorage),
      // Hanya persist field yang diperlukan — lebih cepat parse dari localStorage
      partialize: (state) => ({ profile: state.profile, theme: state.theme }),
    },
  ),
);
