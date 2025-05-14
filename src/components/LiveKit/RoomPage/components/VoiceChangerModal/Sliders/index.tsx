"use client";

import { memo } from "react";

import {
    Box,
    Typography,
    Slider,
    MenuItem,
    Select,
    type SelectChangeEvent,
} from "@mui/material";

import type {
    EQType,
    PresetType,
} from "@/components/LiveKit/RoomPage/components/VoiceChangerModal/VoiceChanger";
import { useVoiceChangerStore } from "@/stores/useVoiceChangerStore";

import { COLOR } from "constant";

const GainSliderNonMemoed = () => {
    const gain = useVoiceChangerStore((state) => state.gain);
    const enabled = useVoiceChangerStore((state) => state.enabled);
    const setGain = useVoiceChangerStore((state) => state.setGain);
    return (
        <Box mb={1}>
            <Typography gutterBottom>Gain: {gain.toFixed(2)}</Typography>
            <Slider
                value={gain}
                min={0}
                max={20}
                step={0.01}
                onChange={(_, v) => setGain(v as number)}
                disabled={!enabled}
                sx={
                    enabled
                        ? {}
                        : {
                            color: "#888",
                            "& .MuiSlider-thumb": { backgroundColor: "#ccc" },
                            "& .MuiSlider-track": { backgroundColor: "#aaa" },
                        }
                }
            />
        </Box>
    );
};

const PitchSliderNonMemoed = () => {
    const pitch = useVoiceChangerStore((state) => state.pitch);
    const enabled = useVoiceChangerStore((state) => state.enabled);
    const setPitch = useVoiceChangerStore((state) => state.setPitch);
    return (
        <Box mb={1}>
            <Typography gutterBottom>Pitch (semitones): {pitch}</Typography>
            <Slider
                value={pitch}
                min={-12}
                max={12}
                step={1}
                onChange={(_, v) => setPitch(v as number)}
                disabled={!enabled}
                sx={
                    enabled
                        ? {}
                        : {
                            color: "#888",
                            "& .MuiSlider-thumb": { backgroundColor: "#ccc" },
                            "& .MuiSlider-track": { backgroundColor: "#aaa" },
                        }
                }
            />
        </Box>
    );
};

const ReverbSliderNonMemoed = () => {
    const reverbDecay = useVoiceChangerStore((state) => state.reverbDecay);
    const enabled = useVoiceChangerStore((state) => state.enabled);
    const setReverbDecay = useVoiceChangerStore((state) => state.setReverbDecay);
    return (
        <Box mb={1}>
            <Typography gutterBottom>Reverb Decay: {reverbDecay}</Typography>
            <Slider
                value={reverbDecay}
                min={0.01}
                max={10}
                step={0.1}
                onChange={(_, v) => setReverbDecay(v as number)}
                disabled={!enabled}
                sx={
                    enabled
                        ? {}
                        : {
                            color: "#888",
                            "& .MuiSlider-thumb": { backgroundColor: "#ccc" },
                            "& .MuiSlider-track": { backgroundColor: "#aaa" },
                        }
                }
            />
        </Box>
    );
};

const EQSlidersNonMemoed = () => {
    const eq = useVoiceChangerStore((state) => state.eq);
    const enabled = useVoiceChangerStore((state) => state.enabled);
    const setEq = useVoiceChangerStore((state) => state.setEq);

    return (
        <Box mb={3}>
            {["low", "mid", "high"].map((band) => (
                <Box key={band}>
                    <Typography gutterBottom>
                        EQ - {band.charAt(0).toUpperCase() + band.slice(1)}:{" "}
                        {eq[band as keyof EQType]}
                    </Typography>
                    <Slider
                        value={eq[band as keyof EQType]}
                        min={-20}
                        max={20}
                        step={1}
                        onChange={(_, v) => setEq({ ...eq, [band]: v as number })}
                        disabled={!enabled}
                        sx={
                            enabled
                                ? {}
                                : {
                                    color: "#888",
                                    "& .MuiSlider-thumb": { backgroundColor: "#ccc" },
                                    "& .MuiSlider-track": { backgroundColor: "#aaa" },
                                }
                        }
                    />
                </Box>
            ))}
        </Box>
    );
};

const PresetSelectorNonMemoed = () => {
    const enabled = useVoiceChangerStore((state) => state.enabled);
    const preset = useVoiceChangerStore((state) => state.preset);
    const setPreset = useVoiceChangerStore((state) => state.setPreset);

    const applyPreset = (value: PresetType): void => {
        setPreset(value);

        switch (value) {
            case "default": {
                useVoiceChangerStore.getState().setGain(1);
                useVoiceChangerStore.getState().setPitch(0);
                useVoiceChangerStore.getState().setReverbDecay(0.01);
                useVoiceChangerStore.getState().setEq({ low: 0, mid: 0, high: 0 });
                break;
            }
            case "robot": {
                useVoiceChangerStore.getState().setGain(1.2);
                useVoiceChangerStore.getState().setPitch(-6);
                useVoiceChangerStore.getState().setReverbDecay(0.01);
                useVoiceChangerStore.getState().setEq({ low: 10, mid: -10, high: -10 });
                break;
            }
            case "helium": {
                useVoiceChangerStore.getState().setGain(0.8);
                useVoiceChangerStore.getState().setPitch(8);
                useVoiceChangerStore.getState().setReverbDecay(0.01);
                useVoiceChangerStore.getState().setEq({ low: -5, mid: 0, high: 10 });
                break;
            }
            default: {
                break;
            }
        }
    };

    return (
        <Box>
            <Typography gutterBottom>Presets</Typography>
            <Select
                fullWidth
                value={preset}
                onChange={(e: SelectChangeEvent<string>) =>
                    applyPreset(e.target.value as PresetType)
                }
                disabled={!enabled}
                sx={{
                    color: COLOR.white,
                    ".MuiOutlinedInput-notchedOutline": {
                        borderColor: COLOR.grayScale82,
                    },
                    "&.Mui-disabled": {
                        color: COLOR.grayScale10,
                        ".MuiOutlinedInput-notchedOutline": {
                            borderColor: COLOR.grayScale52,
                        },
                    },
                    ".MuiSvgIcon-root": {
                        color: enabled ? COLOR.white : COLOR.grayScale10,
                    },
                }}
            >
                <MenuItem value="default">Default</MenuItem>
                <MenuItem value="robot">Robot</MenuItem>
                <MenuItem value="helium">Helium</MenuItem>
            </Select>
        </Box>
    );
};

export const GainSlider = memo(GainSliderNonMemoed);
export const PitchSlider = memo(PitchSliderNonMemoed);
export const ReverbSlider = memo(ReverbSliderNonMemoed);
export const EQSliders = memo(EQSlidersNonMemoed);
export const PresetSelector = memo(PresetSelectorNonMemoed);
