import type { FC } from "react";

import BuildSpaceConfirmModal from "@/components/Modals/components/BuildSpaceConfirmModal";
import EnterSpaceConfirmModal from "@/components/Modals/components/EnterSpaceConfirmModal";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

const Modals: FC = () => {
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

export default Modals;
