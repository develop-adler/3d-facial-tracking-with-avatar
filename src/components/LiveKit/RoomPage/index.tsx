"use client";

import dynamic from "next/dynamic";
import { useEffect, type FC } from "react";

import { RoomAudioRenderer } from "@livekit/components-react";

import { AvatarFacialTracking } from "@/components/AvatarFacialTracking";
import { CanvasPublisher } from "@/components/LiveKit/RoomPage/components/CanvasPublisher";
import { CustomControlBar } from "@/components/LiveKit/RoomPage/components/CustomControlBar";

import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";

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
const MainConferenceBody = dynamic(
    () =>
        import("@/components/LiveKit/RoomPage/components/MainConferenceBody").then(
            (p) => p.MainConferenceBody
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
    const setIsMultiplayer = useLiveKitStore((state) => state.setIsMultiplayer);

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

    return (
        <>
            <button
                onClick={() => {
                    setIsMultiplayer(true);
                }}
                style={{
                    position: "absolute",
                    top: "5%",
                    left: "10%",
                    fontSize: "3rem",
                    zIndex: 1000,
                }}
            >
                Enter 3D space
            </button>
            <button
                onClick={() => {
                    setIsMultiplayer(false);
                }}
                style={{
                    position: "absolute",
                    top: "12%",
                    left: "10%",
                    fontSize: "3rem",
                    zIndex: 1000,
                }}
            >
                Leave 3D space
            </button>

            {/* The RoomAudioRenderer takes care of room-wide audio */}
            <RoomAudioRenderer />

            {/* For 3D facial tracking */}
            <AvatarFacialTracking isMultiplayer={isMultiplayer} />

            {/* To publish 3D babylon.js canvas as camera stream */}
            <CanvasPublisher room={room} />

            {/* Run the 3D avatar scene for video chat */}
            {!isMultiplayer && <AvatarScene />}

            {/* LiveKit container to handle Livekit UI elements */}
            <div data-lk-theme="default">
                {/* This one contains layout of participants and chat window */}
                {isMultiplayer ? (
                    <>
                        <MultiplayerPage />
                        <ChatContainer />
                    </>
                ) : (
                    <MainConferenceBody />
                )}

                {/* Controls for user (need to always be at the bottom) */}
                <CustomControlBar />
            </div>
        </>
    );
};
