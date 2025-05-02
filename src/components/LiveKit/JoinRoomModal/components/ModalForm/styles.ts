import { Button, styled, Box, TextField } from "@mui/material";
import { COLOR } from "constant";

export const ModalTextFieldContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2),
  width: "50%",
  marginBottom: theme.spacing(2),
}));

export const ModalTextField = styled(TextField)(({ theme }) => ({
  marginBottom: theme.spacing(1),
}));

export const RandomNameButton = styled(Button)(({ theme }) => ({
  backgroundColor: COLOR.brandPrimary,
  color: theme.palette.common.white,
  width: "12rem",
  height: "auto",
  marginLeft: "auto",
  marginRight: "0",
}));

export const SubmitButton = styled(Button)({
  borderRadius: "2rem",
  backgroundColor: COLOR.brandPrimary,
  color: COLOR.white,
  padding: "0.5rem 2rem",
  fontSize: "1.2rem",
});
