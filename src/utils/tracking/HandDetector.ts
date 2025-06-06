import { globalTimestamp, updateGlobalTimestamp } from 'global';
import {
    HandLandmarker,
    FilesetResolver,
    type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

let handLandmarkerRunningMode: "IMAGE" | "VIDEO" = "VIDEO";

export class HandDetector {
    handLandmarker?: HandLandmarker;
    readonly video: HTMLVideoElement;
    private _isDisposed: boolean = true;

    constructor(video: HTMLVideoElement) {
        this.video = video;
    }

    get isDisposed(): boolean {
        return this._isDisposed;
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
        const landmarker = await HandLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "/landmarker/hand_landmarker.task", // `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU",
            },
            numHands: 2,
            runningMode,
        });
        this._isDisposed = false;
        return landmarker;
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
        // eslint-disable-next-line unicorn/no-null
        return null;
    }

    dispose() {
        this.handLandmarker?.close();
        this.handLandmarker = undefined;
        this._isDisposed = true;
    }
}

export type HandDetectorType = InstanceType<typeof HandDetector>;
