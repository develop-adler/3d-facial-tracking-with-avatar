import { Chat } from "@livekit/components-react";
import { Box } from "@mui/material";

import { useChatToggleStore } from "@/stores/useChatToggle";

import { ROOM_CHAT_WIDTH } from "constant";

export const ChatContainer = () => {
    const isChatOpen = useChatToggleStore((state) => state.isChatOpen);
    return (
        <Box
            sx={{
                position: "absolute",
                top: 0,
                right: 0,
                width: ROOM_CHAT_WIDTH,
                height: "100%",
                transition: "transform 0.3s ease, opacity 0.3s ease",
                transform: isChatOpen ? "translateX(0)" : "translateX(100%)",
                opacity: isChatOpen ? 1 : 0,
                pointerEvents: isChatOpen ? "auto" : "none",
                zIndex: 10,
            }}
        >
            <Chat
                style={{ height: "calc(100vh - var(--lk-control-bar-height))" }}
            />
        </Box>
    );
};
