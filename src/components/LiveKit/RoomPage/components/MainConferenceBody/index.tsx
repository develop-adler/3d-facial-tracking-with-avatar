"use client";

import { ChatContainer } from "@/components/LiveKit/RoomPage/components/ChatContainer";
import { VideoConferenceLayout } from "@/components/LiveKit/RoomPage/components/VideoConferenceLayout";

import { FlexBox } from "./styles";

export const MainConferenceBody = () => {
    return (
        <FlexBox>
            <VideoConferenceLayout />
            <ChatContainer />
        </FlexBox>
    );
};
