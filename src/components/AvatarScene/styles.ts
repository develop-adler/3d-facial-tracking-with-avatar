import { styled } from "@mui/material/styles";

export const CanvasContainerStyled = styled("div")<{ $isForRoom?: boolean }>(
    ({ $isForRoom }) => ({
        // don't interfere with current DOM elements when in room
        position: $isForRoom ? 'fixed' : 'absolute',
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

export const CanvasStyled = styled("canvas")({
    position: "absolute",
    width: "100%",
    height: "100%",
    userSelect: "none",
    touchAction: "none", // prevent touch events from interfering
    border: "none",
    zIndex: 1,

    // mirrored
    transform: "scaleX(-1)",
    WebkitTransform: "scaleX(-1)",
    OTransform: "scaleX(-1)",
    MozTransform: "scaleX(-1)",
    filter: "FlipH",
});

export const WaitingText = styled("div")(({ theme }) => ({
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: theme.typography.h3.fontSize,
    color: theme.palette.common.white,
    userSelect: "none",
    zIndex: 9999,
    textAlign: "center",
}));
