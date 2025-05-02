import { VideoChat } from "@/components/VideoChat";
// import { VoiceChat } from "@/components/VoiceChat";
import { AvatarScene } from "@/components/AvatarScene";
import { ScreenControlButtons } from "@/components/ScreenControlButtons";
import { TopMenu } from "@/components/TopMenu";

export default function Home() {
  return (
    <>
      <TopMenu />
      <ScreenControlButtons />
      <AvatarScene />
      <VideoChat />
      {/* <VoiceChat /> */}
    </>
  );
}
