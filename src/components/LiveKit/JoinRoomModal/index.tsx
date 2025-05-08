"use client";

import { useCallback, useState, type FC } from "react";

import { Modal, Backdrop, Fade, Box } from "@mui/material";

import {
    ModalTextField,
    ModalTextFieldContainer,
    ModalTitle,
    RandomNameButton,
    SubmitButton,
} from "./styles";

import type { RoomAndName } from "@/models/multiplayer";

import { COLOR } from "constant";

type Props = {
    open: boolean;
    onSubmit: (data: RoomAndName) => void;
};

export const JoinRoomModal: FC<Props> = ({ open, onSubmit }) => {
    const [room, setRoom] = useState("");
    const [name, setName] = useState("");
    const [errors, setErrors] = useState({ room: false, name: false });

    const handleRandomName = useCallback(() => {
        const randomNum = Math.floor(Math.random() * 1000) + 1;
        setName(`anonymous_${randomNum}`);
    }, []);

    const handleSubmit = useCallback(() => {
        const hasError = {
            room: room.trim() === "",
            name: name.trim() === "",
        };
        setErrors(hasError);
        if (!hasError.room && !hasError.name) {
            onSubmit({ room: room.trim(), name: name.trim() });
        }
    }, [room, name, onSubmit]);

    return (
        <Modal
            open={open}
            closeAfterTransition
            slots={{ backdrop: Backdrop }}
            slotProps={{
                backdrop: {
                    timeout: 500,
                    sx: {
                        backdropFilter: "blur(2px)",
                        backgroundColor: "rgba(0,0,0,0.4)",
                    },
                },
            }}
        >
            <Fade in={open}>
                <Box
                    component="form"
                    acceptCharset="utf8"
                    // autoComplete="off"
                    sx={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "50%",
                        height: "auto",
                        backgroundColor: COLOR.white,
                        borderRadius: "1rem",
                        boxShadow: "",
                        padding: "1rem",
                        gap: "0.5rem",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center", // centered inner elements vertically
                        alignItems: "center", // centered inner elements horizontally
                    }}
                    onSubmit={(e) => {
                        e.preventDefault();
                    }}
                >
                    <ModalTitle>Please input room and name</ModalTitle>
                    <ModalTextFieldContainer>
                        <ModalTextField
                            label="Room"
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            error={errors.room}
                            helperText={errors.room ? "Room is required" : ""}
                        />
                        <ModalTextField
                            label="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            error={errors.name}
                            helperText={errors.name ? "Name is required" : ""}
                        />
                        <RandomNameButton onClick={handleRandomName}>
                            Use random name
                        </RandomNameButton>
                    </ModalTextFieldContainer>
                    <SubmitButton type="submit" onClick={handleSubmit}>
                        Submit
                    </SubmitButton>
                </Box>
            </Fade>
        </Modal>
    );
};
