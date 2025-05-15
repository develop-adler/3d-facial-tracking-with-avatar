"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Box,
  Button,
  Fade,
  Link,
  List,
  ListItem,
  Typography,
} from "@mui/material";

import { useTrackingStore } from "@/stores/useTrackingStore";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

const AvatarScene = dynamic(
  () => import("@/components/AvatarScene").then((p) => p.AvatarScene),
  {
    ssr: false,
  }
);
const LoadingBar = dynamic(
  () => import("@/components/AvatarScene/components/LoadingBar"),
  {
    ssr: false,
  }
);

const Page = () => {
  const router = useRouter();

  const [started, setStarted] = useState<boolean>(false);

  return (
    <div
      style={{
        marginTop: TOP_MENU_HEIGHT,
        height: `calc(100vh - ${TOP_MENU_HEIGHT})`,
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          marginTop: "15vh",
          height: `calc(70vh - ${TOP_MENU_HEIGHT})`,
          minHeight: `calc(70vh - ${TOP_MENU_HEIGHT})`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center", // good for multi-line titles
          px: 2, // padding for small screens
        }}
      >
        <Fade in timeout={1000}>
          <Typography
            variant="h1"
            sx={{
              userSelect: "none",
              fontSize: {
                xs: "7vh", // extra-small screens
                sm: "9vh", // small screens
                md: "10vh", // medium screens
                // lg: "5rem",     // large screens
              },
            }}
          >
            Welcome to 3D video chat demo
          </Typography>
        </Fade>
      </Box>
      {/* <ScreenControlButtons /> */}

      <Box
        sx={{
          position: "relative",
          top: "25%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box
          width={{
            sm: "90vw",
            md: "65vw",
          }}
          maxWidth={{
            sm: "90vw",
            md: "65vw",
          }}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 2,
            backgroundColor: COLOR.grayScale10,
            borderRadius: {
              sm: 0,
              md: 4,
            },
            boxShadow: 3,
            color: COLOR.white,
            marginBottom: "2rem",
            userSelect: "none",
          }}
        >
          <br />
          <br />
          <Typography
            sx={{
              fontSize: {
                xs: "5vw",
                sm: "4vw",
                md: "1.5vw",
              },
              textAlign: "justify",
            }}
          >
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
          </Typography>
          <br />
          <br />
          <br />
          <Typography
            sx={{
              fontSize: {
                xs: "5vw",
                sm: "4vw",
                md: "2vw",
              },
            }}
          >
            Current features:
          </Typography>
          <List
            sx={{
              fontSize: {
                xs: "4vw",
                sm: "3vw",
                md: "1.25vw",
              },
            }}
          >
            <ListItem>
              • Call room: Create/Join video and voice chat room
            </ListItem>
            <ListItem>
              • Avatar: Create Ready Player Me avatar and use the custom avatar
              for video chat, you may also select an avatar from list of preset
              avatars
            </ListItem>
            <ListItem>
              • Multiplayer: Enter 3D space with users within the room
            </ListItem>
            <ListItem>
              • Messaging: You can send messages to other users within the room
            </ListItem>
            <ListItem>
              • Spatial audio voice chat: While in 3D space, voice chatting will
              be 3D spatial audio
            </ListItem>
          </List>
        </Box>

        {started ? (
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
        ) : (
          <Button
            variant="contained"
            sx={{
              backgroundColor: COLOR.brandPrimary,
              color: COLOR.white,
              border: "none",
              borderRadius: "1rem",
              fontSize: "2rem",
              textTransform: "none",
              margin: "2rem 2rem 1rem 2rem",
            }}
            onClick={() => {
              setStarted(true);
              useTrackingStore.getState().faceTracker.getUserVideoStream();
            }}
          >
            Try now!
          </Button>
        )}
        <Typography
          sx={{
            fontSize: {
              xs: "8vw",
              sm: "6vw",
              md: "2vw",
            },
            // marginTop: "2rem",
            userSelect: "none",
          }}
        >
          Or
        </Typography>
        <Button
          variant="contained"
          style={{
            backgroundColor: COLOR.brandPrimary,
            color: COLOR.white,
            border: "none",
            borderRadius: "1rem",
            fontSize: "2rem",
            textTransform: "none",
            marginTop: "1rem",
            marginBottom: "2rem",
          }}
          onClick={() => {
            router.push("/room");
          }}
        >
          Create / Join a call room
        </Button>
      </Box>
    </div>
  );
};

export default Page;
