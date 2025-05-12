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
    isMultiplayer: boolean;
    openJoinSpaceModal?: OpenJoinSpaceModal;
    setRoomNameAndUsername: (roomNameAndUsername?: RoomAndName) => void;
    setIsMultiplayer: (isMultiplayer: boolean) => void;
    setOpenJoinSpaceModal: (openJoinSpaceModal?: OpenJoinSpaceModal) => void;
};

export const useLiveKitStore = create<LiveKitStore>((set, get) => ({
    liveKitRoom: LiveKitRoom.getInstance(),
    room: LiveKitRoom.getInstance().room,
    roomNameAndUsername: undefined,
    isMultiplayer: false,
    openJoinSpaceModal: undefined,
    setRoomNameAndUsername: (roomNameAndUsername) => set({ roomNameAndUsername }),
    setIsMultiplayer: (isMultiplayer) => {
        const { liveKitRoom } = get();
        try {
            liveKitRoom.room.localParticipant.setAttributes({
                isInSpace: isMultiplayer ? "true" : "false",
            });
        } catch {
            // empty
        }
        set({ isMultiplayer });
    },
    setOpenJoinSpaceModal: (openJoinSpaceModal) => set({ openJoinSpaceModal }),
}));
