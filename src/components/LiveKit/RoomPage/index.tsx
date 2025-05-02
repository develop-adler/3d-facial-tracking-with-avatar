"use client";

import { useEffect, useState, type FC } from "react";

import {
    ControlBar,
    RoomAudioRenderer,
    RoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Room } from "livekit-client";

import { MyVideoConference } from "@/components/LiveKit/MyVideoConference";

import { clientSettings } from "clientSettings";

export const RoomPage: FC = () => {
    // TODO: get user input for room and name
    const room = "test-room";
    const name = "gavin";
    const [roomInstance] = useState(
        () =>
            new Room({
                // Optimize video quality for each participant's screen
                adaptiveStream: true,
                // Enable automatic audio/video quality optimization
                dynacast: true,
            })
    );

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
            } catch (e) {
                console.error(e);
            }
        })();

        return () => {
            mounted = false;
            roomInstance.disconnect();
        };
    }, [roomInstance]);

    return (
        <RoomContext.Provider value={roomInstance}>
            <div data-lk-theme="default" style={{ height: "100dvh" }}>
                {/* Your custom component with basic video conferencing functionality. */}
                <MyVideoConference />
                {/* The RoomAudioRenderer takes care of room-wide audio for you. */}
                <RoomAudioRenderer />
                {/* Controls for the user to start/stop audio, video, and screen share tracks */}
                <ControlBar />
            </div>
        </RoomContext.Provider>
    );
};
