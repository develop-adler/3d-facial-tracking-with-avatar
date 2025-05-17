"use client";

import dynamic from "next/dynamic";
import { useEffect, type FC } from "react";

import { RoomAudioRenderer } from "@livekit/components-react";

import { FlexBox } from "./styles";

import RoomManager from "@/3d/multiplayer/RoomManager";
import SpatialAudioController from "@/components/LiveKit/SpatialAudioController";
import AvatarLoadingToast from "@/components/LiveKit/RoomPage/components/AvatarLoadingToast";
import { CustomControlBar } from "@/components/LiveKit/RoomPage/components/CustomControlBar";
import LeftMenu from "@/components/LiveKit/RoomPage/components/LeftMenu";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";

import { clientSettings } from "clientSettings";
import { ToastContainer } from "react-toastify";
import BackgroundModal from "./components/BackgroundModal";
import Modals from "@/components/Modals";

const AvatarScene = dynamic(
    () => import("@/components/AvatarScene").then((p) => p.AvatarScene),
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

type Props = {
    roomName: string;
    name: string;
};

export const RoomPage: FC<Props> = ({ roomName, name }) => {
    const room = useLiveKitStore((state) => state.room);
    const isMultiplayer = useLiveKitStore((state) => state.isMultiplayer);
    const setRoomNameAndUsername = useLiveKitStore(
        (state) => state.setRoomNameAndUsername
    );
    const openChangeBackgroundModal = useLiveKitStore(
        (state) => state.openChangeBackgroundModal
    );

    useEffect(() => {
        (async () => {
            try {
                const resp = await fetch(
                    `/api/token?room=${roomName}&username=${name}`
                );
                const data = await resp.json();
                if (data.token && clientSettings.LIVEKIT_URL) {
                    await room.connect(clientSettings.LIVEKIT_URL, data.token);
                }
            } catch (error) {
                setRoomNameAndUsername();
                console.error(error);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room]);

    useEffect(() => {
        useTrackingStore.getState().faceTracker.setIsMultiplayer(!!isMultiplayer);
    }, [isMultiplayer]);

    useEffect(() => {
        const roomManager = new RoomManager(room);
        return () => {
            roomManager.dispose();
            useTrackingStore.getState().faceTracker.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <ToastContainer />
            <AvatarLoadingToast />

            <LeftMenu />
            {openChangeBackgroundModal && <BackgroundModal />}

            <Modals />

            {!isMultiplayer && (
                <>
                    {/* This takes care of room-wide audio */}
                    <RoomAudioRenderer />
                    <AvatarScene />
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
        </>
    );
};
