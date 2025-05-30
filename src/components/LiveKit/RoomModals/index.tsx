"use client";

import dynamic from "next/dynamic";
import type { FC } from "react";

import { useLiveKitStore } from "@/stores/useLiveKitStore";

const EnterSpaceConfirmModal = dynamic(
    () => import("@/components/LiveKit/RoomModals/components/EnterSpaceConfirmModal"),
    {
        ssr: false,
    }
);
const BuildSpaceConfirmModal = dynamic(
    () => import("@/components/LiveKit/RoomModals/components/BuildSpaceConfirmModal"),
    {
        ssr: false,
    }
);

const RoomModals: FC = () => {
    const openJoinSpaceModal = useLiveKitStore(
        (state) => state.openJoinSpaceModal
    );
    const openBuildSpaceModal = useLiveKitStore(
        (state) => state.openBuildSpaceModal
    );
    return (
        <>
            {!!openJoinSpaceModal && <EnterSpaceConfirmModal />}
            {!!openBuildSpaceModal && <BuildSpaceConfirmModal />}
        </>
    );
};

export default RoomModals;
