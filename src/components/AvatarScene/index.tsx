"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type FC } from "react";

import { useMediaDevices, useTrackToggle } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";

import { CanvasStyled, WaitingText } from "./styles";

import Avatar from "@/3d/avatar/Avatar";
import CoreScene from "@/3d/core/CoreScene";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useEngineStore } from "@/stores/useEngineStore";
import { useSceneStore } from "@/stores/useSceneStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useTrackingStore } from "@/stores/useTrackingStore";
import { useScreenControlStore } from "@/stores/useScreenControlStore";

import { clientSettings } from "clientSettings";
import { mediaStreamFrom3DCanvas, updateMediaStream } from "global";

export const AvatarScene: FC = () => {
    const pathName = usePathname();
    const videoDevices = useMediaDevices({ kind: "videoinput" });

    const bjsCanvasContainer = useRef<HTMLDivElement>(null); // For 3D scene

    const room = useLiveKitStore((state) => state.room);
    const coreEngine = useEngineStore((state) => state.coreEngine);
    const setScene = useSceneStore((state) => state.setScene);
    const setAvatar = useAvatarStore((state) => state.setAvatar);
    const isFullscreen = useScreenControlStore((state) => state.isFullscreen);
    const isViewportFill = useScreenControlStore((state) => state.isViewportFill);

    const { toggle } = useTrackToggle({
        source: Track.Source.Camera,
    });

    useEffect(() => {
        // to initialize the face tracker
        const faceTracker = useTrackingStore.getState().faceTracker;
        return () => {
            coreEngine.removeCanvasFromDOM();
            faceTracker.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        coreEngine.resize();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isViewportFill, isFullscreen]);

    useEffect(() => {
        if (videoDevices.length === 0) return;

        if (bjsCanvasContainer.current)
            coreEngine.insertCanvasToDOM(bjsCanvasContainer.current);

        let currentCoreScene = useSceneStore.getState().coreScene;
        if (!currentCoreScene) {
            currentCoreScene = new CoreScene(room, coreEngine);
            setScene(currentCoreScene);
        }
        currentCoreScene.switchToVideoChat();

        if (!useAvatarStore.getState().avatar) {
            const newAvatar = new Avatar(
                currentCoreScene,
                room.localParticipant,
                "male",
                true
            );
            setAvatar(newAvatar);

            currentCoreScene.atom.loadHDRSkybox(0.8, false).then(() => {
                if (!newAvatar!.container) {
                    newAvatar!.loadAvatar(undefined, undefined, true);
                }
            });
        }

        // Create MediaStream to pass to LiveKit
        if (pathName === "/room") {
            updateMediaStream(coreEngine.canvas.captureStream(60));

            // Publish 3D babylon.js canvas as camera stream
            if (
                !mediaStreamFrom3DCanvas ||
                // has avatar video track
                room.localParticipant.getTrackPublicationByName("avatar_video") ||
                // has existing camera track
                room.localParticipant.getTrackPublication(Track.Source.Camera)
            ) {
                return;
            }
            if (useLiveKitStore.getState().isMultiplayer) {
                const tracks = mediaStreamFrom3DCanvas.getTracks();
                room.localParticipant.unpublishTracks(tracks);
            } else {
                const handleTrack = async (mediaStream: MediaStream) => {
                    const track = mediaStream.getVideoTracks()[0];
                    const publishedTrack = await room.localParticipant.publishTrack(
                        track,
                        {
                            name: "avatar_video",
                            source: Track.Source.Camera,
                        }
                    );

                    if (clientSettings.DEBUG) {
                        console.log("Published 3D canvas as camera stream");
                    }
                    return publishedTrack;
                };

                if (room.state === ConnectionState.Connected) {
                    handleTrack(mediaStreamFrom3DCanvas);
                } else {
                    room.once("connected", () => {
                        if (mediaStreamFrom3DCanvas) {
                            handleTrack(mediaStreamFrom3DCanvas);
                        }
                    });
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoDevices]);

    // Mainly for cleanup
    useEffect(() => {
        toggle(false); // camera off by default
        return () => {
            toggle(false); // turn camera off (for multiplayer)

            if (mediaStreamFrom3DCanvas) {
                const tracks = mediaStreamFrom3DCanvas.getTracks();
                for (const track of tracks) {
                    track.stop();
                }
                room.localParticipant.unpublishTracks(tracks);
            }
            updateMediaStream();
            for (const pub of room.localParticipant.videoTrackPublications.values()) {
                if (pub.videoTrack) {
                    room.localParticipant.unpublishTrack(pub.videoTrack);
                }
            }

            const track =
                room.localParticipant.getTrackPublicationByName("avatar_video");
            if (track?.track) {
                room.localParticipant.unpublishTrack(track.track);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // show waiting text if camera is not available
    if (videoDevices.length === 0) {
        return <WaitingText>Waiting for camera...</WaitingText>;
    }

    return (
        <>
            {/* To display 2D hands from Hand Landmarker */}
            {/* <CanvasStyled
                id="hand-canvas"
                $viewportFill={isViewportFill}
                $fullscreen={isFullscreen}
                style={{ border: "none", zIndex: 1 }}
            /> */}

            <CanvasStyled
                id="avatar-canvas"
                ref={bjsCanvasContainer}
                $isForRoom={pathName === "/room"}
            />
        </>
    );
};
