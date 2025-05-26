"use client";

import dynamic from "next/dynamic";
import { useEffect, type FC } from "react";

import DOMPurify from 'dompurify';

import { JoinRoomModal } from "@/components/LiveKit/JoinRoomModal";
import type { RoomAndName } from "@/models/multiplayer";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";

const RoomPage = dynamic(
    () => import("@/components/LiveKit/RoomPage").then((p) => p.RoomPage),
    {
        ssr: false,
    }
);

export const LiveKitPage: FC = () => {
    const roomNameAndUsername = useLiveKitStore((state) => state.roomNameAndUsername);
    const setRoomNameAndUsername = useLiveKitStore((state) => state.setRoomNameAndUsername);

    const handleFormSubmit = (data: RoomAndName) => {
        data.room = DOMPurify.sanitize(data.room);
        data.name = DOMPurify.sanitize(data.name);
        setRoomNameAndUsername(data);
    };

    useEffect(() => {
        useLiveKitStore.getState().room.disconnect();
        setRoomNameAndUsername();
        return () => {
            useTrackingStore.getState().faceTracker.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <JoinRoomModal open={!roomNameAndUsername} onSubmit={handleFormSubmit} />
            {roomNameAndUsername && (
                <RoomPage roomName={roomNameAndUsername.room} name={roomNameAndUsername.name} />
            )}
        </>
    );
};
