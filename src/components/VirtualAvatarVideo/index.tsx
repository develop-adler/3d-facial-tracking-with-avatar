"use client";

import { AvatarScene } from "@/components/VirtualAvatarVideo/components/AvatarScene";
import { VideoChat } from "@/components/VirtualAvatarVideo/components/VideoChat";
// import { VoiceChat } from "@/components/VirtualAvatarVideo/components/VoiceChat";

export const VirtualAvatarVideo = () => {
  return (
    <>
      <AvatarScene />
      <VideoChat />
      {/* <VoiceChat /> */}
    </>
  );
};
