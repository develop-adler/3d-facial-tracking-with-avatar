"use client";

import { useState, type FC } from "react";
import {
    Typography,
    TextField,
    Box,
    IconButton,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";

import { COLOR } from "constant";

type Props = {
    title: string;
    isFrozen?: boolean;
};

const Section: FC<Props> = ({ title, isFrozen }) => {
    const [locks, setLocks] = useState<Record<string, boolean>>({
        X: false,
        Y: false,
        Z: false,
    });

    const toggleLock = (axis: string) => {
        setLocks((prev) => ({
            ...prev,
            [axis]: !prev[axis],
        }));
    };

    return (
        <>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                {title}
            </Typography>
            {["X", "Y", "Z"].map((axis) => (
                <Box
                    key={axis}
                    display="flex"
                    alignItems="center"
                    // mb={0.5}
                    sx={{ color: COLOR.grayScale85 }}
                    color="primary"
                >
                    <Typography
                        sx={{ width: 20, color: COLOR.grayScale85 }}
                        color="primary"
                    >
                        {axis}
                    </Typography>
                    <TextField
                        size="small"
                        variant="outlined"
                        fullWidth
                        disabled={isFrozen || locks[axis]} // disable when frozen or locked
                        sx={{
                            mx: 1,
                            color: COLOR.grayScale85,
                            "& .MuiInputBase-input": {
                                textAlign: "center",
                                color: COLOR.grayScale85,
                            },
                            "& .Mui-disabled": {
                                color: COLOR.grayScale60,
                                WebkitTextFillColor: COLOR.grayScale60,
                            },
                            "& .MuiOutlinedInput-notchedOutline": {
                                borderColor: COLOR.grayScale60,
                            },
                            "&:hover .MuiOutlinedInput-notchedOutline": {
                                borderColor: COLOR.grayScale60,
                            },
                        }}
                        color="primary"
                        slotProps={{
                            htmlInput: {
                                style: {
                                    textAlign: "center",
                                    padding: "4px 8px",
                                    fontSize: "0.875rem",
                                },
                            },
                        }}
                        defaultValue={title === "Scale" ? "1.000" : "0"}
                    />

                    <IconButton size="small" onClick={() => toggleLock(axis)}>
                        {isFrozen || locks[axis] ? (
                            <LockIcon sx={{ color: COLOR.grayScale85 }} />
                        ) : (
                            <LockOpenIcon sx={{ color: COLOR.grayScale85 }} />
                        )}
                    </IconButton>
                </Box>
            ))}
        </>
    );
};

export default Section;
