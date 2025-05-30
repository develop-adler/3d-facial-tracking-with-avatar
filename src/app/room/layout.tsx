"use client";

import { useEffect, type ReactNode } from "react";

import { useLiveKitStore } from "@/stores/useLiveKitStore";
import "@livekit/components-styles"; // custom livekit classname styles

export default function RoomLayout({
    children,
}: {
    readonly children: ReactNode;
}) {
    useEffect(() => {
        return () => {
            // dispose room when navigating away from /room route
            useLiveKitStore.getState().liveKitRoom.disposeRoom();
        };
    }, []);

    return children;
}
