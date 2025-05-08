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
    useLocalParticipant,
    usePersistentUserChoices,
    useTrackToggle,
    // useTrackByName,
} from "@livekit/components-react";
import { Track } from "livekit-client";

import { KrispNoiseFilterInputBox } from "@/components/LiveKit/RoomPage/components/KrispNoiseFilterInputBox";
import { useChatToggleStore } from "@/stores/useChatToggle";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

/**
 * Basically a copy of the ControlBar prefab, but with removed camera device selector
 */
export const CustomControlBar = () => {
    const browserSupportsScreenSharing = supportsScreenSharing();

    const { cameraTrack } = useLocalParticipant();
    const hasAvatarTrack = cameraTrack?.trackName === "avatar_video";

    const isMultiplayer = useLiveKitStore((state) => state.isMultiplayer);
    const { toggle: toggleCamera, enabled } = useTrackToggle({
        source: Track.Source.Camera,
    });
    const currentCameraEnabledState = useRef<boolean>(enabled);
    const toggleChat = useChatToggleStore((state) => state.toggleChat);

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
                            style={{
                                // fix right side borders being right angled
                                borderTopRightRadius: "var(--lk-border-radius)",
                                borderBottomRightRadius: "var(--lk-border-radius)",
                            }}
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
                            onClick={() => {}}
                            onChange={() => {}}
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
