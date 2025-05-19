"use client";

import { useEffect, useMemo, useRef, type FC } from "react";

import { ConnectionState, RoomEvent } from "livekit-client";

import { FacialExpressionCanvas, Multiplayer3DContainer } from "./styles";

import CoreScene from "@/3d/core/CoreScene";
import MultiplayerManager from "@/3d/multiplayer/MultiplayerManager";
import AvatarSpeakingHandler from "@/components/LiveKit/RoomPage/components/MultiplayerPage/components/AvatarSpeakingHandler";
import SpaceBuilderOverlay from "@/components/LiveKit/RoomPage/components/SpaceBuilderOverlay";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useEngineStore } from "@/stores/useEngineStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useSceneStore } from "@/stores/useSceneStore";
import { useTrackingStore } from "@/stores/useTrackingStore";
import SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";

export const MultiplayerPage: FC = () => {
    const coreEngine = useEngineStore((state) => state.coreEngine);
    const room = useLiveKitStore((state) => state.room);
    const avatar = useAvatarStore((state) => state.avatar);
    const isBuildSpaceMode = useLiveKitStore(
        (state) => state.isBuildSpaceMode
    );

    const canvasContainer = useRef<HTMLDivElement>(null);
    const multiplayerManagerRef = useRef<MultiplayerManager>(undefined);
    const spaceBuilderRef = useRef<SpaceBuilder>(undefined);

    const isDisconnected = useMemo(
        () => room.state === ConnectionState.Disconnected,
        [room.state]
    );
    
    useEffect(() => {
        if (!multiplayerManagerRef.current) return;

        if (isBuildSpaceMode) {
            const spaceBuilder = new SpaceBuilder(multiplayerManagerRef.current);
            spaceBuilderRef.current = spaceBuilder;
            useLiveKitStore.getState().setSpaceBuilder(spaceBuilder);
        } else {
            spaceBuilderRef.current?.dispose();
            spaceBuilderRef.current = undefined;
            useLiveKitStore.getState().setSpaceBuilder(undefined);
        }
    }, [isBuildSpaceMode]);

    useEffect(() => {
        if (isDisconnected) {
            useLiveKitStore.getState().setIsMultiplayer(false);
            useLiveKitStore.getState().setIsBuildSpaceMode(false);
            return;
        }
        room.once(RoomEvent.Disconnected, () => {
            useLiveKitStore.getState().setIsMultiplayer(false);
            useLiveKitStore.getState().setIsBuildSpaceMode(false);
        });

        if (canvasContainer.current)
            coreEngine.insertCanvasToDOM(canvasContainer.current);

        let currentCoreScene = useSceneStore.getState().coreScene;
        if (!currentCoreScene) {
            currentCoreScene = new CoreScene(room, coreEngine);
            useSceneStore.getState().setScene(currentCoreScene);
        }
        currentCoreScene.switchToMultiplayer();
        currentCoreScene.atom.load();

        const multiplayerManager = new MultiplayerManager(room, currentCoreScene);
        multiplayerManagerRef.current = multiplayerManager;
        useLiveKitStore.getState().setMultiplayerManager(multiplayerManager);

        let elapsedTime = 0;
        const fps = 60;
        const faceTrackObserver = currentCoreScene.scene.onBeforeRenderObservable.add(() => {
            elapsedTime += 1000 / fps;
            if (elapsedTime < 1000 / fps) return;
            elapsedTime = 0;
            useTrackingStore.getState().faceTracker.detectFace();
            // useTrackingStore.getState().faceTracker.detectHand();
        });

        return () => {
            faceTrackObserver.remove();
            useLiveKitStore.getState().setIsMultiplayer(false);
            useLiveKitStore.getState().setIsBuildSpaceMode(false);
            multiplayerManager.dispose();
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
                <FacialExpressionCanvas id="pipCanvas" />
                {isBuildSpaceMode && <SpaceBuilderOverlay />}
            </>
        )
    );
};
