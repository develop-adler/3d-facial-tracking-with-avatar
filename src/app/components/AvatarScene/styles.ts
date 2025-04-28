import { styled } from "@mui/material/styles";

export const CanvasStyled = styled("canvas")<{
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
        userSelect: "none",

        // border
        borderRadius: "0.6rem",
        border: fill ? "none" : "0.2rem solid #FC2D7C",

        // mirrored
        transform: "scaleX(-1)",
        WebkitTransform: "scaleX(-1)",
        OTransform: "scaleX(-1)",
        MozTransform: "scaleX(-1)",
        filter: "FlipH",
        zIndex: 0,
    };
});
