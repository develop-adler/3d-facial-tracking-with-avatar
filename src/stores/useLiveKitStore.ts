import type { Room as LiveKitRoom } from "livekit-client";
import { create } from 'zustand';

import { Room } from '@/LiveKitRoomSingleton';
import type { RoomAndName, SpaceType } from '@/models/multiplayer';

type OpenJoinSpaceModal = {
    identity: string;
    spaceType: SpaceType;
};

type LiveKitStore = {
    room: LiveKitRoom;
    roomNameAndUsername?: RoomAndName;
    isMultiplayer?: string;
    openJoinSpaceModal?: OpenJoinSpaceModal;
    setRoomNameAndUsername: (roomNameAndUsername?: RoomAndName) => void;
    setIsMultiplayer: (isMultiplayer?: string) => void;
    setOpenJoinSpaceModal: (openJoinSpaceModal?: OpenJoinSpaceModal) => void;
};

export const useLiveKitStore = create<LiveKitStore>((set, get) => ({
    room: Room.getInstance(),
    roomNameAndUsername: undefined,
    isMultiplayer: undefined,
    openJoinSpaceModal: undefined,
    setRoomNameAndUsername: (roomNameAndUsername) => set({ roomNameAndUsername }),
    setIsMultiplayer: (isMultiplayer) => {
        const { room } = get();
        room.localParticipant.setAttributes({
            'inSpace': JSON.stringify(isMultiplayer),
        });
        set({ isMultiplayer });
    },
    setOpenJoinSpaceModal: (openJoinSpaceModal) => set({ openJoinSpaceModal }),
}));
