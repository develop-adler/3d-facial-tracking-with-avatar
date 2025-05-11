"use client";

import { useEffect, type ReactNode } from "react";

import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { RoomContext } from "@livekit/components-react";
import "@livekit/components-styles"; // custom livekit classname styles

export default function RoomLayout({
    children,
}: {
    readonly children: ReactNode;
}) {
    const liveKitRoom = useLiveKitStore((state) => state.liveKitRoom);
    const setRoomNameAndUsername = useLiveKitStore(
        (state) => state.setRoomNameAndUsername
    );

    useEffect(() => {
        liveKitRoom.room.on("disconnected", () => {
            setRoomNameAndUsername();
        });
        return () => {
            // dispose room when navigating away from /room route
            liveKitRoom.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <RoomContext.Provider value={liveKitRoom.room}>{children}</RoomContext.Provider>;
}
