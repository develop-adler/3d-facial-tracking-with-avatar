import { styled } from "@mui/material";

// import { pretendardFontSetting } from '@/font';

import { COLOR, TOP_MENU_HEIGHT } from "constant";

export const MenuItemsBackground = styled("div")({
    width: "100%",
    display: "flex",
    justifyContent: "center",
    position: "absolute",
    top: `calc(${TOP_MENU_HEIGHT} + 0.5rem)`,
    zIndex: 1000,
    minWidth: "87rem",
});

export const MenuItemsContainer = styled("div")({
    background: "#3C3A3A",
    borderRadius: 6,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    gap: "0.5rem",
});

export const MenuItemButton = styled("div")<{ isSelected: boolean }>(
    ({ isSelected }) => ({
        width: "2.5rem",
        height: "2.5rem",
        background: isSelected ? COLOR.brandPrimary : COLOR.grayScale62,
        borderRadius: ".375rem",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: "pointer",

        // disable all user selection
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        MsUserSelect: "none",
        KhtmlUserSelect: "none",
        OUserSelect: "none",
    })
);

export const MenuItemIcon = styled("div")({
    position: "relative",
    width: "1rem",
    height: "1rem",
});

export const MenuItemButtonHelpText = styled("div")<{ height: number }>(
    ({ height }) => ({
        position: "absolute",
        zIndex: 101,
        minWidth: "5rem",
        width: "fit-content",
        height: `${height}rem`,
        top: "2.5rem",
        left: "0.5rem",
    })
);

export const MenuItemLineContainer = styled("div")<{ height: number }>(
    ({ height }) => ({
        position: "relative",
        width: "1rem",
        height: `${height}rem`,
    })
);

export const MenuItemTextArea = styled("div")<{ left: number }>(({ left }) => ({
    position: "absolute",
    zIndex: 102,
    bottom: "-1rem",
    left: `${left}rem`,
    background: "rgba(12, 12, 12, 0.20)",
    border: "1px solid rgba(255, 255, 255, 0.40)",
    borderRadius: "0.625rem",
    backdropFilter: "blur(5.800000190734863px)",
    padding: ".75rem 1.25rem",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: COLOR.white,
    // fontFamily: `${pretendardFontSetting.style.fontFamily} !important`,
    fontSize: "12px",
    lineHeight: "100%",
    fontStyle: "normal",
}));
