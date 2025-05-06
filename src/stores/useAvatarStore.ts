import { create } from "zustand";

import type { Avatar } from "@/3d/VideoChat/Avatar";
import { persist } from "zustand/middleware";

type AvatarStore = {
  avatarId: string | null;
  avatar: Avatar | null;
  setAvatar: (avatar: Avatar | null) => void;
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
