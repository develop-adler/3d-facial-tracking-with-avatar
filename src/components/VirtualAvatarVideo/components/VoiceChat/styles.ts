import { Paper, styled } from "@mui/material";

export const StyledPaper = styled(Paper)(({ theme }) => ({
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[3],
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 400,
    margin: "auto",
    transition: "background 0.2s",

    position: 'absolute',
    top: '10%',
    left: '50%',
    transform: 'translate(-50%, -10%)',
    zIndex: 1000,
}));
