"use client";

import {
    useEffect,
    useRef,
    useState,
    type FC,
    type PointerEvent as PointerEventReact,
} from "react";
import { Box, DialogContent, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import VoiceChanger from "@/components/VoiceChangerModal/VoiceChanger";
import { Vector2 } from "@/models/3d";
import { useVoiceChangerStore } from "@/stores/useVoiceChangerStore";

type Props = {
    open: boolean;
    onClose: () => void;
};

const VoiceChangerModal: FC<Props> = ({ open, onClose }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef<boolean>(false);
    const dragOffset = useRef<Vector2>({ x: 0, y: 0 });

    const [localPosition, setLocalPosition] = useState<Vector2>(
        () => useVoiceChangerStore.getState().modalPosition
    );

    const handleClose = () => {
        useVoiceChangerStore.getState().toggleVoiceChangerModal(false);
        onClose?.();
    };

    // // Close when clicking outside
    // useEffect(() => {
    //     const handleClickOutside = (event: MouseEvent) => {
    //         if (
    //             containerRef.current &&
    //             !containerRef.current.contains(event.target as Node)
    //         ) {
    //             handleClose();
    //         }
    //     };

    //     if (open) {
    //         document.addEventListener("pointerdown", handleClickOutside);
    //     }
    //     return () => {
    //         document.removeEventListener("pointerdown", handleClickOutside);
    //     };
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [open, onClose]);

    // Drag movement
    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!isDragging.current) return;
            setLocalPosition({
                x: event.clientX - dragOffset.current.x,
                y: event.clientY - dragOffset.current.y,
            });
        };

        const handlePointerUp = () => {
            // TODO: bugged, not updating in localStorage, not sure why
            useVoiceChangerStore.getState().setModalPosition(localPosition);
            isDragging.current = false;
        };

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
        return () => {
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePointerDown = (event: PointerEventReact) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        isDragging.current = true;
        dragOffset.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    };

    // eslint-disable-next-line unicorn/no-null
    if (!open) return null;

    return (
        <Box
            ref={containerRef}
            sx={{
                position: "absolute",
                top: localPosition.y,
                left: localPosition.x,
                width: 400,
                backgroundColor: "#1D1A22",
                borderRadius: 4,
                boxShadow: 6,
                zIndex: 1000,
                color: "#fff",
                userSelect: "none",
            }}
        >
            <Box
                onPointerDown={handlePointerDown}
                sx={{
                    cursor: "move",
                    px: 2,
                    py: 1,
                    backgroundColor: "#2B2831",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                }}
            >
                <Typography variant="subtitle1">Voice Changer</Typography>
                <IconButton onClick={handleClose} size="small" sx={{ color: "#fff" }}>
                    <CloseIcon />
                </IconButton>
            </Box>

            <DialogContent
                sx={{
                    p: 0,
                    backgroundColor: "#1D1A22",
                    pointerEvents: "auto",
                }}
            >
                <VoiceChanger />
            </DialogContent>
        </Box>
    );
};

export default VoiceChangerModal;
