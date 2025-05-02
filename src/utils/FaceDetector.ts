import { globalTimestamp, updateGlobalTimestamp } from 'global';
import {
    FaceLandmarker,
    FilesetResolver,
    type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

let faceLandmarkerRunningMode: "IMAGE" | "VIDEO" = "VIDEO";

export class FaceDetector {
    faceLandmarker: FaceLandmarker | null = null;
    readonly video: HTMLVideoElement;

    constructor(video: HTMLVideoElement) {
        this.video = video;
    }

    // Before we can use HandLandmarker class we must wait for it to finish
    // loading. Machine Learning models can be large and take a moment to
    // get everything needed to run.
    private async _createFaceLandmarker(
        runningMode: "IMAGE" | "VIDEO" = faceLandmarkerRunningMode
    ): Promise<FaceLandmarker> {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "/@mediapipe-tasks-vision/wasm"
        );
        return await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: "/landmarker/face_landmarker.task", // `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU",
            },
            numFaces: 1,
            runningMode,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
        });
    }

    private async _predictWebcam(
        faceLandmarker: FaceLandmarker,
        video: HTMLVideoElement
    ): Promise<FaceLandmarkerResult | null> {
        if (faceLandmarkerRunningMode === "IMAGE") {
            faceLandmarkerRunningMode = "VIDEO";
            await faceLandmarker.setOptions({
                runningMode: faceLandmarkerRunningMode,
            });
        }

        updateGlobalTimestamp(performance.now());
        return faceLandmarker.detectForVideo(video, globalTimestamp);
    }

    async init() {
        this.faceLandmarker = await this._createFaceLandmarker();
        return this.faceLandmarker;
    }

    async detect() {
        if (this.faceLandmarker && this.video) {
            const results = await this._predictWebcam(
                this.faceLandmarker,
                this.video
            );
            return results;
        }
        return null;
    }

    dispose() {
        if (this.faceLandmarker) {
            this.faceLandmarker.close();
            this.faceLandmarker = null;
        }
    }
}

export type FaceDetectorType = InstanceType<typeof FaceDetector>;
