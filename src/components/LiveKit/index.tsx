"use client";

import dynamic from "next/dynamic";
import { useEffect, type FC } from "react";

import DOMPurify from "dompurify";

import { JoinRoomModal } from "@/components/LiveKit/JoinRoomModal";
import type { RoomJoinInfo } from "@/models/multiplayer";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";

const RoomPage = dynamic(
    () => import("@/components/LiveKit/RoomPage").then((p) => p.RoomPage),
    {
        ssr: false,
    }
);

export const LiveKitPage: FC = () => {
    const roomJoinInfo = useLiveKitStore((state) => state.roomJoinInfo);
    const setRoomJoinInfo = useLiveKitStore((state) => state.setRoomJoinInfo);

    const handleFormSubmit = (data: RoomJoinInfo) => {
        data.room = DOMPurify.sanitize(data.room);
        data.name = DOMPurify.sanitize(data.name);
        data.passphrase = DOMPurify.sanitize(data.passphrase);
        setRoomJoinInfo(data);
    };

    useEffect(() => {
        setRoomJoinInfo();
        return () => {
            useTrackingStore.getState().faceTracker.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <JoinRoomModal open={!roomJoinInfo} onSubmit={handleFormSubmit} />
            {roomJoinInfo && <RoomPage roomJoinInfo={roomJoinInfo} />}
        </>
    );
};
