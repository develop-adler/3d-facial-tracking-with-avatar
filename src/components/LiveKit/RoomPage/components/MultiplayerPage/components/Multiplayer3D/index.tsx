import { useEffect, useRef, type FC } from "react";

import type { Room } from "livekit-client";

import { Multiplayer3DContainer } from "./styles";

import CoreScene from "@/3d/core/CoreScene";
import RoomManager from "@/3d/multiplayer/RoomManager";
import { useEngineStore } from "@/stores/useEngineStore";
import { useSceneStore } from "@/stores/useSceneStore";

type Props = {
    room: Room;
};

const Multiplayer3D: FC<Props> = ({ room }) => {
    const coreEngine = useEngineStore((state) => state.coreEngine);
    const setScene = useSceneStore((state) => state.setScene);

    const canvasContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!canvasContainer.current) return;

        const canvasCont = canvasContainer.current;
        coreEngine.insertCanvasToDOM(canvasContainer.current);

        let currentCoreScene = useSceneStore.getState().coreScene;
        if (!currentCoreScene) {
            currentCoreScene = new CoreScene(room, coreEngine);
            setScene(currentCoreScene);
        }
        currentCoreScene.switchToMultiplayer();
        currentCoreScene.atom.load();
        const roomManager = new RoomManager(room, currentCoreScene);

        return () => {
            roomManager.dispose();
            //dispose atom without disposing skybox
            currentCoreScene.atom.dispose(false);
            currentCoreScene.switchToVideoChat();
            coreEngine.removeCanvasFromDOM(canvasCont);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <Multiplayer3DContainer ref={canvasContainer} />;
};

export default Multiplayer3D;
