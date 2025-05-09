import { useEffect, type FC } from "react";

import { useIsSpeaking } from "@livekit/components-react";
import type { Room } from "livekit-client";

import type Avatar from "@/3d/avatar/Avatar";

type Props = {
    room: Room;
    avatar: Avatar;
}

const AvatarSpeakingHandler: FC<Props> = ({ room }) => {
    const isSpeaking = useIsSpeaking(room.localParticipant);
    useEffect(() => {
        if (isSpeaking) {
            console.log("Avatar is speaking");
            // avatar.setSpeaking(true);
        } else {
            console.log("Avatar is not speaking");
            // avatar.setSpeaking(false);
        }
    }, [isSpeaking]);
    // eslint-disable-next-line unicorn/no-null
    return null;
};

export default AvatarSpeakingHandler;