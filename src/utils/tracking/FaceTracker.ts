import { DrawingUtils } from "@mediapipe/tasks-vision";
import { Matrix4, type Matrix4Tuple } from "three";

import { useAvatarStore } from "@/stores/useAvatarStore";
import { FaceDetector } from "@/utils/tracking/FaceDetector";
import { HandDetector } from "@/utils/tracking/HandDetector";
import { PoseDetector } from "@/utils/tracking/PoseDetector";
import SyncAvatarController from "@/utils/tracking/SyncAvatarController";
// import { drawConnectors, drawLandmarks } from "@/utils/landmarker/draw_hands";
import { hasGetUserMedia } from "@/utils/utilities";

import { useTrackingStore } from "@/stores/useTrackingStore";
import { drawPoseLandmarks } from "@/utils/landmarker/draw_pose";

const SafeVideo = (() =>
    typeof document === "undefined"
        ? ({
            getContext: () => { },
        } as unknown as HTMLVideoElement)
        : document.createElement("video"))();

class FaceTracker {
    private static instance: FaceTracker;
    readonly cameraVideoElem: HTMLVideoElement;
    faceDetector: FaceDetector;
    handDetector: HandDetector;
    poseDetector: PoseDetector;
    syncAvatarController?: SyncAvatarController;

    private _isMultiplayer: boolean;
    private _isGettingVideoStream: boolean;
    isStreamReady: boolean;
    isAvatarPositionReset: boolean;
    isAvatarHeadRotationReset: boolean;

    private _poseDrawingUtil?: DrawingUtils;
    private _isDisposed: boolean;

    private constructor() {
        this._isDisposed = false;
        this._isMultiplayer = false;
        this._isGettingVideoStream = false;
        this.isStreamReady = false;
        this.isAvatarPositionReset = false;
        this.isAvatarHeadRotationReset = false;

        if (typeof document === "undefined") {
            this.cameraVideoElem = SafeVideo;
            this.faceDetector = new FaceDetector(this.cameraVideoElem);
            this.faceDetector.dispose();
            this.handDetector = new HandDetector(this.cameraVideoElem);
            this.handDetector.dispose();
            this.poseDetector = new PoseDetector(this.cameraVideoElem);
            this.poseDetector.dispose();
            return;
        }

        this.cameraVideoElem = document.createElement("video");
        // prevent right click context menu
        this.cameraVideoElem.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });
        this.faceDetector = new FaceDetector(this.cameraVideoElem);
        this.faceDetector.init();
        this.handDetector = new HandDetector(this.cameraVideoElem);
        this.handDetector.init();
        this.poseDetector = new PoseDetector(this.cameraVideoElem);
        this.poseDetector.init();

        // for testing only
        // this.cameraVideoElem.id = "webcam";
        // this.cameraVideoElem.style.position = "absolute";
        // this.cameraVideoElem.style.top = "1rem";
        // this.cameraVideoElem.style.right = "0";
        // this.cameraVideoElem.style.width = "auto";
        // this.cameraVideoElem.style.height = "25%";
        // this.cameraVideoElem.style.zIndex = "1000";
        // this.cameraVideoElem.style.transform = "scaleX(-1)"; // flip video for mirror effect
        // this.cameraVideoElem.style.pointerEvents = "none"; // disable pointer events
        // document.body.appendChild(this.cameraVideoElem);

        // this.detect();
        // this.getUserVideoStream(this.cameraVideoElem);
    }
    get isMultiplayer() {
        return this._isMultiplayer;
    }
    get isDisposed() {
        return this._isDisposed;
    }

    static getInstance(): FaceTracker {
        if (!FaceTracker.instance) {
            FaceTracker.instance = new FaceTracker();
        }
        return FaceTracker.instance;
    }

    async track() {
        if (!this.isStreamReady) {
            await this.getUserVideoStream();
        }

        if (!this.cameraVideoElem.srcObject || !this.isStreamReady) return;
        if (this.faceDetector.isDisposed) return;

        const avatar = useAvatarStore.getState().avatar;

        if (!avatar) return;

        const [faceDetectResult, poseDetectResult] = await Promise.all([
            this.faceDetector.detect(),
            this.poseDetector.detect(),
        ]);

        // console.log({ faceDetectResult, poseDetectResult });

        if (poseDetectResult && poseDetectResult.landmarks.length > 0) {
            // draw 2D pose from landmarks
            const canvas = document.querySelector(
                "#pose-canvas"
            ) as HTMLCanvasElement | null;
            if (canvas) {
                const cxt = canvas.getContext("2d");
                if (!cxt) return;
                if (!this._poseDrawingUtil) {
                    this._poseDrawingUtil = new DrawingUtils(cxt);
                }
                drawPoseLandmarks(
                    cxt,
                    poseDetectResult.landmarks,
                    this._poseDrawingUtil
                );
            }
        }

        this.syncAvatarController ??= new SyncAvatarController(avatar, this);
        this.syncAvatarController.sync(faceDetectResult, poseDetectResult);
    }

    async detectFace() {
        if (!this.isStreamReady) {
            await this.getUserVideoStream();
        }

        if (this.faceDetector.isDisposed) return;

        const avatar = useAvatarStore.getState().avatar;

        if (!avatar || this.faceDetector.isDetecting) return;

        let result;
        try {
            result = await this.faceDetector.detect();
        } catch {
            this.faceDetector.dispose();
            this.faceDetector = new FaceDetector(this.cameraVideoElem);
            this.faceDetector.init();
            return;
        }

        if (!result || result.faceBlendshapes.length === 0) return;

        const matrixData = result.facialTransformationMatrixes[0].data;
        const faceMatrix = new Matrix4();
        faceMatrix.set(...(matrixData as Matrix4Tuple));

        // this.syncHeadRotation(avatar, faceMatrix);

        // // reset head rotation and avatar position for multiplayer
        // if (this._isMultiplayer && !this.isAvatarPositionReset) {
        //     avatar.root.position.set(0, 0, 0);
        //     this.isAvatarPositionReset = true;
        // }

        // this.syncHeadPosition(avatar, faceMatrix);
    }

    async detectPose() {
        if (!this.isStreamReady) {
            await this.getUserVideoStream();
        }

        if (this.poseDetector.isDisposed) return;

        const avatar = useAvatarStore.getState().avatar;

        if (!avatar) return;

        let result;
        try {
            result = await this.poseDetector.detect();
        } catch {
            this.poseDetector.dispose();
            this.poseDetector = new PoseDetector(this.cameraVideoElem);
            this.poseDetector.init();
            return;
        }

        if (!result || result.landmarks.length === 0) return;

        // draw 2D pose from landmarks
        const canvas = document.querySelector(
            "#pose-canvas"
        ) as HTMLCanvasElement | null;
        if (canvas) {
            const cxt = canvas.getContext("2d");
            if (!cxt) return;
            if (!this._poseDrawingUtil) {
                this._poseDrawingUtil = new DrawingUtils(cxt);
            }
            drawPoseLandmarks(cxt, result.landmarks, this._poseDrawingUtil);
        }

        // console.log("Pose landmarks detected:", result.landmarks);

        // TypeError: result.close is not a function
        // result.close();
    }

    setIsMultiplayer(isMultiplayer: boolean) {
        this._isMultiplayer = isMultiplayer;
        // re-run detection intervals
        this.isAvatarPositionReset = false;
        // this.detect();
    }

    async getUserVideoStream() {
        if (this.isStreamReady) return;
        if (this._isGettingVideoStream) return;
        if (!hasGetUserMedia()) throw new Error("No webcam access!");

        this._isGettingVideoStream = true;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
        });

        this.cameraVideoElem.srcObject = stream;
        this.cameraVideoElem.playsInline = true; // Important for iOS Safari
        await this.cameraVideoElem.play();
        this.isStreamReady = true;
        this._isGettingVideoStream = false;

        return stream;
    }

    /**
     * Dispose current FaceTracker instance and create a new one.
     * This is useful for resetting the state of the FaceTracker.
     * @returns new FaceTracker instance
     */
    dispose() {
        if (this._isDisposed) return;

        this.syncAvatarController = undefined;
        this._poseDrawingUtil?.close();
        this._poseDrawingUtil = undefined;

        this.faceDetector.dispose();
        this.handDetector.dispose();
        this.poseDetector.dispose();

        // eslint-disable-next-line unicorn/no-null
        this.cameraVideoElem.srcObject = null;
        this.cameraVideoElem.remove();
        this.isStreamReady = false;
        this._isMultiplayer = false;
        this.isAvatarPositionReset = false;
        this._isDisposed = true;

        FaceTracker.instance = new FaceTracker();
        useTrackingStore.setState({
            faceTracker: FaceTracker.instance,
        });
        return FaceTracker.instance;
    }
}

export default FaceTracker;
