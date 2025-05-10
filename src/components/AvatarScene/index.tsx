"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type FC } from "react";

import { useMediaDevices } from "@livekit/components-react";

import { CanvasContainer, CanvasStyled, WaitingText } from "./styles";

import Avatar from "@/3d/avatar/Avatar";
import CoreScene from "@/3d/core/CoreScene";
import LoadingBar from "@/components/AvatarScene/components/LoadingBar";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useEngineStore } from "@/stores/useEngineStore";
import { useSceneStore } from "@/stores/useSceneStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";
import { useScreenControlStore } from "@/stores/useScreenControlStore";

import { clientSettings } from "clientSettings";
import { mediaStreamFrom3DCanvas, updateMediaStream } from "global";

export const AvatarScene: FC = () => {
    const pathName = usePathname();
    const videoDevices = useMediaDevices({ kind: "videoinput" });

    const bjsCanvasContainer = useRef<HTMLDivElement>(null); // For 3D scene

    const room = useLiveKitStore((state) => state.room);
    const coreEngine = useEngineStore((state) => state.coreEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const setAvatar = useAvatarStore((state) => state.setAvatar);
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);
    const isViewportFill = useScreenControlStore((state) => state.isViewportFill);

    useEffect(() => {
        // to initialize the face tracker
        const faceTracker = useTrackingStore.getState().faceTracker;
        return () => {
            coreEngine.removeCanvasFromDOM();
            faceTracker.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        coreEngine.resize();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isViewportFill, isFullscreen]);

    useEffect(() => {
        if (videoDevices.length === 0) return;

        if (bjsCanvasContainer.current) coreEngine.insertCanvasToDOM(bjsCanvasContainer.current);

        let currentCoreScene = useSceneStore.getState().coreScene;
        if (!currentCoreScene) {
            currentCoreScene = new CoreScene(room, coreEngine);
            setScene(currentCoreScene);
        }
        currentCoreScene.switchToVideoChat();

        let existingAvatar = useAvatarStore.getState().avatar;
        if (!existingAvatar) {
            existingAvatar = new Avatar(
                currentCoreScene,
                room.localParticipant,
                "male",
                true
            );
            setAvatar(existingAvatar);

            currentCoreScene.atom.loadHDRSkybox(0.8, false).then(() => {
                if (!existingAvatar!.container) {
                    existingAvatar!.loadAvatar(undefined, undefined, true);
                }
            });
        }

        // Create MediaStream to pass to LiveKit
        if (pathName === "/room") {
            updateMediaStream(coreEngine.canvas.captureStream(60));
            if (clientSettings.DEBUG) console.log("Publishing 3D canvas as camera stream");
        }

        return () => {
            mediaStreamFrom3DCanvas
                ?.getTracks()
                .forEach((track) => track.stop());
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
                <CanvasStyled id="avatar-canvas" ref={bjsCanvasContainer} $isForRoom />
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
