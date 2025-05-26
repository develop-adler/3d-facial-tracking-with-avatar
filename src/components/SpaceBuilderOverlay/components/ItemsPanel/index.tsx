"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type PointerEvent,
} from "react";

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
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";

import ItemButton from "@/components/SpaceBuilderOverlay/components/ItemsPanel/components/ItemButton";

import useAssets from "@/hooks/useAssets";
import type { Asset } from "@/models/common";
import type { StudioObjectTypeItems } from "@/models/studio";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

const PANEL_WIDTH = "20vw";
const ITEMS_PER_PAGE = 40;

export type Category = StudioObjectTypeItems | "all";

type Props = {
    categories?: Category[];
};

const ItemsPanel: FC<Props> = ({
    categories = [
        "architectures",
        "decorations",
        "entertainments",
        "furnitures",
        "all",
    ],
}) => {
    const [open, setOpen] = useState<boolean>(false);
    // const [selectOpen, setSelectOpen] = useState<boolean>(false);
    const [category, setCategory] = useState<Category>(categories[0]);
    const [visibleCount, setVisibleCount] = useState<number>(ITEMS_PER_PAGE);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    const spaceBuilder = useLiveKitStore((state) => state.spaceBuilder);

    // for debounce scroll event
    const listRef = useRef<HTMLDivElement>(null);
    const scrollTimeout = useRef<globalThis.NodeJS.Timeout>(null);

    // for click-away event
    // const panelRef = useRef<HTMLDivElement>(null);
    // const buttonRef = useRef<HTMLButtonElement>(null);

    // for hover event
    const hoveringButtonRef = useRef<HTMLButtonElement>(null);
    const timerRef = useRef<globalThis.NodeJS.Timeout>(undefined);
    const assetMapRef = useRef<Map<string, Asset>>(new Map());

    const { architectures, decorations, entertainments, furnitures } =
        useAssets();

    const items: Record<Category, Asset[]> = useMemo(() => {
        return {
            architectures: Object.values(architectures),
            decorations: Object.values(decorations),
            entertainments: Object.values(entertainments),
            furnitures: Object.values(furnitures),
            all: [
                ...Object.values(architectures),
                ...Object.values(decorations),
                ...Object.values(entertainments),
                ...Object.values(furnitures),
            ],
        };
    }, [architectures, decorations, entertainments, furnitures]);

    const handleScroll = useCallback(() => {
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
    }, [category, isLoadingMore, items, visibleCount]);

    useEffect(() => {
        setVisibleCount(ITEMS_PER_PAGE);
    }, [category]);

    useEffect(() => {
        setTimeout(() => {
            setOpen(true);
        }, 30);
    }, []);

    const handleHoverStart = useCallback(
        (event: PointerEvent<HTMLButtonElement>, asset: Asset) => {
            if (!spaceBuilder) return;

            hoveringButtonRef.current = event.currentTarget;
            assetMapRef.current.set(hoveringButtonRef.current.id, asset);

            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = undefined;
            }
            timerRef.current = setTimeout(() => {
                if (!hoveringButtonRef.current) return;
                console.log(
                    "current button id and asset:",
                    hoveringButtonRef.current.id,
                    assetMapRef.current.get(hoveringButtonRef.current.id)
                );
            }, 600);
        },
        [spaceBuilder]
    );

    const handleHoverEnd = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = undefined;
        }
    };

    return (
        <>
            {/* Toggle Button */}
            <IconButton
                // ref={buttonRef}
                onClick={() => setOpen(!open)}
                sx={{
                    position: "fixed",
                    top: `calc(${TOP_MENU_HEIGHT} + 1rem)`,
                    left: open ? `calc(${PANEL_WIDTH} + 1rem)` : "1rem",
                    zIndex: 1301,
                    background: COLOR.white,
                    borderRadius: "50%",
                    boxShadow: 2,
                    transition: "left 0.3s ease-in-out",
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
                    left: 0,
                    width: PANEL_WIDTH,
                    height: `calc(100vh - ${TOP_MENU_HEIGHT} - var(--lk-control-bar-height) - 2rem)`,
                    transform: open ? "translateX(0)" : `translateX(-${PANEL_WIDTH})`,
                    transition: "transform 0.3s ease-in-out",
                }}
            >
                <Box
                    sx={{
                        width: "100%",
                        height: "100%",
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
                                // onOpen={() => setSelectOpen(true)}
                                // onClose={() => setSelectOpen(false)}
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
                                {categories.map((cat) => (
                                    <MenuItem
                                        key={cat}
                                        value={cat}
                                        sx={{
                                            "&:hover": {
                                                backgroundColor: COLOR.grayScale22,
                                            },
                                        }}
                                    >
                                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                    </MenuItem>
                                ))}
                                {/* <MenuItem value="all">All</MenuItem>
                                <MenuItem value="architectures">Architectures</MenuItem>
                                <MenuItem value="decorations">Decorations</MenuItem>
                                <MenuItem value="entertainments">Entertainments</MenuItem>
                                <MenuItem value="furnitures">Furnitures</MenuItem> */}
                            </Select>

                            <Divider
                                sx={{ borderColor: "gray", borderStyle: "solid", my: 2 }}
                            />
                        </Box>

                        {/* Scrollable Item Grid Section */}
                        <Box
                            ref={listRef}
                            onScroll={handleScroll}
                            onWheel={(e) => e.stopPropagation()}
                            sx={{
                                flex: 1,
                                overflowY: "auto",
                                p: 2,
                            }}
                        >
                            {/* Items Grid */}
                            <Grid container spacing={1}>
                                {items[category].slice(0, visibleCount).map((item) => (
                                    <ItemButton
                                        key={item.id}
                                        id={item.id}
                                        item={item}
                                        onPointerEnter={(event) => handleHoverStart(event, item)}
                                        onMouseLeave={handleHoverEnd}
                                    />
                                ))}
                            </Grid>

                            {isLoadingMore && (
                                <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                                    <CircularProgress
                                        disableShrink
                                        size="2rem"
                                        sx={{ color: COLOR.white }}
                                    />
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Box>
        </>
    );
};

export default ItemsPanel;
