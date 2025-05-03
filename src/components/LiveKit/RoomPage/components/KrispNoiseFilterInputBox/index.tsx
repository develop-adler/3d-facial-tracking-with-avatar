import { useEffect, useRef, useState } from "react";

import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { useLocalParticipant } from "@livekit/components-react";
import {
    isKrispNoiseFilterSupported,
    type KrispNoiseFilterProcessor,
} from "@livekit/krisp-noise-filter";
import { Checkbox, FormControlLabel } from "@mui/material";
import { LocalAudioTrack, Track } from "livekit-client";

import { COLOR } from "constant";

export const KrispNoiseFilterInputBox = () => {
    const { microphoneTrack } = useLocalParticipant();
    const { isNoiseFilterEnabled, isNoiseFilterPending, setNoiseFilterEnabled } =
        useKrispNoiseFilter();

    const [isKrispSupported] = useState<boolean>(isKrispNoiseFilterSupported());
    const [checked, setChecked] = useState<boolean>(isNoiseFilterEnabled);

    const currentMicTrackRef = useRef<LocalAudioTrack | null>(null);
    const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);

    useEffect(() => {
        if (!microphoneTrack?.track) {
            krispProcessorRef.current?.destroy();
            return;
        }

        (async () => {
            // dynamic import to only load the required resources when enabling the plugin
            const { KrispNoiseFilter } = await import("@livekit/krisp-noise-filter");

            if (
                microphoneTrack.source === Track.Source.Microphone &&
                microphoneTrack.track instanceof LocalAudioTrack
            ) {
                currentMicTrackRef.current = microphoneTrack.track;

                if (!isKrispSupported) {
                    console.warn(
                        "Krisp noise filter is currently not supported on this browser"
                    );
                    return;
                }

                // Once instantiated, the filter will begin initializing and will download additional resources
                krispProcessorRef.current = KrispNoiseFilter();

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (currentMicTrackRef.current as any).setProcessor(
                    krispProcessorRef.current
                );
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [microphoneTrack]);

    useEffect(() => {
        if (!isNoiseFilterPending) krispProcessorRef.current?.setEnabled(checked);
    }, [checked, isNoiseFilterPending]);

    useEffect(() => {
        return () => {
            krispProcessorRef.current?.destroy();
        };
    }, []);

    if (!isKrispSupported) return null;

    return (
        <FormControlLabel
            onClick={(e) => {
                if (isNoiseFilterPending || !microphoneTrack?.track) {
                    e.preventDefault();
                    return;
                }
                setChecked((prev) => {
                    setNoiseFilterEnabled(!prev);
                    return !prev;
                });
            }}
            control={
                <Checkbox
                    name="krispNoiseFilter"
                    onChange={(e) => {
                        if (isNoiseFilterPending || !microphoneTrack?.track) {
                            e.preventDefault();
                            return;
                        }
                        setChecked(e.target.checked);
                        setNoiseFilterEnabled(e.target.checked);
                    }}
                    checked={checked}
                    sx={{
                        color: COLOR.white,
                        cursor:
                            isNoiseFilterPending || !microphoneTrack?.track
                                ? "not-allowed"
                                : "pointer",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        MozUserSelect: "none",
                        msUserSelect: "none",
                    }}
                    size="large"
                />
            }
            sx={{
                color: COLOR.white,
                cursor:
                    isNoiseFilterPending || !microphoneTrack?.track
                        ? "not-allowed"
                        : "pointer",
                userSelect: "none",
                WebkitUserSelect: "none",
                MozUserSelect: "none",
                msUserSelect: "none",
            }}
            label={isNoiseFilterPending ? "Enabling" : "Krisp Noise Filter"}
        />
    );
};
