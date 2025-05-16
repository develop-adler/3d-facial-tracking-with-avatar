import "@livekit/components-styles";
import { styled } from "@mui/material";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

export const Multiplayer3DContainer = styled("div")({
  marginTop: TOP_MENU_HEIGHT,
  width: "100%",
  height: `calc(100vh - ${TOP_MENU_HEIGHT} - var(--lk-control-bar-height))`,
});

export const FacialExpressionCanvas = styled("canvas")(() => {
  const xMargin = 2.5;
  const yMargin = xMargin * 2;
  return {
    width: "auto",
    height: "35vh",
    aspectRatio: "3 / 4",
    transform: "scaleY(-1)", // flip vertically
    position: "absolute",
    top: `calc(${yMargin}% + ${TOP_MENU_HEIGHT})`,
    right: xMargin + "%",
    borderRadius: "10px",
    border: `3px solid ${COLOR.brandPrimary}`,
    overflow: "hidden",
    opacity: 0,
    transition: "opacity 0.3s ease-in-out",
  };
});
