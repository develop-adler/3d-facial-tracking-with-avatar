import { styled, Box, Typography } from "@mui/material";

export const ModalContainer = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "50%",
  height: "auto",
  backgroundColor: theme.palette.background.default,
  borderRadius: "1rem",
  boxShadow: theme.shadows[5],
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  display: "flex",
  flexDirection: "column",
  justifyContent: "center", // centered inner elements vertically
  alignItems: "center", // centered inner elements horizontally
}));

export const ModalTitle = styled(Typography)(({ theme }) => ({
  fontSize: theme.typography.h3.fontSize,
  textAlign: "center",
  color: theme.palette.common.black,
  marginBottom: theme.spacing(4),
}));
