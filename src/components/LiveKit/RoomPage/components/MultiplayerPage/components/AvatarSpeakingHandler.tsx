import { useEffect, type FC } from "react";

import { useIsSpeaking } from "@livekit/components-react";
import type { Room } from "livekit-client";

import type Avatar from "@/3d/avatar/Avatar";

type Props = {
    room: Room;
    avatar: Avatar;
}

const AvatarSpeakingHandler: FC<Props> = ({ avatar, room }) => {
    const isSpeaking = useIsSpeaking(room.localParticipant);

    useEffect(() => {
        avatar.voiceBubble?.setVisible(isSpeaking);
        return () => {
            avatar.voiceBubble?.setVisible(false);
        }
    }, [isSpeaking, avatar.voiceBubble]);

    // eslint-disable-next-line unicorn/no-null
    return null;
};

export default AvatarSpeakingHandler;