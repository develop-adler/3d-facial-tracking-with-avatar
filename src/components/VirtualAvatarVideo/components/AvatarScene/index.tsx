"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type FC } from "react";

import { useMediaDevices } from "@livekit/components-react";

import { CanvasContainer, CanvasStyled, WaitingText } from "./styles";

import { CoreEngine } from "@/3d/CoreEngine";
import { CoreScene } from "@/3d/CoreScene";
import { Avatar } from "@/3d/Avatar";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useEngineStore } from "@/stores/useEngineStore";
import { useSceneStore } from "@/stores/useSceneStore";
import { useScreenControlStore } from "@/stores/useScreenControlStore";

import { updateMediaStream } from "global";
import LoadingBar from "./components/LoadingBar";
import { useAvatarLoadingStore } from "@/stores/useAvatarLoadingStore";

export const AvatarScene: FC = () => {
    const pathName = usePathname();
    const videoDevices = useMediaDevices({ kind: "videoinput" });

    const bjsCanvas = useRef<HTMLCanvasElement>(null); // For 3D scene
    const avatarRef = useRef<Avatar>(null);
    const coreEngineRef = useRef<CoreEngine>(null);
    const coreSceneRef = useRef<CoreScene>(null);

    const setEngine = useEngineStore((state) => state.setEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const setAvatar = useAvatarStore((state) => state.setAvatar);
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);
    const isViewportFill = useScreenControlStore((state) => state.isViewportFill);
    const setIsLoading = useAvatarLoadingStore((state) => state.setIsLoading);

    const create3DScene = (canvas: HTMLCanvasElement) => {
        const coreEngine = new CoreEngine(canvas);
        const coreScene = new CoreScene(coreEngine);
        const avatar = new Avatar(coreScene.scene);

        coreEngineRef.current = coreEngine;
        coreSceneRef.current = coreScene;
        avatarRef.current = avatar;

        avatar.loadAvatar();

        setEngine(coreEngine);
        setScene(coreScene);
        setAvatar(avatar);

        return { coreEngine, coreScene, avatar };
    };

    useEffect(() => {
        setIsLoading(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        coreEngineRef.current?.resize();
    }, [isViewportFill]);

    useEffect(() => {
        if (videoDevices.length === 0 || !bjsCanvas.current) return;

        const canvas = bjsCanvas.current;

        const { coreEngine } = create3DScene(canvas);
        window.addEventListener("resize", coreEngine.resize.bind(coreEngine));
        canvas.addEventListener("resize", coreEngine.resize.bind(coreEngine));

        // Create MediaStream to pass to LiveKit
        if (pathName === "/room")
            updateMediaStream(bjsCanvas.current.captureStream(60));

        return () => {
            window.removeEventListener("resize", coreEngine.resize.bind(coreEngine));
            canvas.removeEventListener("resize", coreEngine.resize.bind(coreEngine));
            coreEngine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoDevices]);

    // show waiting text if camera is not available
    if (videoDevices.length === 0) {
        return <WaitingText>Waiting for camera...</WaitingText>;
    }

    return (
        <>
            {/* To display 2D hands from Hand Landmarker */}
            {/* <CanvasStyled
                id="hand-canvas"
                $viewportFill={isViewportFill}
                $fullscreen={isFullscreen}
                style={{ border: "none", zIndex: 1 }}
            /> */}

            {pathName === "/room" ? (
                <CanvasStyled
                    id="avatar-canvas"
                    ref={bjsCanvas}
                    $isForRoom
                />
            ) : (
                <CanvasContainer
                    $viewportFill={isViewportFill}
                    $fullscreen={isFullscreen}
                >
                    <LoadingBar />
                    <CanvasStyled id="avatar-canvas" ref={bjsCanvas} />
                </CanvasContainer>
            )}
        </>
    );
};
