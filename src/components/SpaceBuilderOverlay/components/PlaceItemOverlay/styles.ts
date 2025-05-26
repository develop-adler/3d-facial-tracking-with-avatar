import { styled } from "@mui/material";

import { COLOR } from "constant";

export const Container = styled("div")({
    position: "absolute",
    top: "25%",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "15vw",
    height: "4rem",
    zIndex: 1000,
});

export const ActionButton = styled("button")({
    backgroundColor: COLOR.brandPrimary,
    color: COLOR.white,
    fontSize: "1.15rem",
    border: "none",
    borderRadius: 8,
    padding: "0.5rem 1rem",
    cursor: "pointer",
    userSelect: "none",
    transition: "background-color 0.3s ease",
    "&:hover": {
        backgroundColor: COLOR.brandPrimaryHover3,
    },
});
