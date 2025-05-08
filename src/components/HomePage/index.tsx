"use client";

import { AvatarScene } from "@/components/AvatarScene";
import { AvatarFacialTracking } from "@/components/AvatarFacialTracking";
// import { VoiceChat } from "@/components/VirtualAvatarVideo/components/VoiceChat";
import { ScreenControlButtons } from "@/components/ScreenControlButtons";

const Page = () => {
  return (
    <>
      <ScreenControlButtons />
      <AvatarScene />
      <AvatarFacialTracking />
    </>
  );
}

export default Page;