"use client";

import { useEffect, type FC } from "react";

import { RoomAudioRenderer } from "@livekit/components-react";

import { VirtualAvatarVideo } from "@/components/VirtualAvatarVideo";
import { CanvasPublisher } from "@/components/LiveKit/RoomPage/components/CanvasPublisher";
import { CustomControlBar } from "@/components/LiveKit/RoomPage/components/CustomControlBar";
import { MainConferenceBody } from "@/components/LiveKit/RoomPage/components/MainConferenceBody";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";
import { useRouter } from "next/navigation";

type Props = {
    roomName: string;
    name: string;
};

export const RoomPage: FC<Props> = ({ roomName, name }) => {
    const router = useRouter();

    const room = useLiveKitStore((state) => state.room);
    const setRoomNameAndUsername = useLiveKitStore(
        (state) => state.setRoomNameAndUsername
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

        // only disconnect when user navigates away from the /room/* page
        // return () => {
        //     room.disconnect();
        //     setRoomNameAndUsername(null);
        // };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room]);

    return (
        <>
            <button
                onClick={() => {
                    router.push("/room/space");
                }}
                style={{
                    position: "absolute",
                    top: '10%',
                    left: '10%',
                    fontSize: '3rem',
                    zIndex: 1000,
                }}
            >
                Go to 3D Space
            </button>
            {/* To publish 3D babylon.js canvas as camera stream */}
            <CanvasPublisher room={room} />

            <div data-lk-theme="default">
                {/* This one contains layout of participants and chat window */}
                <MainConferenceBody />
                {/* The RoomAudioRenderer takes care of room-wide audio for you. */}
                <RoomAudioRenderer />
                {/* Controls for user */}
                <CustomControlBar />
            </div>

            {/* Run the 3D avatar scene with facial tracking */}
            <VirtualAvatarVideo />
        </>
    );
};
