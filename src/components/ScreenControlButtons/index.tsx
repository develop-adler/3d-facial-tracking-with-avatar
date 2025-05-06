"use client";

import { useEffect, type FC } from "react";

import { useScreenControlStore } from "@/stores/useScreenControlStore";

import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import CropSquareIcon from "@mui/icons-material/CropSquare"; // for "fill viewport"
import IconButton from "@mui/material/IconButton";

export const ScreenControlButtons: FC = () => {
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);
    const setFullscreen = useScreenControlStore((state) => state.setFullscreen);
    const setViewportFill = useScreenControlStore(
        (state) => state.setViewportFill
    );
    const toggleViewportFill = useScreenControlStore(
        (state) => state.toggleViewportFill
    );

    const handleFullscreenToggle = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setViewportFill(true);
            setFullscreen(true);
        } else {
            document.exitFullscreen();
            setViewportFill(false);
            setFullscreen(false);
        }
    };

    const handleViewportFillToggle = () => {
        toggleViewportFill();
    };

    useEffect(() => {
        const onFullscreenChange = () => {
            const isFull = !!document.fullscreenElement;
            setFullscreen(isFull);
        };

        document.addEventListener("fullscreenchange", onFullscreenChange);

        return () => {
            document.removeEventListener("fullscreenchange", onFullscreenChange);
        };
    }, [setFullscreen]);

    return (
        <div
            style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                display: "flex",
                gap: 8,
                zIndex: 10,
            }}
        >
            <IconButton
                onClick={handleViewportFillToggle}
                size="medium"
                sx={{ bgcolor: "white", zIndex: 11 }}
                disableRipple
            >
                <CropSquareIcon fontSize="small" />
            </IconButton>
            <IconButton
                onClick={handleFullscreenToggle}
                size="medium"
                sx={{ bgcolor: "white", zIndex: 11 }}
                disableRipple
            >
                {isFullscreen ? (
                    <FullscreenExitIcon fontSize="small" />
                ) : (
                    <FullscreenIcon fontSize="small" />
                )}
            </IconButton>
        </div>
    );
};
