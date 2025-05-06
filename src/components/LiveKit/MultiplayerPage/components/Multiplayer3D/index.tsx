import { useEffect, useRef, useState, type FC } from "react";

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
    const [multiplayScene] = useState<MultiplayerScene>(
        new MultiplayerScene(room, coreEngine)
    );
    const [roomManager] = useState<RoomManager>(
        new RoomManager(room, multiplayScene)
    );

    const canvasContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!canvasContainer.current) return;
        coreEngine.insertCanvasToDOM(canvasContainer.current);
        // Dispose of the scene when the component unmounts
        return () => {
            multiplayScene.dispose();
            roomManager.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [multiplayScene]);

    return <Multiplayer3DContainer ref={canvasContainer} />;
};

export default Multiplayer3D;
