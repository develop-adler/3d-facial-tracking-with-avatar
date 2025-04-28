import { styled } from '@mui/material/styles';
import Button from '@mui/material/Button';

export const StyledButton = styled(Button)(({ theme }) => ({
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.common.white,
    '&:hover': {
        backgroundColor: theme.palette.primary.dark,
    },

    margin: '0 0.6rem',
    padding: '0.2rem 0.4rem',
    fontSize: '2rem',
    border: 'none',
    borderRadius: '0.6rem',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
}));

export const CanvasStyled= styled('canvas')({
    position: 'absolute',
    top: '50%',
    left: '50%',
    translate: '-50% -50%',
    width: '70%',
    height: 'auto',
    userSelect: 'none',
    transform: "scaleX(-1)",
    WebkitTransform: "scaleX(-1)",
    OTransform: "scaleX(-1)",
    MozTransform: "scaleX(-1)",
    filter: "FlipH",
});
