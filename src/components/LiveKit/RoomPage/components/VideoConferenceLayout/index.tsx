"use client";

import {
    GridLayout,
    ParticipantTile,
    useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";

import { useChatToggleStore } from "@/stores/useChatToggle";

import { ROOM_CHAT_WIDTH } from "constant";

export const VideoConferenceLayout = () => {
    // `useTracks` returns all camera and screen share tracks. If a user
    // joins without a published camera track, a placeholder track is returned.
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );

    const isChatOpen = useChatToggleStore(state => state.isChatOpen);

    return (
        <GridLayout
            tracks={tracks}
            // reduce height of grid layout to account for the control bar
            // and make it responsive to the control bar height
            style={{
                flexGrow: 1,
                width: "100%",
                height: "calc(100vh - var(--lk-control-bar-height))",
                transition: "margin-right 0.3s ease",
                marginRight: isChatOpen ? ROOM_CHAT_WIDTH : 0,
            }}
        >
            {/* The GridLayout accepts zero or one child. The child is used
                as a template to render all passed in tracks. */}
            <ParticipantTile />
        </GridLayout>
    );
};
