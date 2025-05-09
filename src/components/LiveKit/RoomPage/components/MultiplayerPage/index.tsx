"use client";

import { useEffect, useMemo, useRef, type FC } from "react";

import { ConnectionState } from "livekit-client";

import { Multiplayer3DContainer } from "./styles";

import CoreScene from "@/3d/core/CoreScene";
import RoomManager from "@/3d/multiplayer/RoomManager";
import AvatarSpeakingHandler from "@/components/LiveKit/RoomPage/components/MultiplayerPage/components/AvatarSpeakingHandler";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useEngineStore } from "@/stores/useEngineStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useSceneStore } from "@/stores/useSceneStore";

export const MultiplayerPage: FC = () => {
    const coreEngine = useEngineStore((state) => state.coreEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const room = useLiveKitStore((state) => state.room);
    const setIsMultiplayer = useLiveKitStore((state) => state.setIsMultiplayer);
    const avatar = useAvatarStore((state) => state.avatar);

    const canvasContainer = useRef<HTMLDivElement>(null);

    const isDisconnected = useMemo(
        () => room.state === ConnectionState.Disconnected,
        [room.state]
    );

    useEffect(() => {
        if (isDisconnected) {
            setIsMultiplayer(false);
            return;
        }
        room.once("disconnected", () => {
            setIsMultiplayer(false);
        });

        if (canvasContainer.current)
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
            setIsMultiplayer(false);
            roomManager.dispose();
            //dispose atom without disposing skybox
            currentCoreScene.atom.dispose(false);
            currentCoreScene.switchToVideoChat();
            coreEngine.removeCanvasFromDOM();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        !isDisconnected && (
            <>
                {avatar && <AvatarSpeakingHandler avatar={avatar} room={room} />}
                <Multiplayer3DContainer ref={canvasContainer} />
            </>
        )
    );
};
