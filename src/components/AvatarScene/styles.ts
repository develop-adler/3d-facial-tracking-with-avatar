import { styled } from "@mui/material/styles";

export const CanvasStyled = styled("div")<{ $isForRoom?: boolean }>(
    ({ $isForRoom }) => ({
        // don't interfere with current DOM elements when in room
        position: $isForRoom ? 'fixed' : 'static',
        width: "100%",
        height: "100%",
        userSelect: "none",
        zIndex: $isForRoom ? -999_999 : 0,
        visibility: $isForRoom ? "hidden" : "visible", 

        // mirrored
        transform: "scaleX(-1)",
        WebkitTransform: "scaleX(-1)",
        OTransform: "scaleX(-1)",
        MozTransform: "scaleX(-1)",
        filter: "FlipH",
    })
);

export const WaitingText = styled("div")(({ theme }) => ({
    fontSize: theme.typography.h3.fontSize,
    color: theme.palette.common.white,
    userSelect: "none",
}));
