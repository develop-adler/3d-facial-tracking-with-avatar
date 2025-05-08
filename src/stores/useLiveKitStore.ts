import type { Room as LiveKitRoom } from "livekit-client";
import { create } from 'zustand';

import { Room } from '@/LiveKitRoomSingleton';
import type { RoomAndName } from '@/models/multiplayer';

type LiveKitStore = {
    room: LiveKitRoom;
    roomNameAndUsername?: RoomAndName;
    isMultiplayer: boolean;
    setRoomNameAndUsername: (roomNameAndUsername?: RoomAndName) => void;
    setIsMultiplayer: (isMultiplayer: boolean) => void;
};

export const useLiveKitStore = create<LiveKitStore>((set) => ({
    room: Room.getInstance(),
    isMultiplayer: false,
    setRoomNameAndUsername: (roomNameAndUsername) => set({ roomNameAndUsername }),
    setIsMultiplayer: (isMultiplayer) => set({ isMultiplayer }),
}));
