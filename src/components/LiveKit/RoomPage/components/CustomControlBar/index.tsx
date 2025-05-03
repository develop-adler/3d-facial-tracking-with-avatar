import { useCallback, useState } from "react";

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
    useLocalParticipant,
    usePersistentUserChoices,
    // useTrackByName,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useChatToggleStore } from "@/stores/useChatToggle";
import { KrispNoiseFilterInputBox } from "../KrispNoiseFilterInputBox";

/**
 * Basically a copy of the ControlBar prefab, but with removed camera device selector
 */
export const CustomControlBar = () => {
    const browserSupportsScreenSharing = supportsScreenSharing();

    const { cameraTrack } = useLocalParticipant();
    const hasAvatarTrack = cameraTrack?.trackName === "avatar_video";

    const {
        saveAudioInputEnabled,
        saveVideoInputEnabled,
        saveAudioInputDeviceId,
    } = usePersistentUserChoices({ preventSave: false });

    const toggleChat = useChatToggleStore((state) => state.toggleChat);

    const microphoneOnChange = useCallback(
        (enabled: boolean, isUserInitiated: boolean) =>
            isUserInitiated ? saveAudioInputEnabled(enabled) : null,
        [saveAudioInputEnabled]
    );

    const cameraOnChange = useCallback(
        (enabled: boolean, isUserInitiated: boolean) =>
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

    return (
        <LayoutContextProvider>
            <div className="lk-control-bar">
                <div className="lk-button-group">
                    <KrispNoiseFilterInputBox />
                </div>
                <div className="lk-button-group">
                    <TrackToggle
                        source={Track.Source.Microphone}
                        showIcon={true}
                        onChange={microphoneOnChange}
                    >
                        Microphone
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
                        >
                            Camera
                        </TrackToggle>
                    ) : (
                        <TrackToggle
                            source={Track.Source.Unknown}
                            style={{
                                userSelect: "none",
                                cursor: "not-allowed",
                            }}
                            disabled={true}
                            onClick={() => undefined}
                            onChange={() => undefined}
                        >
                            <CameraDisabledIcon />
                            Camera
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
                        {isScreenShareEnabled ? "Stop screen share" : "Share screen"}
                    </TrackToggle>
                )}
                <ChatToggle onClick={() => toggleChat()}>
                    <ChatIcon />
                    Chat
                </ChatToggle>
                <DisconnectButton>
                    <LeaveIcon />
                    Leave
                </DisconnectButton>
            </div>
        </LayoutContextProvider>
    );
};
