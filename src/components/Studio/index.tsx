"use client";

import { useEffect, useRef, type FC } from "react";

import { Canvas3DContainer } from "./styles";

import SpaceBuilderOverlay from "@/components/SpaceBuilderOverlay";
import { useEngineStore } from "@/stores/useEngineStore";

const StudioPage: FC = () => {
    const coreEngine = useEngineStore((state) => state.coreEngine);

    const canvasContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (canvasContainer.current) {
            coreEngine.insertCanvasToDOM(canvasContainer.current);
        }

        return () => {
            coreEngine.removeCanvasFromDOM();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <SpaceBuilderOverlay />
            <Canvas3DContainer ref={canvasContainer} />
        </>
    );
};

export default StudioPage;