"use client";

import { useMemo } from "react";

import { SpatialPublicationRenderer } from "@/components/LiveKit/SpatialPublicationRenderer";
import { useTrackPositions } from "@/hooks/useTrackPositions";

const SpatialAudioController = () => {
    const audioContext = useMemo(() => new AudioContext(), []);
    const trackPositions = useTrackPositions();

    return (
        <>
            {trackPositions.map((tp) => {
                return (
                    <SpatialPublicationRenderer
                        key={`${tp.trackPublication.trackSid}`}
                        trackPublication={tp.trackPublication}
                        remoteAudioData={tp.audioData}
                        audioContext={audioContext}
                    />
                );
            })}
        </>
    );
};

export default SpatialAudioController;
