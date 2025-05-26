"use client";

import { useEffect, useState, type FC } from "react";

import { IconButton, Box, FormControlLabel, Checkbox } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";

import Section from "@/components/SpaceBuilderOverlay/components/PropertiesPanel/components/Section";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

const PANEL_WIDTH = "20vw";

const PropertiesPanel: FC = () => {
    const [open, setOpen] = useState<boolean>(false);
    const [freeze, setFreeze] = useState<boolean>(false);

    // for click-away event
    // const panelRef = useRef<HTMLDivElement>(null);
    // const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setTimeout(() => {
            setOpen(true);
        }, 30);
    }, []);

    return (
        <>
            {/* Toggle Button */}
            <IconButton
                // ref={buttonRef}
                onClick={() => setOpen(!open)}
                sx={{
                    position: "fixed",
                    top: `calc(${TOP_MENU_HEIGHT} + 1rem)`,
                    right: open ? `calc(${PANEL_WIDTH} + 1rem)` : "1rem",
                    zIndex: 1301,
                    background: COLOR.white,
                    borderRadius: "50%",
                    boxShadow: 2,
                    transition: "right 0.3s ease-in-out",
                }}
            >
                {open ? <CloseIcon /> : <MenuIcon />}
            </IconButton>

            {/* Side Panel */}
            <Box
                // ref={panelRef}
                sx={{
                    position: "fixed",
                    top: `calc(${TOP_MENU_HEIGHT} + 1rem)`,
                    bottom: "calc(var(--lk-control-bar-height) + 1rem)",
                    right: 0,
                    width: PANEL_WIDTH,
                    height: `calc(100vh - ${TOP_MENU_HEIGHT}  - var(--lk-control-bar-height) - 2rem)`,
                    transform: open ? "translateX(0)" : `translateX(${PANEL_WIDTH})`,
                    transition: "transform 0.3s ease-in-out",
                }}
            >
                <Box
                    sx={{
                        width: "100%",
                        height: "100%",
                        bgcolor: COLOR.grayScaleBlack,
                        color: COLOR.grayScale85,
                        boxShadow: 4,
                        p: 2,
                        zIndex: 1300,
                        borderTopRightRadius: 4,
                        borderBottomRightRadius: 4,
                        overflow: "hidden",
                    }}
                >
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={freeze}
                                onChange={(e) => setFreeze(e.target.checked)}
                                sx={{
                                    color: COLOR.brandPrimary,
                                    "&.Mui-checked": {
                                        color: COLOR.brandPrimary,
                                    },
                                }}
                                color="primary"
                            />
                        }
                        label="Freeze"
                        sx={{ mb: 1, color: COLOR.grayScale85, }}
                        color="primary"
                    />
                    <Section title="Location" isFrozen={freeze} />
                    <Section title="Rotation" isFrozen={freeze} />
                    <Section title="Scale" isFrozen={freeze} />
                </Box>
            </Box>
        </>
    );
};

export default PropertiesPanel;
