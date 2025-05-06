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
    const room = useLiveKitStore((state) => state.room);
    const setRoomNameAndUsername = useLiveKitStore(
        (state) => state.setRoomNameAndUsername
    );

    useEffect(() => {
        room.on("disconnected", () => {
            setRoomNameAndUsername(null);
        });
        return () => {
            // disconnect when navigating away from /room route
            room.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}
