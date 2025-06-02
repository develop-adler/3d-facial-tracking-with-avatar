import type { Room } from "livekit-client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type MultiplayerManager from "@/3d/multiplayer/MultiplayerManager";
import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import type { RoomJoinInfo, RequestOrigin } from "@/models/multiplayer";
import LiveKitRoom from "@/LiveKitRoomSingleton";

type OpenJoinSpaceModal = {
    identity: string;
    origin: RequestOrigin;
};

type LiveKitStore = {
    liveKitRoom: LiveKitRoom;
    room: Room;
    roomJoinInfo?: RoomJoinInfo;
    multiplayerManager?: MultiplayerManager;
    spaceBuilder?: SpaceBuilder;
    isMultiplayer: boolean;
    isBuildSpaceMode: boolean;
    openJoinSpaceModal?: OpenJoinSpaceModal;
    openBuildSpaceModal?: OpenJoinSpaceModal;
    skyboxEnabled: boolean;
    skyboxIntensity: number;
    skyboxId: string;
    openChangeBackgroundModal: boolean;
    setNewRoom(room: Room): void;
    setRoomJoinInfo: (roomJoinInfo?: RoomJoinInfo) => void;
    setIsMultiplayer: (isMultiplayer: boolean) => void;
    setIsBuildSpaceMode: (isBuildSpaceMode: boolean) => void;
    setOpenJoinSpaceModal: (openJoinSpaceModal?: OpenJoinSpaceModal) => void;
    setOpenBuildSpaceModal: (openBuildSpaceModal?: OpenJoinSpaceModal) => void;
    setMultiplayerManager: (multiplayerManager?: MultiplayerManager) => void;
    setSpaceBuilder: (spaceBuilder?: SpaceBuilder) => void;
    setSkyboxEnabled: (skyboxEnabled: boolean) => void;
    setSkyboxId: (skyboxId: string) => void;
    setSkyboxIntensity: (skyboxIntensity: number) => void;
    setCurrentSkybox: (skyboxId: string) => void;
    toggleChangeBackgroundModal: (force?: boolean) => void;
};

export const useLiveKitStore = create<LiveKitStore>()(
    persist(
        (set, get) => ({
            liveKitRoom: LiveKitRoom.getInstance(),
            room: LiveKitRoom.getInstance().room,
            roomJoinInfo: undefined,
            isMultiplayer: false,
            isBuildSpaceMode: false,
            openJoinSpaceModal: undefined,
            openBuildSpaceModal: undefined,
            skyboxEnabled: false,
            skyboxIntensity: 0.8,
            skyboxId: "585760691093336303",
            openChangeBackgroundModal: false,
            setNewRoom: (room) => {
                const { liveKitRoom } = get();
                liveKitRoom.setRoom(room);
                set({ liveKitRoom, room });
            },
            setRoomJoinInfo: (roomJoinInfo) =>
                set({ roomJoinInfo }),
            setIsMultiplayer: (isMultiplayer) => {
                const { liveKitRoom, multiplayerManager } = get();
                try {
                    liveKitRoom.room.localParticipant.setAttributes({
                        isInSpace: isMultiplayer ? "true" : "false",
                    });
                } catch {
                    // empty
                }

                if (isMultiplayer) {
                    set({ isMultiplayer });
                } else {
                    multiplayerManager?.dispose();
                    set({ isMultiplayer, multiplayerManager: undefined });
                }
            },
            setIsBuildSpaceMode: (isBuildSpaceMode) => {
                const { liveKitRoom, isMultiplayer, spaceBuilder } = get();
                // ensure that we are already in multiplayer mode
                if (isMultiplayer) {
                    try {
                        liveKitRoom.room.localParticipant.setAttributes({
                            isBuildingSpace: isBuildSpaceMode ? "true" : "false",
                        });
                    } catch {
                        // empty
                    }
                    set({ isBuildSpaceMode });
                } else {
                    // always set to false if not in multiplayer mode
                    try {
                        liveKitRoom.room.localParticipant.setAttributes({
                            isBuildingSpace: "false",
                        });
                    } catch {
                        // empty
                    }
                    spaceBuilder?.dispose();
                    set({ isBuildSpaceMode: false, spaceBuilder: undefined });
                }
            },
            setOpenJoinSpaceModal: (openJoinSpaceModal) =>
                set({ openJoinSpaceModal }),
            setOpenBuildSpaceModal: (openBuildSpaceModal) =>
                set({ openBuildSpaceModal }),
            setMultiplayerManager: (multiplayerManager) =>
                set({ multiplayerManager }),
            setSpaceBuilder: (spaceBuilder) => set({ spaceBuilder }),
            setSkyboxEnabled: (skyboxEnabled) => set({ skyboxEnabled }),
            setSkyboxId: (skyboxId) => set({ skyboxId }),
            setSkyboxIntensity: (skyboxIntensity) => set({ skyboxIntensity }),
            setCurrentSkybox: (skyboxId) => set({ skyboxId }),
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
                skyboxId: state.skyboxId,
                skyboxIntensity: state.skyboxIntensity,
            }),
        }
    )
);
