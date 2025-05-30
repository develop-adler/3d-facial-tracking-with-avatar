"use client";

import { useCallback, useState, type FC } from "react";

import { Fade, Box, Typography } from "@mui/material";

import {
    ModalTextField,
    ModalTextFieldContainer,
    ModalTitle,
    RandomNameButton,
    SubmitButton,
} from "./styles";

import type { RoomJoinInfo } from "@/models/multiplayer";

import { COLOR } from "constant";

type Props = {
    open: boolean;
    onSubmit: (data: RoomJoinInfo) => void;
};

export const JoinRoomModal: FC<Props> = ({ open, onSubmit }) => {
    const [room, setRoom] = useState<string>("");
    const [name, setName] = useState<string>("");
    const [sharedPassphrase, setSharedPassphrase] = useState<string>("");
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
            onSubmit({ room: room.trim(), name: name.trim(), passphrase: sharedPassphrase.trim() });
        }
    }, [room, name, sharedPassphrase, onSubmit]);

    return (
        // <Modal
        //     open={open}
        //     closeAfterTransition
        //     slots={{ backdrop: Backdrop }}
        //     slotProps={{
        //         backdrop: {
        //             timeout: 500,
        //             sx: {
        //                 backdropFilter: "blur(2px)",
        //                 backgroundColor: "rgba(0,0,0,0.4)",
        //             },
        //         },
        //     }}
        // >
        <div style={{ userSelect: "none" }}>
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
                    <ModalTitle>Input room name, username, and room passphrase</ModalTitle>
                    <Typography color="primary" sx={{ color: COLOR.black }}>
                        
                    </Typography>
                    <ModalTextFieldContainer>
                        <ModalTextField
                            type="text"
                            label="Room"
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            error={errors.room}
                            helperText={errors.room ? "Room is required" : ""}
                        />
                        <ModalTextField
                            type="password"
                            label="Shared Passphrase (for end-to-end encryption)"
                            value={sharedPassphrase}
                            onChange={(e) => setSharedPassphrase(e.target.value)}
                        />
                        <ModalTextField
                            type="text"
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
        </div>
    );
};
