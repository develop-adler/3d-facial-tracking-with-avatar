"use client";

import dynamic from "next/dynamic";
import { type FC } from "react";

import DOMPurify from 'dompurify';

import type { RoomAndName } from "@/models/multiplayer";
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
        // Define the regex to allow only a-z, A-Z, 0-9
        const regex = /^[\dA-Za-z]*$/;

        // Check if the room name and username match the regex
        if (!regex.test(data.room) || !regex.test(data.name)) {
            alert("Room name and username can only contain letters and numbers.");
            setRoomNameAndUsername();
            return;
        }

        data.room = DOMPurify.sanitize(data.room);
        data.name = DOMPurify.sanitize(data.name);

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
