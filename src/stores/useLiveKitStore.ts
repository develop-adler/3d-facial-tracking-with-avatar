import type { Room } from "livekit-client";
import { create } from "zustand";

import LiveKitRoom from "@/LiveKitRoomSingleton";
import type { RoomAndName, SpaceType } from "@/models/multiplayer";
import { persist } from "zustand/middleware";

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
    skyboxEnabled: boolean;
    openChangeBackgroundModal: boolean;
    setRoomNameAndUsername: (roomNameAndUsername?: RoomAndName) => void;
    setIsMultiplayer: (isMultiplayer: boolean) => void;
    setOpenJoinSpaceModal: (openJoinSpaceModal?: OpenJoinSpaceModal) => void;
    setSkyboxEnabled: (skyboxEnabled: boolean) => void;
    toggleChangeBackgroundModal: (force?: boolean) => void;
};

export const useLiveKitStore = create<LiveKitStore>()(
    persist(
        (set, get) => ({
            liveKitRoom: LiveKitRoom.getInstance(),
            room: LiveKitRoom.getInstance().room,
            roomNameAndUsername: undefined,
            isMultiplayer: false,
            openJoinSpaceModal: undefined,
            skyboxEnabled: false,
            openChangeBackgroundModal: false,
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
            setSkyboxEnabled: (skyboxEnabled) => set({ skyboxEnabled }),
            toggleChangeBackgroundModal: (force) => {
                const { openChangeBackgroundModal } = get();
                set({ openChangeBackgroundModal: force ?? !openChangeBackgroundModal });
            },
        }),
        {
            name: "room",
            version: 0.1,
            partialize: (state: LiveKitStore) => ({
                skyboxEnabled: state.skyboxEnabled,
            }),
        }
    )
);