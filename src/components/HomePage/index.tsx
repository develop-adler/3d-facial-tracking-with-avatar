"use client";

import { AvatarScene } from "@/components/AvatarScene";
// import { VoiceChat } from "@/components/VirtualAvatarVideo/components/VoiceChat";
import { ScreenControlButtons } from "@/components/ScreenControlButtons";

const Page = () => {
  return (
    <>
      <ScreenControlButtons />
      <AvatarScene />
    </>
  );
}

export default Page;