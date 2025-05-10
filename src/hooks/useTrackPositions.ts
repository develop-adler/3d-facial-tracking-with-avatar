import { useMemo, useState } from "react";

import { TrackReference } from "@livekit/components-core";
import { useTracks } from "@livekit/components-react";
import { RoomEvent, Track, type Participant, type TrackPublication } from "livekit-client";

import { useAvatarStore } from "@/stores/useAvatarStore";
import type { RemoteAvatarAudioData } from "@/models/multiplayer";

export type TrackPositionAndAudioData = {
    trackPublication: TrackPublication;
    participant: Participant;
    audioData: RemoteAvatarAudioData;
};

export const useTrackPositions = () => {
    const [sourceFilter] = useState([Track.Source.Microphone]);
    const [sourceOptions] = useState({
        updateOnlyOn: [
            RoomEvent.TrackPublished,
            RoomEvent.TrackUnpublished,
            RoomEvent.ParticipantConnected,
            RoomEvent.Connected,
        ],
        onlySubscribed: false,
    });
    const trackParticipantPairs = useTracks(sourceFilter, sourceOptions);
    const remoteAvatarAudioPositions = useAvatarStore(
        (state) => state.remoteAvatarAudioPositions
    );
    const trackPositions: TrackPositionAndAudioData[] = useMemo(() => {
        const microphoneTrackLookup = new Map<string, TrackReference>();

        // Memoize all of the remote microphone tracks
        for (const tpp of trackParticipantPairs) {
            microphoneTrackLookup.set(tpp.participant.identity, tpp);
        }

        const res = remoteAvatarAudioPositions
            .filter((avatar) => microphoneTrackLookup.has(avatar.identity))
            .map((avatar) => {
                return {
                    trackPublication: microphoneTrackLookup.get(avatar.identity)!
                        .publication,
                    participant: microphoneTrackLookup.get(avatar.identity)!
                        .participant,
                    audioData: {
                        identity: avatar.identity,
                        position: avatar.position,
                        // rotation: avatar.rotation,
                        // forward: avatar.forward,
                        cameraPosition: avatar.cameraPosition,
                        cameraRotation: avatar.cameraRotation,
                    }
                };
            });

        return res;
    }, [trackParticipantPairs, remoteAvatarAudioPositions]);

    return trackPositions;
};
