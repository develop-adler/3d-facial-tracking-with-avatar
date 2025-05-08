import { create } from "zustand";
import { persist } from "zustand/middleware";

import type Avatar from "@/3d/avatar/Avatar";

type AvatarStore = {
  avatarId?: string;
  avatar?: Avatar;
  setAvatar: (avatar: Avatar) => void;
  setAvatarId: (avatarId: string) => void;
};

export const useAvatarStore = create<AvatarStore>()(
  persist(
    (set) => ({
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
