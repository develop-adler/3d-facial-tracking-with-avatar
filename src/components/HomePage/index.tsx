"use client";

import { useRouter } from "next/navigation";

import { Box, Button, Link, List, ListItem, Typography } from "@mui/material";

import { AvatarScene } from "@/components/AvatarScene";
import LoadingBar from "@/components/AvatarScene/components/LoadingBar";
// import { VoiceChat } from "@/components/VirtualAvatarVideo/components/VoiceChat";
// import { ScreenControlButtons } from "@/components/ScreenControlButtons";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

const Page = () => {
  const router = useRouter();
  return (
    <Box
      sx={{
        position: "absolute",
        top: TOP_MENU_HEIGHT,
        height: `calc(100vh - ${TOP_MENU_HEIGHT})`,
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <Typography variant="h1" sx={{ position: "relative", top: "10%", userSelect: "none" }}>
        Welcome to 3D video chat demo
      </Typography>
      {/* <ScreenControlButtons /> */}

      <Box
        sx={{
          position: "absolute",
          top: "25%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box
          maxWidth="50vw"
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 2,
            backgroundColor: COLOR.grayScale10,
            borderRadius: 4,
            boxShadow: 3,
            color: COLOR.white,
            userSelect: "none",
          }}
        >
          <br />
          <br />
          <Typography variant="h5">
            Please enable and allow camera access to use 3D avatar facial
            tracking. This application is{" "}
            <b>
              <i>
                currently all on-device and does not have any server-side
                processing
              </i>
            </b>
            . Video and voice call, messaging, and multiplayer service is
            powered by{" "}
            <Link
              target="_blank"
              rel="noopener noreferrer"
              href="https://livekit.io/"
              underline="hover"
            >
              LiveKit
            </Link>{" "}
            using WebRTC.
            <br />
            <br />
            <List>
              Current features:
              <ListItem>
                • Call room: Create/Join video and voice chat room
              </ListItem>
              <ListItem>
                • Avatar: Create Ready Player Me avatar and use the custom
                avatar for video chat, you may also select an avatar from list
                of preset avatars
              </ListItem>
              <ListItem>
                • Multiplayer: Enter 3D space with users within the room
              </ListItem>
              <ListItem>
                • Messaging: You can send messages to other users within the
                room
              </ListItem>
              <ListItem>
                • Spatial audio voice chat: While in 3D space, voice chatting
                will be 3D spatial audio
              </ListItem>
            </List>
          </Typography>
        </Box>
        <Box
          sx={{
            width: "50vw",
            height: "50vh",
            border: `4px solid ${COLOR.brandPrimary}`,
          }}
        >
          <LoadingBar />
          <AvatarScene />
        </Box>
      </Box>

      <Button
        style={{
          position: "absolute",
          bottom: "8%",
          backgroundColor: COLOR.brandPrimary,
          color: COLOR.white,
          border: "none",
          borderRadius: "1rem",
          padding: "1rem 2rem",
          fontSize: "2rem"
        }}
        onClick={() => {
          router.push("/room");
        }}
      >
        Join a call room!
      </Button>
    </Box>
  );
};

export default Page;
