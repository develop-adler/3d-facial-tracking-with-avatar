import { useEffect, useRef, type FC } from "react";

import type { Room } from "livekit-client";

import { Multiplayer3DContainer } from "./styles";

import MultiplayerScene from "@/3d/Multiplayer/MultiplayerScene";
import { useEngineStore } from "@/stores/useEngineStore";
import RoomManager from "@/3d/Multiplayer/RoomManager";

type Props = {
    room: Room;
};

const Multiplayer3D: FC<Props> = ({ room }) => {
    const coreEngine = useEngineStore((state) => state.coreEngine);

    const canvasContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!canvasContainer.current) return;
        const multiplayerScene = new MultiplayerScene(room, coreEngine);
        coreEngine.insertCanvasToDOM(canvasContainer.current);

        const roomManager = new RoomManager(room, multiplayerScene);

        return () => {
            roomManager.dispose();
            multiplayerScene.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <Multiplayer3DContainer ref={canvasContainer} />;
};

export default Multiplayer3D;
