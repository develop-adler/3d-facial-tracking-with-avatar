import { create } from 'zustand';

import type { RoomAndName } from '@/api/entities';

type LiveKitStore = {
    roomAndName: RoomAndName | null;
    setRoomAndName: (roomAndName: RoomAndName | null) => void;
};

export const useLiveKitStore = create<LiveKitStore>((set) => ({
    roomAndName: null,
    setRoomAndName: (roomAndName) => set({ roomAndName }),
}));
