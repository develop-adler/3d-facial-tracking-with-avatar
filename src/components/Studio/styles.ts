import { styled } from "@mui/material";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

export const Canvas3DContainer = styled("div")({
  marginTop: TOP_MENU_HEIGHT,
  width: "100%",
  height: `calc(100vh - ${TOP_MENU_HEIGHT} - var(--lk-control-bar-height))`,
  backgroundColor: COLOR.grayScale80,
});
