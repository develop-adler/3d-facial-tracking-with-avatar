"use client";

import { useEffect, useState, type FC } from "react";

import {
    RoomAudioRenderer,
    RoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Room } from "livekit-client";

import { VirtualAvatarVideo } from "@/components/VirtualAvatarVideo";
import { CanvasPublisher } from "@/components/LiveKit/RoomPage/components/CanvasPublisher";
import { CustomControlBar } from "@/components/LiveKit/RoomPage/components/CustomControlBar";
import { MainConferenceBody } from "@/components/LiveKit/RoomPage/components/MainConferenceBody";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";

type Props = {
    room: string;
    name: string;
};

export const RoomPage: FC<Props> = ({ room, name }) => {
    const [roomInstance] = useState(
        () =>
            new Room({
                // Optimize video quality for each participant's screen
                adaptiveStream: true,
                // Enable automatic audio/video quality optimization
                dynacast: true,
            })
    );

    const setRoomAndName = useLiveKitStore((state) => state.setRoomAndName);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const resp = await fetch(`/api/token?room=${room}&username=${name}`);
                const data = await resp.json();
                if (!mounted) return;
                if (data.token && clientSettings.LIVEKIT_URL) {
                    await roomInstance.connect(clientSettings.LIVEKIT_URL, data.token);
                }
                roomInstance.on("disconnected", () => {
                    setRoomAndName(null);
                });
            } catch (e) {
                setRoomAndName(null);
                console.error(e);
            }
        })();

        return () => {
            mounted = false;
            roomInstance.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomInstance]);

    return (
        <>
            <RoomContext.Provider value={roomInstance}>
                {/* To publish 3D babylon.js canvas as camera stream */}
                <CanvasPublisher room={roomInstance} />

                <div data-lk-theme="default">
                    {/* This one contains layout of participants and chat window */}
                    <MainConferenceBody />
                    {/* The RoomAudioRenderer takes care of room-wide audio for you. */}
                    <RoomAudioRenderer />
                    {/* Controls for user */}
                    <CustomControlBar />
                </div>
            </RoomContext.Provider>

            {/* Run the 3D avatar scene with facial tracking */}
            <VirtualAvatarVideo />
        </>
    );
};
