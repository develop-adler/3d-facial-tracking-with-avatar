"use client";

import { type FC } from "react";

import type { RoomAndName } from "@/api/entities";
import { JoinRoomModal } from "@/components/LiveKit/JoinRoomModal";
import { RoomPage } from "@/components/LiveKit/RoomPage";
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
