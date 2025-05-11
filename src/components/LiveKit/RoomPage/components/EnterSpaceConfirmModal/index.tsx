import { type FC } from "react";

import { Modal, Box, Typography, Button, Fade } from "@mui/material";

import { COLOR } from "constant";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import eventBus from "@/eventBus";

const EnterSpaceConfirmModal: FC = () => {
    const openJoinSpaceModal = useLiveKitStore(
        (state) => state.openJoinSpaceModal
    );

    const onEnter = () => {
        eventBus.emitWithEvent("multiplayer:confirmJoinSpace", {
            identity: useLiveKitStore.getState().room.localParticipant.identity,
            confirm: true,
        });
        useLiveKitStore.getState().setOpenJoinSpaceModal();
    };

    const onDeny = () => {
        eventBus.emitWithEvent("multiplayer:confirmJoinSpace", {
            identity: useLiveKitStore.getState().room.localParticipant.identity,
            confirm: false,
        });
        useLiveKitStore.getState().setOpenJoinSpaceModal();
    };

    return (
        <>
            <style>
                {`
                    @keyframes popIn {
                        from {
                        opacity: 0;
                        transform: scale(0.85);
                        }
                        to {
                        opacity: 1;
                        transform: scale(1);
                        }
                    }
            `}
            </style>
            <Modal open={!!openJoinSpaceModal} onClose={onDeny} closeAfterTransition>
                <Fade in={!!openJoinSpaceModal}>
                    <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        height="100vh"
                    >
                        <Box
                            sx={{
                                bgcolor: "background.paper",
                                borderRadius: 2,
                                boxShadow: 5,
                                p: 4,
                                textAlign: "center",
                                minWidth: 300,
                                animation: "popIn 0.3s ease-out",
                            }}
                        >
                            <Typography variant="h5" mb={3} color="textPrimary">
                                {openJoinSpaceModal?.spaceType === "self" ? (
                                    <>
                                        <b>{openJoinSpaceModal?.identity}</b> has invited you to
                                        join their space
                                    </>
                                ) : (
                                    <>
                                        <b>{openJoinSpaceModal?.identity}</b> has requested to join
                                        your space
                                    </>
                                )}
                            </Typography>
                            <Box display="flex" gap={4} justifyContent="center">
                                <Button variant="outlined" onClick={onDeny}>
                                    Deny
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={onEnter}
                                    sx={{
                                        bgcolor: COLOR.brandPrimary,
                                        color: COLOR.white,
                                        "&:hover": {
                                            bgcolor: COLOR.brandPrimaryHover2,
                                        },
                                    }}
                                >
                                    Enter
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                </Fade>
            </Modal>
        </>
    );
};

export default EnterSpaceConfirmModal;
