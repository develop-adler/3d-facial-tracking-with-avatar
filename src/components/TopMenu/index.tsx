"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Menu, MenuItem, Toolbar } from "@mui/material";

import {
    ButtonContainer,
    IframeContent,
    IframeModal,
    StyledAppBar,
    StyledButton,
} from "./styles";

import { useAvatarStore } from "@/stores/useAvatarStore";
import { useScreenControlStore } from "@/stores/useScreenControlStore";

export const TopMenu = () => {
    const [hide, setHide] = useState<boolean>(false);
    const [lastScrollY, setLastScrollY] = useState<number>(0);
    const [openIframe, setOpenIframe] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const avatar = useAvatarStore((state) => state.avatar);
    const isViewportFill = useScreenControlStore(
        (state) => state.isViewportFill
    );
    const isFullscreen = useScreenControlStore(
        (state) => state.isFullscreen
    );

    const handleDropdownOpen = (event: MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleDropdownClose = () => {
        setAnchorEl(null);
    };

    const switchAvatar = (avatarId: string) => {
        avatar?.loadAvatar(avatarId);
    };

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY && currentScrollY > 50) {
                setHide(true);
            } else {
                setHide(false);
            }
            setLastScrollY(currentScrollY);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, [lastScrollY]);

    if (isViewportFill || isFullscreen) {
        return null; // Don't show the menu in fullscreen or viewport fill mode
    }

    return (
        <>
            <StyledAppBar position="fixed" hide={hide}>
                <Toolbar sx={{ minHeight: "50px !important" }}>
                    <ButtonContainer>
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
                                const res = window
                                    .prompt(
                                        "Enter avatar URL here",
                                        "https://models.readyplayer.me/67fe6f7713b3fb7e8aa0328c.glb"
                                    )
                                    ?.trim()
                                    .replace(/\s+/g, "");

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
