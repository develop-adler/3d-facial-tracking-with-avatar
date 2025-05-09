import { create } from "zustand";
import { persist } from "zustand/middleware";

import type Avatar from "@/3d/avatar/Avatar";
import type { AvatarAudioData, RemoteAvatarAudioData } from "@/models/multiplayer";

type AvatarStore = {
  avatarId?: string;
  avatar?: Avatar;
  avatarAudioPosition: AvatarAudioData;
  remoteAvatarAudioPositions: RemoteAvatarAudioData[];
  setAvatar: (avatar: Avatar) => void;
  setAvatarId: (avatarId: string) => void;
  setAvatarAudioPosition: (avatarAudioPosition: AvatarAudioData) => void;
  setRemoteAvatarAudioPositions: (remoteAvatarAudioPositions: RemoteAvatarAudioData[]) => void;
};

export const useAvatarStore = create<AvatarStore>()(
  persist(
    (set) => ({
      avatarId: undefined,
      avatar: undefined,
      avatarAudioPosition: {
        position: [0, 0, 0],
        // rotation: [0, 0, 0, 1],
        // forward: [0, 0, -1],
        cameraPosition: [0, 0, 0],
        cameraRotation: [0, 0, 0],
      },
      remoteAvatarAudioPositions: [],
      setAvatar: (avatar) => set({ avatar }),
      setAvatarId: (avatarId) => set({ avatarId }),
      setAvatarAudioPosition: (avatarAudioPosition) => set({ avatarAudioPosition }),
      setRemoteAvatarAudioPositions: (remoteAvatarAudioPositions) => set({ remoteAvatarAudioPositions }),
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
