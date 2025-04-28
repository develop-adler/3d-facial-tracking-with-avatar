"use client";

import { useEffect, useRef, type FC } from "react";

import { CanvasStyled, StyledButton } from "./styles";

import { CoreEngine } from "@/app/3d/CoreEngine";
import { CoreScene } from "@/app/3d/CoreScene";
import { Avatar } from "@/app/3d/Avatar";
import { useAvatarStore } from "@/app/stores/useAvatarStore";
import { useEngineStore } from "@/app/stores/useEngineStore";
import { useSceneStore } from "@/app/stores/useSceneStore";

export const AvatarScene: FC = () => {
    const bjsCanvas = useRef<HTMLCanvasElement>(null); // For 3D scene
    const avatarRef = useRef<Avatar>(null);
    const coreEngineRef = useRef<CoreEngine>(null);
    const coreSceneRef = useRef<CoreScene>(null);

    const setEngine = useEngineStore((state) => state.setEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const setAvatar = useAvatarStore((state) => state.setAvatar);

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


    const switchAvatar = (avatarId: string) => {
        if (!avatarRef.current) return;
        avatarRef.current.loadAvatar(avatarId);
    };

    useEffect(() => {
        if (!bjsCanvas.current) return;

        const { coreEngine } = create3DScene(bjsCanvas.current);
        window.addEventListener("resize", coreEngine.resize.bind(coreEngine));

        return () => {
            window.removeEventListener("resize", coreEngine.resize.bind(coreEngine));
            coreEngine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>

            {/* centered div horizontally while laying buttons out horizontally */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "absolute",
                    margin: "none",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "25%",
                }}
            >
                {/* 
              asian female: 6809df026026f5144d94f3f4
              white female: 6809df7c4e68c7a706ac7e55
              black male: 6809d76c64ce38bc90a10c88
              white male: 67fe6f7713b3fb7e8aa0328c
            */}
                <StyledButton onClick={() => switchAvatar("6809df026026f5144d94f3f4")}>
                    Asian female
                </StyledButton>
                <StyledButton onClick={() => switchAvatar("6809df7c4e68c7a706ac7e55")}>
                    White female
                </StyledButton>
                <StyledButton onClick={() => switchAvatar("6809d76c64ce38bc90a10c88")}>
                    Black male
                </StyledButton>
                <StyledButton onClick={() => switchAvatar("67fe6f7713b3fb7e8aa0328c")}>
                    White male
                </StyledButton>
            </div>

            <CanvasStyled ref={bjsCanvas} />
        </>
    );
};