"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type FC } from "react";

import { RoomContext } from "@livekit/components-react";
import { DeviceUnsupportedError, Room, RoomEvent } from "livekit-client";
import { toast, ToastContainer } from "react-toastify";

import { FlexBox } from "./styles";

import { DEFAULT_ROOM_OPTIONS } from "@/LiveKitRoomSingleton";
import RoomManager from "@/3d/multiplayer/RoomManager";
import AvatarLoadingToast from "@/components/LiveKit/RoomPage/components/AvatarLoadingToast";
import LeftMenu from "@/components/LiveKit/RoomPage/components/LeftMenu";
import RoomModals from "@/components/LiveKit/RoomModals";
import type { RoomJoinInfo } from "@/models/multiplayer";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";
import useE2EE from "@/utils/useE2EE";

import { clientSettings } from "clientSettings";

const AvatarScene = dynamic(
    () => import("@/components/AvatarScene").then((p) => p.AvatarScene),
    {
        ssr: false,
    }
);
const BackgroundModal = dynamic(
    () => import("@/components/LiveKit/RoomPage/components/BackgroundModal"),
    {
        ssr: false,
    }
);
const ChatContainer = dynamic(
    () =>
        import("@/components/LiveKit/RoomPage/components/ChatContainer").then(
            (p) => p.ChatContainer
        ),
    {
        ssr: false,
    }
);
const CustomControlBar = dynamic(
    () => import("@/components/LiveKit/RoomPage/components/CustomControlBar"),
    {
        ssr: false,
    }
);
const RoomAudioRenderer = dynamic(
    () => import("@livekit/components-react").then((p) => p.RoomAudioRenderer),
    {
        ssr: false,
    }
);
const SpatialAudioController = dynamic(
    () =>
        import("@/components/LiveKit/SpatialAudioController"),
    {
        ssr: false,
    }
);
const MultiplayerPage = dynamic(
    () =>
        import("@/components/LiveKit/RoomPage/components/MultiplayerPage").then(
            (p) => p.MultiplayerPage
        ),
    {
        ssr: false,
    }
);
const VideoConferenceLayout = dynamic(
    () =>
        import(
            "@/components/LiveKit/RoomPage/components/VideoConferenceLayout"
        ).then((p) => p.VideoConferenceLayout),
    {
        ssr: false,
    }
);

const handleError = (error: Error) => {
    if (clientSettings.DEBUG) {
        console.error(error);
        toast.error(
            `Encountered an unexpected error, check the console logs for details: ${error.message}`
        );
    }
};

const handleEncryptionError = (error: Error) => {
    if (clientSettings.DEBUG) {
        console.error(error);
        toast.error(
            `Encountered an unexpected encryption error, check the console logs for details: ${error.message}`
        );
    }
};

type Props = {
    roomJoinInfo: RoomJoinInfo;
};

export const RoomPage: FC<Props> = ({ roomJoinInfo }) => {
    const isMultiplayer = useLiveKitStore((state) => state.isMultiplayer);
    const openChangeBackgroundModal = useLiveKitStore(
        (state) => state.openChangeBackgroundModal
    );

    const [e2eeSetupComplete, setE2eeSetupComplete] = useState<boolean>(false);

    const { keyProvider, worker, e2eePassphrase } = useE2EE(
        roomJoinInfo.passphrase
    );
    const e2eeEnabled = !!(e2eePassphrase && worker);

    const room = useMemo(
        () =>
            new Room({
                ...DEFAULT_ROOM_OPTIONS,
                e2ee: e2eeEnabled ? { keyProvider, worker } : undefined,
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    useEffect(() => {
        if (e2eeEnabled) {
            keyProvider
                .setKey(decodeURIComponent(e2eePassphrase))
                .then(() => {
                    room.setE2EEEnabled(true).catch((error) => {
                        if (error instanceof DeviceUnsupportedError) {
                            toast.error(
                                `You're trying to join an encrypted meeting, but your browser does not support it. Please update it to the latest version and try again.`
                            );
                            if (clientSettings.DEBUG) console.error(error);
                        } else {
                            throw error;
                        }
                    });
                })
                .then(() => setE2eeSetupComplete(true));
        } else {
            setE2eeSetupComplete(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [e2eeEnabled, room, e2eePassphrase]);

    useEffect(() => {
        if (!e2eeSetupComplete) return;

        room.on(RoomEvent.EncryptionError, handleEncryptionError);
        room.on(RoomEvent.MediaDevicesError, handleError);

        (async () => {
            try {
                const resp = await fetch(
                    `/api/token?room=${roomJoinInfo.room}&username=${roomJoinInfo.name}`
                );
                const data = await resp.json();
                if (data.token && clientSettings.LIVEKIT_URL) {
                    await room.connect(clientSettings.LIVEKIT_URL, data.token);
                } else {
                    throw new Error("Invalid token or LiveKit URL");
                }
            } catch (error) {
                useLiveKitStore.getState().setRoomJoinInfo();
                if (clientSettings.DEBUG) console.error(error);
            }
        })();

        return () => {
            room.off(RoomEvent.EncryptionError, handleEncryptionError);
            room.off(RoomEvent.MediaDevicesError, handleError);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, e2eeSetupComplete]);

    useEffect(() => {
        useTrackingStore.getState().faceTracker.setIsMultiplayer(!!isMultiplayer);
    }, [isMultiplayer]);

    useEffect(() => {
        room.on("disconnected", () => {
            // update participant property of avatar
            useAvatarStore.getState().avatar?.setParticipant(useLiveKitStore.getState().room.localParticipant);

            useLiveKitStore.getState().setIsMultiplayer(false);
            useLiveKitStore.getState().setIsBuildSpaceMode(false);
            useLiveKitStore.getState().setRoomJoinInfo();
        });
        useLiveKitStore.getState().setNewRoom(room);

        // update participant property of avatar
        useAvatarStore.getState().avatar?.setParticipant(room.localParticipant);

        const roomManager = new RoomManager(room);
        return () => {
            room.disconnect();
            roomManager.dispose();
            useTrackingStore.getState().faceTracker.dispose();

            useLiveKitStore.getState().setIsMultiplayer(false);
            useLiveKitStore.getState().setIsBuildSpaceMode(false);
            useLiveKitStore.getState().setRoomJoinInfo();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <RoomContext.Provider value={room}>
            <ToastContainer />
            <AvatarLoadingToast />

            <LeftMenu />
            {openChangeBackgroundModal && <BackgroundModal />}

            <RoomModals />

            {!isMultiplayer && (
                <>
                    {/* This takes care of room-wide audio */}
                    <RoomAudioRenderer />
                    {/* For video camera replacement with avatar scene */}
                    <AvatarScene isRoomPage={true} room={room} />
                </>
            )}

            {/* LiveKit container to handle Livekit UI elements */}
            <div data-lk-theme="default">
                {/* This one contains layout of participants and chat window */}
                {isMultiplayer ? (
                    <>
                        <SpatialAudioController />
                        <MultiplayerPage />
                        <ChatContainer />
                    </>
                ) : (
                    <FlexBox>
                        <VideoConferenceLayout />
                        <ChatContainer />
                    </FlexBox>
                )}

                {/* Controls for user (need to always be at the bottom) */}
                <CustomControlBar />
            </div>
        </RoomContext.Provider>
    );
};
