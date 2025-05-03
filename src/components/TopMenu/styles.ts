import { AppBar, Button, Box, styled, Modal } from "@mui/material";

import { COLOR, TOP_MENU_HEIGHT } from "constant";

// Styled Components
export const StyledAppBar = styled(AppBar)({
    position: "fixed",
    top: 0,
    height: TOP_MENU_HEIGHT,
    backgroundColor: COLOR.grayScale17,
    justifyContent: "center",
});

export const ButtonContainer = styled(Box)(({ theme }) => ({
    flexGrow: 1,
    display: "flex",
    justifyContent: "center",
    gap: theme.spacing(2),
}));

export const StyledButton = styled(Button)(({ theme }) => ({
    color: theme.palette.common.white,
}));

export const IframeModal = styled(Modal)({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
});

export const IframeContent = styled('iframe')(({ theme }) => ({
    width: '80%',
    height: '80%',
    border: 'none',
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[5],
    backgroundColor: theme.palette.background.paper,
}));