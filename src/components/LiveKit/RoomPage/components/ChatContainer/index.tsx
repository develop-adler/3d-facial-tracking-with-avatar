import { LayoutContextProvider } from "@livekit/components-react";
import { Box } from "@mui/material";

import ChatBox from "@/components/LiveKit/RoomPage/components/ChatBox";
import { useChatToggleStore } from "@/stores/useChatToggle";

import { TOP_MENU_HEIGHT } from "constant";

export const ChatContainer = () => {
    const isChatOpen = useChatToggleStore((state) => state.isChatOpen);

    return (
        <LayoutContextProvider>
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    marginTop: `${TOP_MENU_HEIGHT} !important`,
                    width: "clamp(200px, 55ch, 60ch)",
                    height: `calc(100vh - ${TOP_MENU_HEIGHT} - var(--lk-control-bar-height))`,
                    transition: "transform 0.3s ease, opacity 0.3s ease",
                    transform: isChatOpen ? "translateX(0)" : "translateX(100%)",
                    opacity: isChatOpen ? 1 : 0,
                    pointerEvents: isChatOpen ? "auto" : "none",
                    zIndex: 10,
                }}
            >
                <ChatBox
                    // need to explicitly set the height to 100% otherwise it'll be tiny
                    style={{ height: '100%' }}
                />
            </Box>
        </LayoutContextProvider>
    );
};
