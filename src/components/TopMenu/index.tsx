"use client";

import { usePathname, useRouter } from "next/navigation";

import { useState, type FC, type MouseEvent } from "react";

import HomeIcon from "@mui/icons-material/Home";
import { Box, Menu, MenuItem, Toolbar } from "@mui/material";

import {
    ButtonContainer,
    IframeContent,
    IframeModal,
    StyledAppBar,
    StyledButton,
} from "./styles";

import { useAvatarStore } from "@/stores/useAvatarStore";
import { useScreenControlStore } from "@/stores/useScreenControlStore";

const TopMenu: FC = () => {
    const router = useRouter();
    const pathName = usePathname();

    const [openIframe, setOpenIframe] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement>();

    const avatar = useAvatarStore((state) => state.avatar);
    const isViewportFill = useScreenControlStore((state) => state.isViewportFill);
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);

    const handleDropdownOpen = (event: MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleDropdownClose = () => {
        setAnchorEl(undefined);
    };

    const switchAvatar = (avatarId: string) => {
        avatar?.loadAvatar(avatarId);
    };

    const pushRoute = (route: string) => {
        if (pathName === route) return;
        if (!pathName.startsWith("/")) throw new Error("Invalid path name");
        router.push(route);
    };

    if (isViewportFill || isFullscreen) {
        // eslint-disable-next-line unicorn/no-null
        return null; // Don't show the menu in fullscreen or viewport fill mode
    }

    return (
        <>
            <StyledAppBar>
                <Toolbar sx={{ minHeight: "50px !important" }}>
                    {/* Left-side: Home button */}
                    <Box sx={{ flex: 1, display: "flex", alignItems: "center" }}>
                        <StyledButton
                            variant="contained"
                            color="primary"
                            onClick={() => pushRoute("/")}
                            sx={{ minWidth: 0, padding: 1 }}
                        >
                            <HomeIcon />
                        </StyledButton>
                    </Box>

                    {/* Center: Avatar controls */}
                    <ButtonContainer>
                        <StyledButton
                            variant="contained"
                            color="warning"
                            onClick={() => pushRoute("/room")}
                        >
                            Join a call room
                        </StyledButton>
                        <StyledButton
                            variant="contained"
                            color="secondary"
                            onClick={() => setOpenIframe(true)}
                        >
                            Create new avatar
                        </StyledButton>
                        <StyledButton
                            variant="contained"
                            color="secondary"
                            onClick={() => {
                                const res = globalThis
                                    .prompt(
                                        "Enter avatar URL here",
                                        "https://models.readyplayer.me/67fe6f7713b3fb7e8aa0328c.glb"
                                    )
                                    ?.trim()
                                    .replaceAll(/\s+/g, "");

                                if (res) {
                                    avatar?.changeAvatar(res);
                                }
                            }}
                        >
                            Change avatar URL
                        </StyledButton>
                        <StyledButton
                            variant="contained"
                            color="secondary"
                            onClick={handleDropdownOpen}
                        >
                            Avatar presets ⬇️
                        </StyledButton>
                    </ButtonContainer>

                    {/* Right-side filler (to balance flex layout) */}
                    <Box sx={{ flex: 1 }} />
                </Toolbar>
            </StyledAppBar>

            {/* Dropdown Menu */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleDropdownClose}
                anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "center",
                }}
                transformOrigin={{
                    vertical: "top",
                    horizontal: "center",
                }}
            >
                <MenuItem onClick={() => switchAvatar("6809df026026f5144d94f3f4")}>
                    Asian female
                </MenuItem>
                <MenuItem onClick={() => switchAvatar("6809df7c4e68c7a706ac7e55")}>
                    White female
                </MenuItem>
                <MenuItem onClick={() => switchAvatar("6809d76c64ce38bc90a10c88")}>
                    Black male
                </MenuItem>
                <MenuItem onClick={() => switchAvatar("67fe6f7713b3fb7e8aa0328c")}>
                    White male
                </MenuItem>
            </Menu>

            <IframeModal open={openIframe} onClose={() => setOpenIframe(false)}>
                <IframeContent src="https://avatar.new" />
            </IframeModal>
        </>
    );
};

export default TopMenu;
