import { create } from "zustand";

import type { AvatarType } from "@/app/3d/Avatar";
import { persist } from "zustand/middleware";

type AvatarStore = {
  avatarId: string | null;
  avatar: AvatarType | null;
  setAvatar: (avatar: AvatarType | null) => void;
  setAvatarId: (avatarId: string | null) => void;
};

export const useAvatarStore = create<AvatarStore>()(
  persist(
    (set) => ({
      avatarId: null,
      avatar: null,
      setAvatar: (avatar) => set({ avatar }),
      setAvatarId: (avatarId) => set({ avatarId }),
    }),
    {
      name: "avatar",
      version: 0.1,
      partialize: (state: AvatarStore) => ({
        avatarId: state.avatarId,
      }),
    }
  )
);
