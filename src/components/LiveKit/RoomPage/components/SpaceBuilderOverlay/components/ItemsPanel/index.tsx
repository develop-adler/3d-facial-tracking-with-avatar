import { useEffect, useMemo, useRef, useState, type FC } from "react";
import {
    CircularProgress,
    IconButton,
    TextField,
    Select,
    MenuItem,
    Grid,
    Box,
    Typography,
    Divider,
    ClickAwayListener,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";

import useAssets from "@/hooks/useAssets";
import type { Asset } from "@/models/common";
import type { StudioObjectTypeItems } from "@/models/studio";

import { COLOR, TOP_MENU_HEIGHT } from "constant";
import ItemButton from "../ItemButton";

const PANEL_WIDTH = "20vw";
const ITEMS_PER_PAGE = 40;

type Category = StudioObjectTypeItems | "all";

const LeftPanel: FC = () => {
    const [open, setOpen] = useState<boolean>(false);
    const [selectOpen, setSelectOpen] = useState<boolean>(false);
    const [category, setCategory] = useState<Category>("all");
    const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_PAGE);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    const listRef = useRef<HTMLDivElement>(null);
    // for debounce scroll event
    const scrollTimeout = useRef<globalThis.NodeJS.Timeout>(null);

    const { architectures, decorations, entertainments, furnitures } =
        useAssets();

    const items: Record<Category, Asset[]> = useMemo(() => {
        return {
            architectures: Object.values(architectures),
            decorations: Object.values(decorations),
            entertainments: Object.values(entertainments),
            furnitures: Object.values(furnitures),
            // all = combine all categories
            all: [
                ...Object.values(architectures),
                ...Object.values(decorations),
                ...Object.values(entertainments),
                ...Object.values(furnitures),
            ],
        };
    }, [architectures, decorations, entertainments, furnitures]);

    const handleScroll = () => {
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        scrollTimeout.current = setTimeout(() => {
            const el = listRef.current;
            if (!el || isLoadingMore) return;

            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 64;

            if (nearBottom && visibleCount < items[category].length) {
                setIsLoadingMore(true);
                // simulate async delay
                setTimeout(() => {
                    setVisibleCount((prev) =>
                        Math.min(prev + ITEMS_PER_PAGE, items[category].length)
                    );
                    setIsLoadingMore(false);
                }, 50);
            }
        }, 100);
    };

    useEffect(() => {
        setVisibleCount(ITEMS_PER_PAGE);
    }, [category]);

    return (
        <>
            {/* Toggle Button */}
            <IconButton
                onClick={() => setOpen(!open)}
                sx={{
                    position: "fixed",
                    top: `calc(${TOP_MENU_HEIGHT} + 3rem)`,
                    left: open ? `calc(${PANEL_WIDTH} + 1rem)` : "1rem",
                    zIndex: 1301,
                    background: COLOR.white,
                    borderRadius: "50%",
                    boxShadow: 2,
                    transition: "left 0.3s ease",
                }}
            >
                {open ? <CloseIcon /> : <MenuIcon />}
            </IconButton>

            {/* Side Panel */}
            {open && (
                <ClickAwayListener
                    onClickAway={() => {
                        if (!selectOpen) setOpen(false);
                    }}
                >
                    <Box
                        ref={listRef}
                        onScroll={handleScroll}
                        sx={{
                            position: "fixed",
                            top: `calc(${TOP_MENU_HEIGHT} + 3rem)`,
                            bottom: "calc(var(--lk-control-bar-height) + 3rem)",
                            left: 0,
                            translate: open ? "0 0" : "-100% 0",
                            transition: "translate 0.3s ease-in-out",
                            width: PANEL_WIDTH,
                            bgcolor: COLOR.grayScaleBlack,
                            color: COLOR.white,
                            boxShadow: 4,
                            p: 2,
                            zIndex: 1300,
                            borderTopRightRadius: 4,
                            borderBottomRightRadius: 4,
                            overflow: "hidden",
                        }}
                    >
                        {/* Sticky Top Section */}
                        <Box
                            sx={{
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                bgcolor: COLOR.grayScaleBlack,
                                color: COLOR.white,
                                boxShadow: 4,
                                borderTopRightRadius: 4,
                                borderBottomRightRadius: 4,
                            }}
                        >
                            <Box
                                sx={{
                                    p: 2,
                                    borderBottom: "1px solid #444",
                                    flexShrink: 0,
                                    backgroundColor: COLOR.grayScaleBlack,
                                    zIndex: 1,
                                }}
                            >
                                {/* Search Bar */}
                                <TextField
                                    label="Search"
                                    variant="outlined"
                                    fullWidth
                                    size="small"
                                    sx={{
                                        mb: 2,
                                        "& .MuiOutlinedInput-root": {
                                            color: COLOR.white,
                                            "& fieldset": { borderColor: COLOR.grayScale22 },
                                            "&:hover fieldset": { borderColor: COLOR.white },
                                        },
                                        "& .MuiInputLabel-root": {
                                            color: "#ccc",
                                        },
                                    }}
                                />

                                {/* Categories Dropdown */}
                                <Typography variant="subtitle2" gutterBottom>
                                    Categories
                                </Typography>
                                <Select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as Category)}
                                    fullWidth
                                    size="small"
                                    onOpen={() => setSelectOpen(true)}
                                    onClose={() => setSelectOpen(false)}
                                    sx={{
                                        mb: 2,
                                        color: COLOR.white,
                                        "& .MuiOutlinedInput-notchedOutline": {
                                            borderColor: COLOR.grayScale22,
                                        },
                                        "&:hover .MuiOutlinedInput-notchedOutline": {
                                            borderColor: COLOR.white,
                                        },
                                        "& .MuiSelect-icon": {
                                            color: COLOR.white,
                                            bgcolor: COLOR.grayScale22,
                                        },
                                    }}
                                    MenuProps={{
                                        PaperProps: {
                                            sx: {
                                                bgcolor: COLOR.grayScale22, // dark background for dropdown
                                                color: COLOR.white, // white text
                                            },
                                        },
                                    }}
                                >
                                    <MenuItem value="all">All</MenuItem>
                                    <MenuItem value="architectures">Architectures</MenuItem>
                                    <MenuItem value="decorations">Decorations</MenuItem>
                                    <MenuItem value="entertainments">Entertainments</MenuItem>
                                    <MenuItem value="furnitures">Furnitures</MenuItem>
                                </Select>

                                <Divider
                                    sx={{ borderColor: "gray", borderStyle: "solid", my: 2 }}
                                />
                            </Box>

                            {/* Scrollable Item Grid Section */}
                            <Box
                                ref={listRef}
                                onScroll={handleScroll}
                                sx={{
                                    flex: 1,
                                    overflowY: "auto",
                                    p: 2,
                                }}
                            >
                                {/* Items Grid */}
                                <Grid container spacing={1}>
                                    {items[category].slice(0, visibleCount).map((item) => (
                                        <ItemButton key={item.id} item={item} />
                                    ))}
                                </Grid>

                                {isLoadingMore && (
                                    <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                                        <CircularProgress size={20} sx={{ color: "#888" }} />
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </ClickAwayListener>
            )}
        </>
    );
};

export default LeftPanel;
