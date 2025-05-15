import "@livekit/components-styles";
import { styled } from "@mui/material";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

export const Multiplayer3DContainer = styled("div")({
  marginTop: TOP_MENU_HEIGHT,
  width: "100%",
  height: `calc(100vh - ${TOP_MENU_HEIGHT} - var(--lk-control-bar-height))`,
});

export const FacialExpressionCanvasContainer = styled("div")({
  position: "absolute",
  top: `calc(5% + ${TOP_MENU_HEIGHT})`,
  right: "5%",
  // 9 / 16 aspect ratio
  width: "35vh",
  height: "35vh",
  borderRadius: "10px",
  border: `3px solid ${COLOR.brandPrimary}`,
  // overflow: "hidden",
  zIndex: 1000,
});

export const FacialExpressionCanvas = styled("canvas")({
  width: "calc(100% * (16/9))",
  height: "100%",
  transform: "scaleY(-1)", // flip vertically
});
