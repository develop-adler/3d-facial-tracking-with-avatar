"use client";

import dynamic from "next/dynamic";
import { useEffect, type FC } from "react";
import { ConnectionState } from "livekit-client";

import { useLiveKitStore } from "@/stores/useLiveKitStore";

const Multiplayer3D = dynamic(
    () => import("@/components/LiveKit/RoomPage/components/MultiplayerPage/components/Multiplayer3D"),
    {
        ssr: false,
    }
);

export const MultiplayerPage: FC = () => {
    const room = useLiveKitStore((state) => state.room);
    const setIsMultiplayer = useLiveKitStore(
        (state) => state.setIsMultiplayer
    );

    const isDisconnected = room.state === ConnectionState.Disconnected;

    useEffect(() => {
        if (isDisconnected) {
            setIsMultiplayer(false);
            return;
        }
        room.once("disconnected", () => {
            setIsMultiplayer(false);
        });
        return () => {
            setIsMultiplayer(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return !isDisconnected && <Multiplayer3D room={room} />;
};
