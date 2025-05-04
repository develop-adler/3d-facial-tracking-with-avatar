"use client";

import { ChatContainer } from "@/components/LiveKit/RoomPage/components/ChatContainer";
import { VideoConferenceLayout } from "@/components/LiveKit/RoomPage/components/VideoConferenceLayout";

import { FlexBox } from "./styles";
import LoadingBar from "@/components/VirtualAvatarVideo/components/AvatarScene/components/LoadingBar";

export const MainConferenceBody = () => {
    return (
        <FlexBox>
            <LoadingBar isRoomPage />
            <VideoConferenceLayout />
            <ChatContainer />
        </FlexBox>
    );
};
