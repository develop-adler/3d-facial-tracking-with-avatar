"use client";

import dynamic from "next/dynamic";
import { type FC } from "react";

const RoomPage = dynamic(
    () => import("@/components/LiveKit/RoomPage").then((p) => p.RoomPage),
    {
        ssr: false,
    }
);

import type { RoomAndName } from "@/apis/entities";
import { JoinRoomModal } from "@/components/LiveKit/JoinRoomModal";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

export const LiveKitPage: FC = () => {
    const roomNameAndUsername = useLiveKitStore((state) => state.roomNameAndUsername);
    const setRoomNameAndUsername = useLiveKitStore((state) => state.setRoomNameAndUsername);

    const handleFormSubmit = (data: RoomAndName) => {
        setRoomNameAndUsername(data);
    };

    return (
        <>
            <JoinRoomModal open={roomNameAndUsername === null} onSubmit={handleFormSubmit} />
            {roomNameAndUsername && (
                <RoomPage roomName={roomNameAndUsername.room} name={roomNameAndUsername.name} />
            )}
        </>
    );
};
