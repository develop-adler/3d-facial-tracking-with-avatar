import { useMemo, useState, type FC } from "react";
import {
    Box,
    List,
    ListItem,
    ListItemText,
    IconButton,
    Paper,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { Room } from "livekit-client";

import eventBus from "@/eventBus";
import type { RequestJoinSpace, SpaceType } from "@/models/multiplayer";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { COLOR } from "constant";

const drawerWidth = 200;
const buttonHeight = 48;

type Props = {
    room: Room;
};

const LeftMenu: FC<Props> = ({ room }) => {
    const [open, setOpen] = useState<boolean>(false);
    const [override, setOverride] = useState<boolean>(false);

    const isMultiplayer = useLiveKitStore((state) => state.isMultiplayer);
    const setIsMultiplayer = useLiveKitStore((state) => state.setIsMultiplayer);

    const requestJoinSpace = (spaceType: SpaceType): RequestJoinSpace => {
        const obj = {
            identity: room.localParticipant.identity,
            spaceType,
        };
        eventBus.emitWithEvent("multiplayer:requestJoinSpace", obj);
        return obj;
    };

    const hasRemoteParticipants = useMemo(
        () => room.remoteParticipants.size > 0,
        [room.remoteParticipants]
    );

    return (
        <Box
            onPointerEnter={() => !override && setOpen(true)}
            onPointerLeave={() => setOpen(false)}
            sx={{
                position: "fixed",
                top: "50%",
                left: 0,
                transform: "translateY(-50%)",
                zIndex: 1300,
                height: buttonHeight,
                display: "flex",
                alignItems: "center",
            }}
        >
            {/* Arrow Icon that triggers menu */}
            <Box
                sx={{
                    position: "fixed",
                    top: "50%",
                    left: open ? drawerWidth : 0,
                    transform: "translateY(-50%)",
                    zIndex: 1300,
                    transition: "left 0.3s ease",
                }}
            >
                <IconButton
                    sx={{
                        backgroundColor: COLOR.grayScale22,
                        color: COLOR.white,
                        marginLeft: "1rem",
                        borderRadius: "2rem",
                        height: "3vh", // button size
                        width: "3vh", // button size
                        fontSize: "3vh", // icon size
                        "&:hover": {
                            backgroundColor: COLOR.grayScale30,
                        },
                    }}
                    onClick={() => {
                        if (open) {
                            setOpen(false);
                            setOverride(true);
                            setTimeout(() => {
                                setOverride(false);
                            }, 300);
                        }
                    }}
                >
                    {open ? (
                        <ChevronLeftIcon fontSize="inherit" />
                    ) : (
                        <ChevronRightIcon fontSize="inherit" />
                    )}
                </IconButton>
            </Box>

            {/* Sliding Menu */}
            <Paper
                elevation={4}
                sx={{
                    position: "fixed",
                    top: "50%",
                    left: open ? 0 : -drawerWidth,
                    transform: "translateY(-50%)",
                    width: drawerWidth,
                    transition: "left 0.3s ease",
                    background: "none",
                    border: "none",
                    boxShadow: "none",
                    zIndex: 1200,
                    display: "flex",
                    alignItems: "center", // vertically center list
                }}
            >
                <List sx={{ paddingLeft: "0.5rem", userSelect: "none" }}>
                    {isMultiplayer ? (
                        <ListItem
                            component="button"
                            sx={{ cursor: "pointer" }}
                            onClick={() => setIsMultiplayer()}
                        >
                            <ListItemText primary="Leave space" />
                        </ListItem>
                    ) : (
                        <>
                            <ListItem
                                component="button"
                                sx={{ cursor: "pointer" }}
                                onClick={() => {
                                    requestJoinSpace("self");
                                }}
                            >
                                <ListItemText primary="Enter my 3D space" />
                            </ListItem>
                            {hasRemoteParticipants && (
                                <ListItem
                                    component="button"
                                    sx={{ cursor: "pointer" }}
                                    onClick={() => {
                                        requestJoinSpace("other");
                                    }}
                                >
                                    <ListItemText primary="Enter their 3D space" />
                                </ListItem>
                            )}
                        </>
                    )}
                </List>
            </Paper>
        </Box>
    );
};

export default LeftMenu;
