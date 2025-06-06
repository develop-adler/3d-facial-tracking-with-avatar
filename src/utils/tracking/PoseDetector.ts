import { globalTimestamp, updateGlobalTimestamp } from 'global';
import {
    PoseLandmarker,
    FilesetResolver,
    type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

let poseLandmarkerRunningMode: "IMAGE" | "VIDEO" = "VIDEO";

export class PoseDetector {
    poseLandmarker?: PoseLandmarker;
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
    private async _createPoseLandmarker(
        runningMode: "IMAGE" | "VIDEO" = poseLandmarkerRunningMode
    ): Promise<PoseLandmarker> {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "/@mediapipe-tasks-vision/wasm"
        );
        const landmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "/landmarker/pose_landmarker_lite.task",
                delegate: "GPU",
            },
            numPoses: 1,
            runningMode,
        });
        this._isDisposed = false;
        return landmarker;
    }

    private async _predictWebcam(
        poseLandmarker: PoseLandmarker,
        video: HTMLVideoElement
    ): Promise<PoseLandmarkerResult | null> {
        if (poseLandmarkerRunningMode === "IMAGE") {
            poseLandmarkerRunningMode = "VIDEO";
            await poseLandmarker.setOptions({
                runningMode: poseLandmarkerRunningMode,
            });
        }

        updateGlobalTimestamp(performance.now());
        return poseLandmarker.detectForVideo(video, globalTimestamp);
    }

    async init() {
        this.poseLandmarker = await this._createPoseLandmarker();
        return this.poseLandmarker;
    }

    async detect() {
        if (this.poseLandmarker && this.video) {
            const results = await this._predictWebcam(
                this.poseLandmarker,
                this.video
            );
            return results;
        }
        // eslint-disable-next-line unicorn/no-null
        return null;
    }

    dispose() {
        this.poseLandmarker?.close();
        this.poseLandmarker = undefined;
        this._isDisposed = true;
    }
}

export type PoseDetectorType = InstanceType<typeof PoseDetector>;
