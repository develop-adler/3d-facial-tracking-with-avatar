import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from "react";
import { LocalTrackPublication, type TrackPublication } from "livekit-client";

import type { Vector2 } from "@/models/3d";

type Props = {
    trackPublication: TrackPublication;
    position: Vector2;
    myPosition: Vector2;
    audioContext: AudioContext;
};

export const SpatialPublicationRenderer: FC<Props> = ({
    trackPublication,
    position,
    myPosition,
    audioContext,
}) => {
    const [relativePosition, setRelativePosition] = useState<{
        x: number;
        y: number;
    }>({
        x: 1000,
        y: 1000,
    }); // Set as very far away for our initial values

    const audioEl = useRef<HTMLAudioElement>(null);
    const sourceNode = useRef<MediaStreamAudioSourceNode>(undefined);
    const panner = useRef<PannerNode>(undefined);

    // Get the media stream from the track publication
    const mediaStream = useMemo(() => {
        if (
            trackPublication instanceof LocalTrackPublication &&
            trackPublication.track
        ) {
            const mediaStreamTrack = trackPublication.track.mediaStreamTrack;
            return new MediaStream([mediaStreamTrack]);
        }

        return trackPublication.track?.mediaStream ?? undefined;
    }, [trackPublication]);

    // Cleanup function for all of the WebAudio nodes we made
    const cleanupWebAudio = useCallback(() => {
        if (panner.current) panner.current.disconnect();
        if (sourceNode.current) sourceNode.current.disconnect();

        panner.current = undefined;
        sourceNode.current = undefined;
    }, []);

    // Calculate relative position when position changes
    useEffect(() => {
        setRelativePosition((_prev) => {
            return {
                x: position.x - myPosition.x,
                y: position.y - myPosition.y,
            };
        });
    }, [myPosition.x, myPosition.y, position.x, position.y]);

    // Setup panner node for desktop
    useEffect(() => {
        // Cleanup any other nodes we may have previously created
        cleanupWebAudio();

        // Early out if we're missing anything
        if (!audioEl.current || !trackPublication.track || !mediaStream)
            return cleanupWebAudio;

        // Create the entry-node into WebAudio.
        // This turns our mediaStream into a usable WebAudio node.
        sourceNode.current = audioContext.createMediaStreamSource(mediaStream);

        // Initialize the PannerNode and its values
        panner.current = audioContext.createPanner();
        panner.current.coneOuterAngle = 360;
        panner.current.coneInnerAngle = 360;
        panner.current.positionX.setValueAtTime(1000, 0); // set far away initially so we don't hear it at full volume
        panner.current.positionY.setValueAtTime(0, 0);
        panner.current.positionZ.setValueAtTime(0, 0);
        panner.current.distanceModel = "exponential";
        panner.current.coneOuterGain = 1;
        panner.current.refDistance = 100;
        panner.current.maxDistance = 500;
        panner.current.rolloffFactor = 2;

        // Connect the nodes to each other
        sourceNode.current
            .connect(panner.current)
            .connect(audioContext.destination);

        // Attach the mediaStream to an AudioElement. This is just a
        // quirky requirement of WebAudio to get the pipeline to play
        // when dealing with MediaStreamAudioSource nodes
        audioEl.current.srcObject = mediaStream;
        audioEl.current.play();

        return cleanupWebAudio;
    }, [
        panner,
        trackPublication.track,
        cleanupWebAudio,
        audioContext,
        trackPublication,
        mediaStream,
    ]);

    // Update the PannerNode's position values to our calculated relative position.
    useEffect(() => {
        if (!audioEl.current || !panner.current) return;
        panner.current.positionX.setTargetAtTime(relativePosition.x, 0, 0.02);
        panner.current.positionZ.setTargetAtTime(relativePosition.y, 0, 0.02);
    }, [relativePosition.x, relativePosition.y, panner]);

    return <audio muted={true} ref={audioEl} />;
};
