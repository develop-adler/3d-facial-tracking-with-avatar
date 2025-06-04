import type { FC } from "react";

import { LinearProgress, Box, Typography } from "@mui/material";

import { useAvatarLoadingStore } from "@/stores/useAvatarLoadingStore";

type Props = {
    isRoomPage?: boolean;
};

const LOADING_BAR_HEIGHT = "2rem";

const LoadingBar: FC<Props> = ({ isRoomPage }) => {
    const isLoading = useAvatarLoadingStore((state) => state.isLoading);
    const loadingPercentage = useAvatarLoadingStore(
        (state) => state.loadingPercentage
    );

    // eslint-disable-next-line unicorn/no-null
    if (!isLoading) return null;

    return (
        <Box
            sx={{
                position: "absolute",
                top: isRoomPage ? "5rem" : "auto",
                left: isRoomPage ? "50%" : "auto",
                transform: isRoomPage ? "translateX(-50%)" : "none",
                width: isRoomPage ? "80%" : "100%",
                zIndex: 9999,
            }}
        >
            <LinearProgress
                variant="determinate"
                color={loadingPercentage < 100 ? "primary" : "success"}
                value={loadingPercentage}
                sx={{ height: LOADING_BAR_HEIGHT }}
            />
            <Typography
                variant="body1"
                color="textPrimary"
                sx={{
                    position: "absolute",
                    top: `calc(${LOADING_BAR_HEIGHT} / 2)`,
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                }}
            >
                Loading avatar {Math.round(loadingPercentage)}%
            </Typography>
        </Box>
    );
};

export default LoadingBar;
