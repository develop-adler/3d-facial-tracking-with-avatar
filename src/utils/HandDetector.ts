import { globalTimestamp, updateGlobalTimestamp } from 'global';
import {
    HandLandmarker,
    FilesetResolver,
    type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

let handLandmarkerRunningMode: "IMAGE" | "VIDEO" = "VIDEO";

export class HandDetector {
    handLandmarker: HandLandmarker | null = null;
    readonly video: HTMLVideoElement;

    constructor(video: HTMLVideoElement) {
        this.video = video;
    }

    // Before we can use HandLandmarker class we must wait for it to finish
    // loading. Machine Learning models can be large and take a moment to
    // get everything needed to run.
    private async _createHandLandmarker(
        runningMode: "IMAGE" | "VIDEO" = handLandmarkerRunningMode
    ): Promise<HandLandmarker> {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "/@mediapipe-tasks-vision/wasm"
        );
        return await HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "/landmarker/hand_landmarker.task", // `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU",
            },
            numHands: 2,
            runningMode,
        });
    }

    private async _predictWebcam(
        handLandmarker: HandLandmarker,
        video: HTMLVideoElement
    ): Promise<HandLandmarkerResult | null> {
        if (handLandmarkerRunningMode === "IMAGE") {
            handLandmarkerRunningMode = "VIDEO";
            await handLandmarker.setOptions({
                runningMode: handLandmarkerRunningMode,
            });
        }

        updateGlobalTimestamp(performance.now());
        return handLandmarker.detectForVideo(video, globalTimestamp);
    }

    async init() {
        this.handLandmarker = await this._createHandLandmarker();
        return this.handLandmarker;
    }

    async detect() {
        if (this.handLandmarker && this.video) {
            const results = await this._predictWebcam(
                this.handLandmarker,
                this.video
            );
            return results;
        }
        return null;
    }

    dispose() {
        if (this.handLandmarker) {
            this.handLandmarker.close();
            this.handLandmarker = null;
        }
    }
}

export type HandDetectorType = InstanceType<typeof HandDetector>;
