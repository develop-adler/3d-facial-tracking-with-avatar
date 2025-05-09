"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, type FC } from "react";
import { ConnectionState, Track } from "livekit-client";

import {
    RoomAudioRenderer,
    useLocalParticipant,
} from "@livekit/components-react";

import { CustomControlBar } from "@/components/LiveKit/RoomPage/components/CustomControlBar";
import SpatialAudioController from "@/components/LiveKit/SpatialAudioController";

import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";

import { clientSettings } from "clientSettings";
import { mediaStreamFrom3DCanvas } from "global";

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
    const setIsMultiplayer = useLiveKitStore((state) => state.setIsMultiplayer);
    const setRoomNameAndUsername = useLiveKitStore(
        (state) => state.setRoomNameAndUsername
    );

    const { cameraTrack } = useLocalParticipant({ room });
    const hasAvatarTrack = useMemo(
        () => cameraTrack?.trackName === "avatar_video",
        [cameraTrack]
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
        useTrackingStore.getState().faceTracker?.setIsMultiplayer(isMultiplayer);
    }, [isMultiplayer]);

    // Publish 3D babylon.js canvas as camera stream
    useEffect(() => {
        if (isMultiplayer || hasAvatarTrack) return;

        let isMounted = true;

        const handleTrack = async () => {
            if (!mediaStreamFrom3DCanvas) return;
            const track = mediaStreamFrom3DCanvas.getVideoTracks()[0];
            const publishedTrack = await room.localParticipant.publishTrack(track, {
                name: "avatar_video",
                source: Track.Source.Camera,
            });
            if (!isMounted) {
                publishedTrack.track?.stop();
                room.localParticipant.unpublishTrack(track);
            }
            return publishedTrack;
        };

        const connectAndPublish = async () => {
            if (room.state === ConnectionState.Connected) {
                await handleTrack();
            } else {
                room.once("connected", handleTrack);
            }
        };

        connectAndPublish();

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraTrack]);

    // useEffect(() => {
    //     return () => useTrackingStore.getState().faceTracker.dispose();
    // }, []);

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
                    <MainConferenceBody />
                )}

                {/* Controls for user (need to always be at the bottom) */}
                <CustomControlBar />
            </div>
        </>
    );
};
