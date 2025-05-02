"use client";

import { memo, useCallback, useState } from "react";

import {
    ModalTextFieldContainer,
    ModalTextField,
    RandomNameButton,
    SubmitButton,
} from "./styles";
import type { RoomAndName } from "@/api/entities";

const ModalForm = ({
    onSubmit,
}: {
    onSubmit: (roomAndName: RoomAndName) => void;
}) => {
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
        <>
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
            <SubmitButton onClick={handleSubmit}>Submit</SubmitButton>
        </>
    );
};

export const MemoizedModalForm = memo(ModalForm);
