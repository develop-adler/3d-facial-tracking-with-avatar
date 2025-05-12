import { create } from "zustand";
import { persist } from "zustand/middleware";

import type Avatar from "@/3d/avatar/Avatar";
import type { AvatarGender } from "@/models/3d";
import type { AvatarAudioData, RemoteAvatarAudioData } from "@/models/multiplayer";

type AvatarStore = {
  avatarId?: string;
  avatar?: Avatar;
  gender?: string;
  avatarAudioPosition: AvatarAudioData;
  remoteAvatarAudioPositions: RemoteAvatarAudioData[];
  setAvatar: (avatar: Avatar) => void;
  setAvatarId: (avatarId: string, gender: AvatarGender) => void;
  setAvatarAudioPosition: (avatarAudioPosition: AvatarAudioData) => void;
  setRemoteAvatarAudioPositions: (remoteAvatarAudioPositions: RemoteAvatarAudioData[]) => void;
};

export const useAvatarStore = create<AvatarStore>()(
  persist(
    (set) => ({
      avatarId: undefined,
      avatar: undefined,
      gender: undefined,
      avatarAudioPosition: {
        position: [0, 0, 0],
        // rotation: [0, 0, 0, 1],
        // forward: [0, 0, -1],
        cameraPosition: [0, 0, 0],
        cameraRotation: [0, 0, 0],
      },
      remoteAvatarAudioPositions: [],
      setAvatar: (avatar) => set({ avatar }),
      setAvatarId: (avatarId, gender) => set({ avatarId, gender }),
      setAvatarAudioPosition: (avatarAudioPosition) => set({ avatarAudioPosition }),
      setRemoteAvatarAudioPositions: (remoteAvatarAudioPositions) => set({ remoteAvatarAudioPositions }),
    }),
    {
      name: "avatar",
      version: 0.1,
      partialize: (state: AvatarStore) => ({
        avatarId: state.avatarId,
        gender: state.gender,
      }),
    }
  )
);
