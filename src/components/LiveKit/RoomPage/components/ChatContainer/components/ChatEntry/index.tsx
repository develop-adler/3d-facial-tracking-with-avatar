import { useMemo, type FC, type ReactNode } from "react";

import type { ReceivedChatMessage } from "@livekit/components-core";
import { useRoomContext } from "@livekit/components-react";
// import { Box, Typography, Paper } from "@mui/material";

import { COLOR } from "constant";

type Props = {
    entry: ReceivedChatMessage;
    messageFormatter?: (message: string) => ReactNode;
};

const ChatEntry: FC<Props> = ({ entry, messageFormatter }) => {
    const room = useRoomContext();

    const formattedMessage = useMemo(() => {
        return messageFormatter ? messageFormatter(entry.message) : entry.message;
    }, [entry.message, messageFormatter]);

    const hasBeenEdited = !!entry.editTimestamp;
    const time = new Date(entry.timestamp);
    const locale =
        typeof navigator === "undefined" ? "en-US" : navigator.language;

    const identity = entry.from?.identity;

    const isOwnMessage = room.localParticipant.identity === identity;

    const timeStr = time.toLocaleTimeString(locale, { timeStyle: "short" });

    return (
        <div
            style={{
                display: "flex",
                justifyContent: isOwnMessage ? "flex-end" : "flex-start",
                marginBottom: "0.3rem",
            }}
        >
            <div
                style={{
                    maxWidth: "70%",
                    padding: "0.4rem 1rem",
                    borderRadius: "1.1rem",
                    backgroundColor: isOwnMessage
                        ? COLOR.brandPrimaryHover2
                        : COLOR.brandSecondaryActive,
                    color: COLOR.black,
                    textAlign: "left",
                }}
            >
                <div style={{ wordWrap: "break-word", whiteSpace: "pre-wrap" }}>
                    {formattedMessage}
                </div>
                <div
                    style={{
                        fontSize: "0.75rem",
                        marginTop: "0.25rem",
                        textAlign: isOwnMessage ? "right" : "left",
                        opacity: 0.6,
                        userSelect: "none",
                    }}
                >
                    {timeStr} {hasBeenEdited && "Edited"}
                </div>
            </div>
        </div>
    );

    // return (
    //     <Box
    //         display="flex"
    //         justifyContent={isOwnMessage ? "flex-end" : "flex-start"}
    //         mb={1}
    //     >
    //         <Paper
    //             elevation={1}
    //             sx={{
    //                 maxWidth: "70%",
    //                 p: 1.5,
    //                 px: 2,
    //                 borderRadius: 2,
    //                 backgroundColor: isOwnMessage ? COLOR.brandPrimaryHover2 : COLOR.brandSecondaryActive, // pink / gray
    //             }}
    //         >
    //             <Typography variant="body1" sx={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
    //                 {formattedMessage}
    //             </Typography>
    //             <Typography
    //                 variant="caption"
    //                 sx={{
    //                     display: "block",
    //                     textAlign: isOwnMessage ? "right" : "left",
    //                     opacity: 0.6,
    //                     mt: 0.5
    //                     userSelect: "none",
    //                 }}
    //             >
    //                 {timeStr} {hasBeenEdited && "Edited"}
    //             </Typography>
    //         </Paper>
    //     </Box>
    // );
};

export default ChatEntry;
