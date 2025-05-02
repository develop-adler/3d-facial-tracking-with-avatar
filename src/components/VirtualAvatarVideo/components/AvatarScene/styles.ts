import { styled } from "@mui/material/styles";

export const CanvasContainer = styled("div")<{
    $viewportFill?: boolean;
    $fullscreen?: boolean;
}>(({ $viewportFill, $fullscreen }) => {
    const fill = $viewportFill || $fullscreen; // either one active, we fill screen
    return {
        position: "absolute",
        top: fill ? 0 : "50%",
        left: fill ? 0 : "50%",
        translate: fill ? undefined : "-50% -50%",
        width: fill ? "100vw" : "auto",
        height: fill ? "100vh" : "60%",

        // border
        borderRadius: "0.6rem",
        border: fill ? "none" : "0.2rem solid #FC2D7C",
    };
});

export const CanvasStyled = styled("canvas")<{ $isForRoom?: boolean }>(
    ({ $isForRoom }) => ({
        width: "100%",
        height: "100%",
        userSelect: "none",
        zIndex: $isForRoom ? 0 : -999999,
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
    position: "absolute",
    top: "50%",
    left: "50%",
    translate: "-50% -50%",
}));
