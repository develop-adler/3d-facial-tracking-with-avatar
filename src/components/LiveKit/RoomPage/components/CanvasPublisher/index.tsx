import { useEffect, type FC } from "react";

import { useLocalParticipant } from "@livekit/components-react";
import { ConnectionState, Track, type Room } from "livekit-client";

import { useSceneStore } from "@/stores/useSceneStore";

import { mediaStreamFrom3DCanvas } from "global";

type Props = {
    room: Room;
};

export const CanvasPublisher: FC<Props> = ({ room }) => {
    const { localParticipant } = useLocalParticipant();

    const coreScene = useSceneStore((state) => state.coreScene);

    useEffect(() => {
        const publishVideoTrack = async () => {
            if (!mediaStreamFrom3DCanvas) return;
            const publishedTrack = mediaStreamFrom3DCanvas.getVideoTracks()[0];
            await localParticipant.publishTrack(publishedTrack, {
                name: "avatar_video",
                source: Track.Source.Camera,
            });
        };

        if (room.state !== ConnectionState.Connected) {
            room.once("connected", () => publishVideoTrack());
        } else {
            publishVideoTrack();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coreScene]);

    return null;
};
