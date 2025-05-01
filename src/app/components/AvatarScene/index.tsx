"use client";

import { useEffect, useRef, type FC } from "react";

import { CanvasStyled } from "./styles";

import { CoreEngine } from "@/app/3d/CoreEngine";
import { CoreScene } from "@/app/3d/CoreScene";
import { Avatar } from "@/app/3d/Avatar";
import { useAvatarStore } from "@/app/stores/useAvatarStore";
import { useEngineStore } from "@/app/stores/useEngineStore";
import { useSceneStore } from "@/app/stores/useSceneStore";
import { useScreenControlStore } from "@/app/stores/useScreenControlStore";

export const AvatarScene: FC = () => {
    const bjsCanvas = useRef<HTMLCanvasElement>(null); // For 3D scene
    const avatarRef = useRef<Avatar>(null);
    const coreEngineRef = useRef<CoreEngine>(null);
    const coreSceneRef = useRef<CoreScene>(null);

    const setEngine = useEngineStore((state) => state.setEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const setAvatar = useAvatarStore((state) => state.setAvatar);
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);
    const isViewportFill = useScreenControlStore((state) => state.isViewportFill);

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
        coreEngineRef.current?.resize();
    }, [isViewportFill]);

    useEffect(() => {
        if (!bjsCanvas.current) return;

        const canvas = bjsCanvas.current;

        const { coreEngine } = create3DScene(canvas);
        window.addEventListener("resize", coreEngine.resize.bind(coreEngine));
        canvas.addEventListener(
            "resize",
            coreEngine.resize.bind(coreEngine)
        );

        return () => {
            window.removeEventListener("resize", coreEngine.resize.bind(coreEngine));
            canvas.removeEventListener(
                "resize",
                coreEngine.resize.bind(coreEngine)
            );
            coreEngine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <CanvasStyled
                id="hand-canvas"
                $viewportFill={isViewportFill}
                $fullscreen={isFullscreen}
                style={{ border: "none", zIndex: 1 }}
            />
            <CanvasStyled
                id="avatar-canvas"
                ref={bjsCanvas}
                $viewportFill={isViewportFill}
                $fullscreen={isFullscreen}
            />
        </>
    );
};
