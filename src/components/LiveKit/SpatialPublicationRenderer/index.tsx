import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from "react";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LocalTrackPublication, type TrackPublication } from "livekit-client";

import type { ObjectTransform } from "@/models/3d";
import type { RemoteAvatarAudioData } from "@/models/multiplayer";
import { useAvatarStore } from "@/stores/useAvatarStore";

function getAudioRelativePosition(
    cameraPosition: ObjectTransform,
    myAvatarPosition: ObjectTransform,
    remoteAvatarPosition: ObjectTransform
): ObjectTransform {
    const camPos = Vector3.FromArray(cameraPosition);
    const myPos = Vector3.FromArray(myAvatarPosition);
    const remotePos = Vector3.FromArray(remoteAvatarPosition);

    const avatarToRemote = remotePos.subtract(myPos); // distance for volume
    const toRemoteDir = remotePos.subtract(camPos).normalize(); // direction for panning

    const forward = myPos.subtract(camPos).normalize(); // camera forward
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();
    const up = Vector3.Cross(forward, right).normalize();

    // Get directional components (unit vector in camera space)
    const x = Vector3.Dot(toRemoteDir, right);
    const y = Vector3.Dot(toRemoteDir, up);
    const z = Vector3.Dot(toRemoteDir, forward);

    const distance = avatarToRemote.length(); // actual spatial distance between avatars

    // Scale the direction vector to match avatar distance
    return [x * distance, y * distance, z * distance];
}

type Props = {
    trackPublication: TrackPublication;
    remoteAudioData: RemoteAvatarAudioData;
    audioContext: AudioContext;
};

export const SpatialPublicationRenderer: FC<Props> = ({
    trackPublication,
    remoteAudioData,
    audioContext,
}) => {
    const myAudioData = useAvatarStore((state) => state.avatarAudioPosition);

    const [relativePosition, setRelativePosition] = useState<ObjectTransform>([
        999, 999, 999,
    ]); // Set as very far away for our initial values

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
        setRelativePosition(
            getAudioRelativePosition(
                myAudioData.cameraPosition,
                myAudioData.position,
                remoteAudioData.position
            )
        );
    }, [
        myAudioData.position,
        myAudioData.cameraPosition,
        remoteAudioData.position,
    ]);

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
        panner.current.coneOuterGain = 1;
        panner.current.refDistance = 1; // 0.5 meter
        panner.current.maxDistance = 50; // 50 meters
        panner.current.distanceModel = "exponential";
        panner.current.rolloffFactor = 1.2;
        panner.current.panningModel = "HRTF"; // Use HRTF for 3D audio

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
        panner.current.positionX.setTargetAtTime(relativePosition[0], 0, 0.02);
        panner.current.positionY.setTargetAtTime(relativePosition[1], 0, 0.02);
        panner.current.positionZ.setTargetAtTime(relativePosition[2], 0, 0.02);
    }, [relativePosition, panner]);

    return <audio muted={true} ref={audioEl} />;
};
