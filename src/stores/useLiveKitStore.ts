import type { Room as LiveKitRoom } from "livekit-client";
import { create } from 'zustand';

import type { RoomAndName } from '@/apis/entities';
import { Room } from '@/LiveKitRoomSingleton';

type LiveKitStore = {
    room: LiveKitRoom;
    roomNameAndUsername: RoomAndName | null;
    setRoomNameAndUsername: (roomNameAndUsername: RoomAndName | null) => void;
};

export const useLiveKitStore = create<LiveKitStore>((set) => ({
    room: Room.getInstance(),
    roomNameAndUsername: null,
    setRoomNameAndUsername: (roomNameAndUsername) => set({ roomNameAndUsername }),
}));
