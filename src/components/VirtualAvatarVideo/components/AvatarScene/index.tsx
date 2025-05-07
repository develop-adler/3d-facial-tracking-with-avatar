"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type FC } from "react";

import { useMediaDevices } from "@livekit/components-react";

import { CanvasContainer, CanvasStyled, WaitingText } from "./styles";

import LoadingBar from "@/components/VirtualAvatarVideo/components/AvatarScene/components/LoadingBar";
import { Scene3D } from "@/3d/VideoChat/Scene3D";
import { Avatar } from "@/3d/VideoChat/Avatar";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useAvatarLoadingStore } from "@/stores/useAvatarLoadingStore";
import { useEngineStore } from "@/stores/useEngineStore";
import { useSceneStore } from "@/stores/useSceneStore";
import { useScreenControlStore } from "@/stores/useScreenControlStore";

import { mediaStreamFrom3DCanvas, updateMediaStream } from "global";

export const AvatarScene: FC = () => {
    const pathName = usePathname();
    const videoDevices = useMediaDevices({ kind: "videoinput" });

    const bjsCanvasContainer = useRef<HTMLDivElement>(null); // For 3D scene
    const avatarRef = useRef<Avatar>(undefined);
    const scene3DRef = useRef<Scene3D>(undefined);

    const coreEngine = useEngineStore((state) => state.coreEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const setAvatar = useAvatarStore((state) => state.setAvatar);
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);
    const isViewportFill = useScreenControlStore((state) => state.isViewportFill);
    const setIsLoading = useAvatarLoadingStore((state) => state.setIsLoading);

    const create3DScene = (container: HTMLDivElement) => {
        coreEngine.insertCanvasToDOM(container);

        const scene3D = new Scene3D(coreEngine);
        const avatar = new Avatar(scene3D.scene);

        scene3DRef.current = scene3D;
        avatarRef.current = avatar;

        avatar.loadAvatar();

        setScene(scene3D);
        setAvatar(avatar);

        return { coreEngine, scene3D, avatar };
    };

    useEffect(() => {
        setIsLoading(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        coreEngine.resize();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isViewportFill, isFullscreen]);

    useEffect(() => {
        if (videoDevices.length === 0 || !bjsCanvasContainer.current) return;

        const container = bjsCanvasContainer.current;

        const { coreEngine } = create3DScene(container);

        // Create MediaStream to pass to LiveKit
        if (pathName === "/room") {
            updateMediaStream(coreEngine.canvas.captureStream(60));
        }

        return () => {
            mediaStreamFrom3DCanvas?.getVideoTracks().forEach(track => track.stop());
            updateMediaStream();
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
                    ref={bjsCanvasContainer}
                    $isForRoom
                />
            ) : (
                <CanvasContainer
                    $viewportFill={isViewportFill}
                    $fullscreen={isFullscreen}
                >
                    <LoadingBar />
                    <CanvasStyled id="avatar-canvas" ref={bjsCanvasContainer} />
                </CanvasContainer>
            )}
        </>
    );
};
