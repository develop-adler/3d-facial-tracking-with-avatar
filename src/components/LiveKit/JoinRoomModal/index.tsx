"use client";

import { type FC } from "react";

import { Modal, Backdrop, Fade } from "@mui/material";

import { MemoizedModalForm } from "@/components/LiveKit/JoinRoomModal/components/ModalForm";
import { ModalContainer, ModalTitle } from "./styles";

type Props = {
    open: boolean;
    onSubmit: (data: { room: string; name: string }) => void;
};
export const JoinRoomModal: FC<Props> = ({ open, onSubmit }) => {
    return (
        <Modal
            open={open}
            closeAfterTransition
            slots={{ backdrop: Backdrop }}
            slotProps={{
                backdrop: {
                    timeout: 500,
                    sx: {
                        backdropFilter: "blur(4px)",
                        backgroundColor: "rgba(0,0,0,0.3)",
                    },
                },
            }}
        >
            <Fade in={open}>
                <ModalContainer>
                    <ModalTitle>Please input room and name</ModalTitle>
                    <MemoizedModalForm
                        onSubmit={onSubmit}
                    />
                </ModalContainer>
            </Fade>
        </Modal>
    );
};
