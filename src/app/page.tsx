import { VideoChat } from "@/app/components/VideoChat";
// import { VoiceChat } from "@/app/components/VoiceChat";
import { AvatarScene } from "@/app/components/AvatarScene";

export default function Home() {
  return (
    <>
      <AvatarScene />
      <VideoChat />
      {/* <VoiceChat /> */}
    </>
  );
}
