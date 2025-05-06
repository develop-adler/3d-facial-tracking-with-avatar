"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, type FC } from "react";
import { ConnectionState } from "livekit-client";

import { useLiveKitStore } from "@/stores/useLiveKitStore";

const Multiplayer3D = dynamic(
    () => import("@/components/LiveKit/MultiplayerPage/components/Multiplayer3D"),
    {
        ssr: false,
    }
);
const CustomControlBar = dynamic(
    () =>
        import("@/components/LiveKit/RoomPage/components/CustomControlBar").then(
            (mod) => mod.CustomControlBar
        ),
    {
        ssr: false,
    }
);

export const MultiplayerPage: FC = () => {
    const router = useRouter();

    const room = useLiveKitStore((state) => state.room);

    const isDisconnected = room.state === ConnectionState.Disconnected;

    useEffect(() => {
        // if room is not connected, redirect to /room
        if (isDisconnected) {
            router.push("/room");
            return;
        }
        room.once("disconnected", () => {
            router.push("/room");
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return isDisconnected ? null : (
        <div data-lk-theme="default">
            <Multiplayer3D room={room} />
            {/* Controls for user */}
            <CustomControlBar />
        </div>
    );
};
