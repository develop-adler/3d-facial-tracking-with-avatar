import { useCallback, useEffect, useRef, useState } from "react";

import { supportsScreenSharing } from "@livekit/components-core";
import {
    CameraDisabledIcon,
    ChatIcon,
    ChatToggle,
    DisconnectButton,
    LayoutContextProvider,
    LeaveIcon,
    MediaDeviceMenu,
    TrackToggle,
    useChat,
    useLocalParticipant,
    usePersistentUserChoices,
    useTrackToggle,
    // useTrackByName,
} from "@livekit/components-react";
import { Badge } from "@mui/material";
import { Track } from "livekit-client";

import VoiceChangerModal from "@/components/VoiceChangerModal";
import { KrispNoiseFilterInputBox } from "@/components/LiveKit/RoomPage/components/KrispNoiseFilterInputBox";
import { useChatToggleStore } from "@/stores/useChatToggle";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useVoiceChangerStore } from "@/stores/useVoiceChangerStore";

/**
 * Basically a copy of the ControlBar prefab, but with removed camera device selector
 */
export const CustomControlBar = () => {
    const browserSupportsScreenSharing = supportsScreenSharing();

    const { cameraTrack } = useLocalParticipant();
    const hasAvatarTrack = cameraTrack?.trackName === "avatar_video";

    const isMultiplayer = useLiveKitStore((state) => state.isMultiplayer);
    const openVoiceChangerModal = useVoiceChangerStore(
        (state) => state.openVoiceChangerModal
    );
    const isChatOpen = useChatToggleStore((state) => state.isChatOpen);
    const unreadCount = useChatToggleStore((state) => state.unreadCount);

    const { chatMessages } = useChat();

    const { toggle: toggleCamera, enabled } = useTrackToggle({
        source: Track.Source.Camera,
    });
    const currentCameraEnabledState = useRef<boolean>(enabled);
    const toggleChat = useChatToggleStore((state) => state.toggleChat);

    // for future settings option for user
    const [isMinimal] = useState<boolean>(true);

    const {
        saveAudioInputEnabled,
        saveVideoInputEnabled,
        saveAudioInputDeviceId,
    } = usePersistentUserChoices({ preventSave: false });

    const microphoneOnChange = useCallback(
        (enabled: boolean, isUserInitiated: boolean) =>
            // eslint-disable-next-line unicorn/no-null
            isUserInitiated ? saveAudioInputEnabled(enabled) : null,
        [saveAudioInputEnabled]
    );

    const cameraOnChange = useCallback(
        (enabled: boolean, isUserInitiated: boolean) =>
            // eslint-disable-next-line unicorn/no-null
            isUserInitiated && hasAvatarTrack ? saveVideoInputEnabled(enabled) : null,
        [hasAvatarTrack, saveVideoInputEnabled]
    );

    const [isScreenShareEnabled, setIsScreenShareEnabled] =
        useState<boolean>(false);

    const onScreenShareChange = useCallback(
        (enabled: boolean) => {
            setIsScreenShareEnabled(enabled);
        },
        [setIsScreenShareEnabled]
    );

    useEffect(() => {
        if (isMultiplayer) toggleCamera(false);
        else toggleCamera(currentCameraEnabledState.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMultiplayer]);

    useEffect(() => {
        if (isMultiplayer) return;
        currentCameraEnabledState.current = enabled;
    }, [isMultiplayer, enabled]);

    // when the chat is opened, reset the unread count
    useEffect(() => {
        if (!isChatOpen) return;
        setTimeout(() => {
            useChatToggleStore.getState().setUnreadCount(0);
        }, 600);
    }, [isChatOpen]);

    // when a new message is received and the chat is closed, increment the unread count
    useEffect(() => {
        const latestMessage = chatMessages.at(-1);
        if (!latestMessage) return;
        if (
            latestMessage.from !== useLiveKitStore.getState().room.localParticipant &&
            !useChatToggleStore.getState().isChatOpen
        ) {
            useChatToggleStore
                .getState()
                .setUnreadCount(useChatToggleStore.getState().unreadCount + 1);
        }
    }, [chatMessages]);

    return (
        <LayoutContextProvider>
            <VoiceChangerModal open={openVoiceChangerModal} onClose={() => false} />
            <div className="lk-control-bar">
                <div className="lk-button-group">
                    <TrackToggle
                        source={Track.Source.Unknown}
                        showIcon={false}
                        onClick={() => {
                            useVoiceChangerStore.getState().toggleVoiceChangerModal();
                        }}
                        style={{
                            // fix right side borders being right angled
                            borderTopRightRadius: "var(--lk-border-radius)",
                            borderBottomRightRadius: "var(--lk-border-radius)",
                            marginRight: "0.6rem",
                        }}
                    >
                        Mic effects
                    </TrackToggle>
                    <KrispNoiseFilterInputBox />
                </div>
                <div className="lk-button-group">
                    <TrackToggle
                        source={Track.Source.Microphone}
                        showIcon={true}
                        onChange={microphoneOnChange}
                    >
                        {!isMinimal && "Microphone"}
                    </TrackToggle>
                    <div className="lk-button-group-menu">
                        <MediaDeviceMenu
                            kind="audioinput"
                            onActiveDeviceChange={(_kind, deviceId) =>
                                saveAudioInputDeviceId(deviceId ?? "default")
                            }
                        />
                    </div>
                </div>
                <div className="lk-button-group">
                    {hasAvatarTrack ? (
                        <TrackToggle
                            source={Track.Source.Camera}
                            showIcon={true}
                            onChange={cameraOnChange}
                            style={{
                                // fix right side borders being right angled
                                borderTopRightRadius: "var(--lk-border-radius)",
                                borderBottomRightRadius: "var(--lk-border-radius)",
                            }}
                        >
                            {!isMinimal && "Camera"}
                        </TrackToggle>
                    ) : (
                        <TrackToggle
                            source={Track.Source.Unknown}
                            style={{
                                userSelect: "none",
                                cursor: "not-allowed",
                            }}
                            disabled={true}
                            onClick={() => false}
                            onChange={() => false}
                        >
                            <CameraDisabledIcon />
                            {!isMinimal && "Camera"}
                        </TrackToggle>
                    )}
                </div>
                {browserSupportsScreenSharing && (
                    <TrackToggle
                        source={Track.Source.ScreenShare}
                        captureOptions={{ audio: true, selfBrowserSurface: "include" }}
                        showIcon={true}
                        onChange={onScreenShareChange}
                    >
                        {!isMinimal &&
                            (isScreenShareEnabled ? "Stop screen share" : "Share screen")}
                    </TrackToggle>
                )}
                <Badge
                    badgeContent={unreadCount} // the number inside the circle
                    color="info" // color of the badge
                    overlap="circular"
                    anchorOrigin={{
                        vertical: "top",
                        horizontal: "right",
                    }}
                    showZero={false}
                    onClick={() => toggleChat()}
                    sx={{
                        userSelect: "none",
                        cursor: "pointer",
                    }}
                >
                    <ChatToggle>
                        {<ChatIcon />}
                        {!isMinimal && "Chat"}
                    </ChatToggle>
                </Badge>
                <DisconnectButton>
                    <LeaveIcon />
                    {!isMinimal && "Leave"}
                </DisconnectButton>
            </div>
        </LayoutContextProvider>
    );
};
