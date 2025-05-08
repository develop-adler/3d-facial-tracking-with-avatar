"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from "react";
import {
    LocalTrackPublication,
    RemoteTrackPublication,
    TrackPublication,
} from "livekit-client";

import type { Vector2 } from "@/models/3d";
import { useWebAudioContext } from "@/providers/audio/webAudio";
import { isMobile } from "@/utils/browserUtils";

export type TrackPosition = {
    trackPublication: TrackPublication;
    position: Vector2;
};

type SpatialAudioControllerProps = {
    trackPositions: TrackPosition[];
    myPosition: Vector2;
    maxHearableDistance: number;
};

export const SpatialAudioController: FC<SpatialAudioControllerProps> = ({
    trackPositions,
    myPosition,
    maxHearableDistance,
}) => {
    const audioContext = useWebAudioContext();

    // eslint-disable-next-line unicorn/no-null
    if (!audioContext) return null;

    return (
        <>
            {trackPositions.map((tp) => {
                return (
                    <SpatialPublicationPlayback
                        maxHearableDistance={maxHearableDistance}
                        key={`${tp.trackPublication.trackSid}`}
                        trackPublication={tp.trackPublication}
                        position={tp.position}
                        myPosition={myPosition}
                    />
                );
            })}
        </>
    );
};

type SpatialParticipantPlaybackProps = {
    maxHearableDistance: number;
    trackPublication: TrackPublication;
    myPosition: { x: number; y: number };
    position: { x: number; y: number };
};

const SpatialPublicationPlayback: FC<SpatialParticipantPlaybackProps> = ({
    maxHearableDistance,
    trackPublication,
    myPosition,
    position,
}) => {
    const distance = useMemo(() => {
        const dx = myPosition.x - position.x;
        const dy = myPosition.y - position.y;
        return Math.hypot(dx, dy);
    }, [myPosition.x, myPosition.y, position.x, position.y]);

    const hearable = useMemo(
        () => distance <= maxHearableDistance,
        [distance, maxHearableDistance]
    );

    // Selective subscription
    useEffect(() => {
        if (!(trackPublication instanceof RemoteTrackPublication)) {
            return;
        }
        trackPublication?.setSubscribed(hearable);
    }, [hearable, trackPublication]);

    return (
        <div>
            {hearable && (
                <PublicationRenderer
                    trackPublication={trackPublication}
                    position={position}
                    myPosition={myPosition}
                />
            )}
        </div>
    );
};

type PublicationRendererProps = {
    trackPublication: TrackPublication;
    position: { x: number; y: number };
    myPosition: { x: number; y: number };
};

function PublicationRenderer({
    trackPublication,
    position,
    myPosition,
}: PublicationRendererProps) {
    const mobile = useMemo<boolean>(() => isMobile(), []);

    const audioEl = useRef<HTMLAudioElement | null>(null);
    const audioContext = useWebAudioContext();
    const sourceNode = useRef<MediaStreamAudioSourceNode>(undefined);
    const panner = useRef<PannerNode>(undefined);
    const gain = useRef<GainNode>(undefined);
    const [relativePosition, setRelativePosition] = useState<{
        x: number;
        y: number;
    }>({
        x: 1000,
        y: 1000,
    }); // set as far away initially
    const mediaStream = usePublicationAudioMediaStream(trackPublication);

    const cleanupWebAudio = useCallback(() => {
        if (panner.current) panner.current.disconnect();
        if (sourceNode.current) sourceNode.current.disconnect();
        if (gain.current) gain.current.disconnect();

        gain.current = undefined;
        panner.current = undefined;
        sourceNode.current = undefined;
    }, []);

    // calculate relative position when position changes
    useEffect(() => {
        setRelativePosition(() => {
            return {
                x: position.x - myPosition.x,
                y: position.y - myPosition.y,
            };
        });
    }, [myPosition.x, myPosition.y, position.x, position.y]);

    // setup panner node for desktop
    useEffect(() => {
        cleanupWebAudio();

        if (
            !audioEl.current ||
            !mediaStream ||
            mediaStream.getAudioTracks().length === 0
        ) {
            return;
        }

        sourceNode.current = audioContext.createMediaStreamSource(mediaStream);

        // if on mobile, the panner node has no effect
        if (mobile) {
            gain.current = audioContext.createGain();
            gain.current.gain.setValueAtTime(0, 0);
            sourceNode.current
                .connect(gain.current)
                .connect(audioContext.destination);
        } else {
            panner.current = audioContext.createPanner();
            panner.current.coneOuterAngle = 360;
            panner.current.coneInnerAngle = 360;
            panner.current.positionX.setValueAtTime(relativePosition.x, 0); // set far away initially so we don't hear it at full volume
            panner.current.positionY.setValueAtTime(relativePosition.y, 0);
            panner.current.positionZ.setValueAtTime(0, 0);
            panner.current.distanceModel = "exponential";
            panner.current.coneOuterGain = 1;
            panner.current.refDistance = 100;
            panner.current.maxDistance = 500;
            panner.current.rolloffFactor = 2;
            sourceNode.current
                .connect(panner.current)
                .connect(audioContext.destination);
            audioEl.current.srcObject = mediaStream;
            audioEl.current.play();
        }

        return cleanupWebAudio;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        panner,
        mobile,
        trackPublication.track,
        cleanupWebAudio,
        audioContext,
        trackPublication,
        mediaStream,
    ]);

    // On mobile we use volume because panner nodes have no effect
    // https://developer.apple.com/forums/thread/696034
    useEffect(() => {
        if (!audioEl.current) return;

        // for mobile we use the gain node
        if (mobile) {
            if (!gain.current) return;
            const distance = Math.hypot(relativePosition.x, relativePosition.y);
            if (distance < 50) {
                gain.current.gain.setTargetAtTime(1, 0, 0.2);
            } else {
                if (distance > 250) {
                    gain.current.gain.setTargetAtTime(0, 0, 0.2);
                    return;
                }
                gain.current.gain.setTargetAtTime(1 - (distance - 50) / 200, 0, 0.2);
            }
        } else {
            if (!panner.current) return;
            panner.current.positionX.setTargetAtTime(relativePosition.x, 0, 0.02);
            panner.current.positionZ.setTargetAtTime(relativePosition.y, 0, 0.02);
        }
    }, [mobile, relativePosition.x, relativePosition.y, panner]);

    return <audio muted={true} ref={audioEl} />;
}

const usePublicationAudioMediaStream = (trackPublication: TrackPublication) => {
    const [mediaStream, setMediaStream] = useState<MediaStream>();

    useEffect(() => {
        trackPublication.on("subscribed", (track) => {
            if (track.kind !== "audio") return;
            setMediaStream(track.mediaStream);
        });

        if (
            !trackPublication.track ||
            trackPublication.track.mediaStream?.getAudioTracks().length === 0
        )
            return;

        if (trackPublication instanceof LocalTrackPublication) {
            setMediaStream(
                new MediaStream([trackPublication.track.mediaStreamTrack])
            );
        } else if (trackPublication.track?.mediaStream) {
            setMediaStream(trackPublication.track.mediaStream);
        }
    }, [trackPublication]);

    return mediaStream;
};
