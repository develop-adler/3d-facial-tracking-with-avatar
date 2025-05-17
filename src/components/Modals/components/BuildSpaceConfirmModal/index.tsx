import { type FC } from "react";

import { Modal, Box, Typography, Button, Fade } from "@mui/material";

import { COLOR } from "constant";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import eventBus from "@/eventBus";

const BuildSpaceConfirmModal: FC = () => {
    const openBuildSpaceModal = useLiveKitStore(
        (state) => state.openBuildSpaceModal
    );

    const onConfirm = () => {
        eventBus.emitWithEvent("multiplayer:confirmBuildSpace", {
            identity: useLiveKitStore.getState().room.localParticipant.identity,
            confirm: true,
        });
        useLiveKitStore.getState().setOpenBuildSpaceModal();
    };

    const onDeny = () => {
        eventBus.emitWithEvent("multiplayer:confirmBuildSpace", {
            identity: useLiveKitStore.getState().room.localParticipant.identity,
            confirm: false,
        });
        useLiveKitStore.getState().setOpenBuildSpaceModal();
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
            <Modal open={!!openBuildSpaceModal} onClose={onDeny} closeAfterTransition>
                <Fade in={!!openBuildSpaceModal}>
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
                                {openBuildSpaceModal?.origin === "self" ? (
                                    <>
                                        <b>{openBuildSpaceModal?.identity}</b> has invited you to
                                        join their space
                                    </>
                                ) : (
                                    <>
                                        <b>{openBuildSpaceModal?.identity}</b> has requested to join
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
                                    onClick={onConfirm}
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

export default BuildSpaceConfirmModal;
