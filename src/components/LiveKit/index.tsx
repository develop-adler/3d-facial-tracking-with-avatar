"use client";

import dynamic from "next/dynamic";
import { type FC } from "react";

const RoomPage = dynamic(
    () => import("@/components/LiveKit/RoomPage").then((p) => p.RoomPage),
    {
        ssr: false,
    }
);

import type { RoomAndName } from "@/api/entities";
import { JoinRoomModal } from "@/components/LiveKit/JoinRoomModal";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

export const LiveKitPage: FC = () => {
    const roomAndName = useLiveKitStore((state) => state.roomAndName);
    const setRoomAndName = useLiveKitStore((state) => state.setRoomAndName);

    const handleFormSubmit = (data: RoomAndName) => {
        setRoomAndName(data);
    };

    return (
        <>
            <JoinRoomModal open={roomAndName === null} onSubmit={handleFormSubmit} />
            {roomAndName && (
                <RoomPage room={roomAndName.room} name={roomAndName.name} />
            )}
        </>
    );
};
