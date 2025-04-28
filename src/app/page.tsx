import { VideoChat } from "@/app/components/VideoChat";
// import { VoiceChat } from "@/app/components/VoiceChat";
import { AvatarScene } from "@/app/components/AvatarScene";
import { ScreenControlButtons } from "@/app/components/ScreenControlButtons";
import { TopMenu } from "@/app/components/TopMenu";

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
