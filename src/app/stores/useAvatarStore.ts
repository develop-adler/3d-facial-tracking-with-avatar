import { create } from 'zustand';

import type { AvatarType } from '@/app/3d/Avatar';

type AvatarStore = {
  avatar: AvatarType | null;
  setAvatar: (avatar: AvatarType | null) => void;
};

export const useAvatarStore = create<AvatarStore>((set) => ({
  avatar: null,
  setAvatar: (avatar) => set({ avatar }),
}));
