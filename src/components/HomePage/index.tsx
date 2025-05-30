"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

import {
  Box,
  Button,
  Fade,
  Link,
  List,
  ListItem,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

import FadeInOnScroll from "@/components/HomePage/components/FadeInOnScroll";
import { useTrackingStore } from "@/stores/useTrackingStore";

import { COLOR, TOP_MENU_HEIGHT } from "constant";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

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
    <>
      <Box
        sx={{
          marginTop: TOP_MENU_HEIGHT,
          height: `calc(100vh - ${TOP_MENU_HEIGHT})`,
          minHeight: `calc(100vh - ${TOP_MENU_HEIGHT})`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center", // good for multi-line titles
          px: 2, // padding for small screens
        }}
      >
        <Fade in timeout={1000}>
          <Box>
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
            <Typography
              variant="h4"
              sx={{
                userSelect: "none",
                marginTop: "2rem",
              }}
            >
              by Gavin Quach
            </Typography>
          </Box>
        </Fade>
      </Box>

      <Box sx={{
        position: "relative", // to stick text at the bottom
        marginBottom: { md: "8rem" },
      }}>
        <Box
          sx={{
            p: 2,
            width: "100%",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "center",
            marginBottom: { md: "8rem" },
          }}
        >
          {[
            ["Secure", "Encrypted video and audio calls"],
            ["Anonymous", "No account! No servers!*"],
            ["Simple", "Straightforward, easy-to-use"],
          ].map((item, index) => (
            <Fragment key={index}>
              <Box
                sx={{
                  flex: 1,
                  textAlign: "center",
                  boxSizing: "border-box",
                  my: { xs: "4rem", md: 0 },
                  marginTop: { md: `calc(${index} * 35vh)` },
                }}
              >
                <FadeInOnScroll>
                  <Typography variant="h2">{item[0]}</Typography>
                  <Typography variant="h5" sx={{ fontStyle: "italic" }}>
                    {item[1]}
                  </Typography>
                </FadeInOnScroll>
              </Box>
            </Fragment>
          ))}
        </Box>
        <Typography
          sx={{
            // position: "absolute",
            // bottom: 0,
            // left: "50%",
            // transform: "translateX(-50%)",
            fontSize: "0.9rem",
            fontStyle: "italic",
            width: "40vw",
            marginLeft: "auto",
            marginRight: 0,
          }}
        >
          *Calls are handled by LiveKit using WebRTC and their LiveKit Cloud
          service, this application does not have any backend server of its own.
        </Typography>
      </Box>

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
            tracking. This application{" "}
            <b>
              <i>currently does not have any server-side processing</i>
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
            </Link>
            .
          </Typography>
          <br />
          <br />
          <br />
          <Typography
            sx={{
              fontWeight: "bold",
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
                xs: "4.4vw",
                sm: "3.4vw",
                md: "1.45vw",
              },
            }}
          >
            {[
              "Anonymous: You can use this demo without signing up or logging in.",
              "Encrypted: Video and voice call is end-to-end encrypted.",
              "Avatar: Create Ready Player Me avatar and use the custom avatar for video chat, you may also select an avatar from list of available preset avatars",
              "Face tracking: Use your webcam to track your face and apply the facial expressions to your avatar. Your webcam video feed is not directly accessed.",
              "Call room: Create/Join video and voice call room. Enter the same room name to join the same call room with other users.",
              "Multiplayer: Enter 3D space with users within the room (right now when 1 accepts, all",
              "Spatial audio voice chat: While in 3D space, voice chatting will be 3D spatial audio!",
              "Mic effects: Apply mic effects to your voice, such as pitch shifting, reverb, and more! (work in progress)",
              "Messaging: You can chat with other users within the room (they're non-persistent and are not saved to any database, meaning you will not see previously sent messages when you join/rejoin the room)",
              "3D space: Enter a 3D space with other users, within the space, you can enter 'Space Builder' mode and place objects, interact with objects, and more! (work in progress)",
            ].map((item, index) => (
              <ListItem key={index} sx={{ my: 2 }}>
                <CheckIcon sx={{ marginRight: 2 }} /> {item}
              </ListItem>
            ))}
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
            <AvatarScene room={useLiveKitStore.getState().room} />
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
            Try avatar face tracker!
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
      {/* <ScreenControlButtons /> */}
    </>
  );
};

export default Page;
