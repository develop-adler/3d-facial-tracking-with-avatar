import { create } from 'zustand';

import LiveKitRoom from '@/LiveKitRoomSingleton';
import type { RoomAndName, SpaceType } from '@/models/multiplayer';
import type { Room } from 'livekit-client';

type OpenJoinSpaceModal = {
    identity: string;
    spaceType: SpaceType;
};

type LiveKitStore = {
    liveKitRoom: LiveKitRoom;
    room: Room;
    roomNameAndUsername?: RoomAndName;
    isMultiplayer?: string;
    openJoinSpaceModal?: OpenJoinSpaceModal;
    setRoomNameAndUsername: (roomNameAndUsername?: RoomAndName) => void;
    setIsMultiplayer: (isMultiplayer?: string) => void;
    setOpenJoinSpaceModal: (openJoinSpaceModal?: OpenJoinSpaceModal) => void;
};

export const useLiveKitStore = create<LiveKitStore>((set, get) => ({
    liveKitRoom: LiveKitRoom.getInstance(),
    room: LiveKitRoom.getInstance().room,
    roomNameAndUsername: undefined,
    isMultiplayer: undefined,
    openJoinSpaceModal: undefined,
    setRoomNameAndUsername: (roomNameAndUsername) => set({ roomNameAndUsername }),
    setIsMultiplayer: (isMultiplayer) => {
        const { liveKitRoom } = get();
        liveKitRoom.room.localParticipant.setAttributes({
            'inSpace': JSON.stringify(isMultiplayer),
        });
        set({ isMultiplayer });
    },
    setOpenJoinSpaceModal: (openJoinSpaceModal) => set({ openJoinSpaceModal }),
}));
