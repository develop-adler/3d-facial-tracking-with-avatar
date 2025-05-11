import {
    Fragment,
    useEffect,
    useMemo,
    useRef,
    type FormEvent,
    type HTMLAttributes,
} from "react";

import {
    type ChatMessage,
    type ChatOptions,
    type ReceivedChatMessage,
} from "@livekit/components-core";
import {
    ChatCloseIcon,
    ChatToggle,
    useChat,
    type MessageFormatter,
} from "@livekit/components-react";
import { Box, Typography } from "@mui/material";

import ChatEntry from "@/components/LiveKit/RoomPage/components/ChatContainer/components/ChatEntry";
import { useChatToggleStore } from "@/stores/useChatToggle";

import { COLOR } from "constant";

type ChatGroup = {
    timestamp: Date;
    messages: ReceivedChatMessage[];
};

const groupMessagesByTime = (
    messages: ReceivedChatMessage[],
    intervalMinutes = 8
): ChatGroup[] => {
    const groups: ChatGroup[] = [];
    let currentGroup: ChatGroup | undefined;

    for (const msg of messages) {
        const msgTime = new Date(msg.timestamp);

        if (
            !currentGroup ||
            (msgTime.getTime() - currentGroup.timestamp.getTime()) / 60_000 >
            intervalMinutes
        ) {
            currentGroup = { timestamp: msgTime, messages: [msg] };
            groups.push(currentGroup);
        } else {
            currentGroup.messages.push(msg);
        }
    }

    return groups;
};

interface ChatProps extends HTMLAttributes<HTMLDivElement>, ChatOptions {
    messageFormatter?: MessageFormatter;
}

/**
 * Basically the LiveKit Chat prefab, but with removed chat toggle button and custom styling
 * @param messageFormatter Optional message formatter
 * @param channelTopic Optional channel topic
 */
const ChatBox = ({ messageFormatter, channelTopic, ...props }: ChatProps) => {
    const ulRef = useRef<HTMLUListElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastReadMsgAt = useRef<ChatMessage["timestamp"]>(0);

    const chatOptions: ChatOptions = useMemo(() => {
        return { channelTopic };
    }, [channelTopic]);

    const { chatMessages, send, isSending } = useChat(chatOptions);

    const setChatOpen = useChatToggleStore((state) => state.setChatOpen);
    const setUnreadCount = useChatToggleStore((state) => state.setUnreadCount);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (inputRef.current && inputRef.current.value.trim() !== "") {
            await send(inputRef.current.value);
            inputRef.current.value = "";
            inputRef.current.focus();
        }
    }

    useEffect(() => {
        if (ulRef) {
            ulRef.current?.scrollTo({ top: ulRef.current.scrollHeight });
        }
    }, [ulRef, chatMessages]);

    useEffect(() => {
        if (chatMessages.length === 0) {
            return;
        }

        if (
            chatMessages.length > 0 &&
            lastReadMsgAt.current !== chatMessages.at(-1)?.timestamp
        ) {
            lastReadMsgAt.current = chatMessages.at(-1)?.timestamp;
            return;
        }

        const unreadMessageCount = chatMessages.filter(
            (msg: ChatMessage) =>
                !lastReadMsgAt.current || msg.timestamp > lastReadMsgAt.current
        ).length;
        setUnreadCount(unreadMessageCount);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatMessages]);

    return (
        <div {...props} className="lk-chat">
            <div className="lk-chat-header">
                Messages
                <ChatToggle
                    className="lk-close-button"
                    onClick={() => {
                        setChatOpen(false);
                    }}
                >
                    <ChatCloseIcon />
                </ChatToggle>
            </div>

            {/* <ul className="lk-list lk-chat-messages" ref={ulRef}>
                {chatMessages.map((msg, idx) => (
                    <ChatEntry
                        key={msg.id ?? idx}
                        entry={msg}
                        messageFormatter={messageFormatter}
                    />
                ))}
            </ul> */}
            <ul className="lk-list lk-chat-messages" ref={ulRef}>
                {groupMessagesByTime(chatMessages).map((group, groupIdx) => (
                    <Fragment key={groupIdx}>
                        <Box
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                margin: "1rem 0",
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: COLOR.white,
                                    px: 1.5,
                                    py: 0.5,
                                    borderRadius: 1,
                                    userSelect: "none",
                                }}
                            >
                                {group.timestamp.toLocaleTimeString(undefined, {
                                    timeStyle: "short",
                                })}
                            </Typography>
                        </Box>

                        {group.messages.map((msg, idx) => (
                            <li
                                key={msg.id ?? `${groupIdx}-${idx}`}
                                style={{ listStyle: "none" }}
                            >
                                <ChatEntry entry={msg} messageFormatter={messageFormatter} />
                            </li>
                        ))}
                    </Fragment>
                ))}
            </ul>
            <form className="lk-chat-form" onSubmit={handleSubmit}>
                <input
                    className="lk-form-control lk-chat-form-input"
                    disabled={isSending}
                    ref={inputRef}
                    type="text"
                    placeholder="Enter a message..."
                    onInput={(ev) => ev.stopPropagation()}
                    onKeyDown={(ev) => ev.stopPropagation()}
                    onKeyUp={(ev) => ev.stopPropagation()}
                />
                <button
                    type="submit"
                    className="lk-button lk-chat-form-button"
                    disabled={isSending}
                >
                    Send
                </button>
            </form>
        </div>
    );
};

export default ChatBox;
