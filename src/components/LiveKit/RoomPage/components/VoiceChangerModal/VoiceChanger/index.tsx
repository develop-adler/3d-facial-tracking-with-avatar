"use client";
import { useCallback, useEffect, useRef, useState, type FC } from "react";

import {
  Typography,
  Box,
  Button,
  Stack,
  FormControlLabel,
  Switch,
} from "@mui/material";
import * as Tone from "tone";

import {
  EQSliders,
  GainSlider,
  PitchSlider,
  PresetSelector,
  ReverbSlider,
} from "@/components/LiveKit/RoomPage/components/VoiceChangerModal/Sliders";
import { useVoiceChangerStore } from "@/stores/useVoiceChangerStore";

import { COLOR } from "constant";

export type EQType = {
  low: number;
  mid: number;
  high: number;
};
export type PresetType = "default" | "robot" | "helium";

const VoiceChanger: FC = () => {
  const [started, setStarted] = useState<boolean>(false);

  const enabled = useVoiceChangerStore((state) => state.enabled);

  const micRef = useRef<Tone.UserMedia>(undefined);
  const gainRef = useRef<Tone.Gain>(undefined);
  const pitchShiftRef = useRef<Tone.PitchShift>(undefined);
  const reverbRef = useRef<Tone.Reverb>(undefined);
  const eqRef = useRef<Tone.EQ3>(undefined);

  const start = useCallback(async (): Promise<void> => {
    await Tone.start();

    const mic = new Tone.UserMedia();
    await mic.open();
    micRef.current = mic;

    const pitchShift = new Tone.PitchShift({
      pitch: useVoiceChangerStore.getState().pitch,
    });
    const eq3 = new Tone.EQ3(
      useVoiceChangerStore.getState().eq.low,
      useVoiceChangerStore.getState().eq.mid,
      useVoiceChangerStore.getState().eq.high
    );
    const reverb = new Tone.Reverb({
      decay: useVoiceChangerStore.getState().reverbDecay,
    });
    const gainNode = new Tone.Gain(
      useVoiceChangerStore.getState().gain
    ).toDestination();

    if (enabled) {
      mic.connect(pitchShift);
      pitchShift.connect(eq3);
      eq3.connect(reverb);
      reverb.connect(gainNode);
    } else {
      mic.connect(gainNode);
    }

    pitchShiftRef.current = pitchShift;
    eqRef.current = eq3;
    reverbRef.current = reverb;
    gainRef.current = gainNode;

    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = (): void => {
    micRef.current?.disconnect();
    pitchShiftRef.current?.dispose();
    reverbRef.current?.dispose();
    eqRef.current?.dispose();
    gainRef.current?.dispose();

    micRef.current = undefined;
    pitchShiftRef.current = undefined;
    reverbRef.current = undefined;
    eqRef.current = undefined;
    gainRef.current = undefined;

    setStarted(false);
  };

  const updateAudioParams = (
    pitch: number,
    gain: number,
    reverbDecay: number,
    eq: EQType,
  ): void => {
    if (!started || !enabled) return;

    if (pitchShiftRef.current)
      pitchShiftRef.current.pitch = pitch;
    if (reverbRef.current)
      reverbRef.current.decay = reverbDecay;
    if (gainRef.current)
      gainRef.current.gain.value = gain;

    if (eqRef.current) {
      eqRef.current.low.value = eq.low;
      eqRef.current.mid.value = eq.mid;
      eqRef.current.high.value = eq.high;
    }
  };

  return (
    <Box
      p={4}
      sx={{
        backgroundColor: COLOR.grayScale10,
        borderRadius: 4,
        boxShadow: 3,
        position: "relative",
        maxWidth: 400,
        margin: "auto",
        color: COLOR.white,
        userSelect: "none",
      }}
    >
      <Typography variant="h5" gutterBottom>
        🎤 Voice Changer
      </Typography>

      <Stack direction="row" spacing={2} mb={2}>
        <Button variant="contained" onClick={started ? stop : start}>
          {started ? "Stop" : "Start"}
        </Button>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(_, checked) =>
                useVoiceChangerStore.getState().setEnabled(checked)
              }
            />
          }
          label="Effects"
        />
      </Stack>

      <GainSlider />
      <PitchSlider />
      <ReverbSlider />
      <EQSliders />
      <PresetSelector />

      <AudioParamUpdater updateAudioParams={updateAudioParams} />
    </Box>
  );
};

const AudioParamUpdater: FC<{ updateAudioParams: (
    pitch: number,
    gain: number,
    reverbDecay: number,
    eq: EQType,
  ) => void }> = ({
  updateAudioParams,
}) => {
  const enabled = useVoiceChangerStore((state) => state.enabled);
  const pitch = useVoiceChangerStore((state) => state.pitch);
  const gain = useVoiceChangerStore((state) => state.gain);
  const reverbDecay = useVoiceChangerStore((state) => state.reverbDecay);
  const eq = useVoiceChangerStore((state) => state.eq);

  useEffect(() => {
    updateAudioParams(pitch, gain, reverbDecay, eq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pitch, gain, reverbDecay, eq]);

  // eslint-disable-next-line unicorn/no-null
  return null;
};

export default VoiceChanger;
