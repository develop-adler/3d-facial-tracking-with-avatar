"use client";

import dynamic from "next/dynamic";
import { type FC } from "react";

import type { RoomAndName } from "@/apis/entities";
import { JoinRoomModal } from "@/components/LiveKit/JoinRoomModal";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

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
        setRoomNameAndUsername(data);
    };

    return (
        <>
            <JoinRoomModal open={!roomNameAndUsername} onSubmit={handleFormSubmit} />
            {roomNameAndUsername && (
                <RoomPage roomName={roomNameAndUsername.room} name={roomNameAndUsername.name} />
            )}
        </>
    );
};
