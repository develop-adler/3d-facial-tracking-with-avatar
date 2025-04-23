import {
    FaceLandmarker,
    FilesetResolver,
    type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

let lastVideoTime = -1;
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
                modelAssetPath: "/face_landmarker.task", // `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU",
            },
            numFaces: 1,
            runningMode,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
        });
    };

    private async _predictWebcam(
        faceLandmarker: FaceLandmarker,
        video: HTMLVideoElement,
        // isWebcamRunning: boolean
    ): Promise<FaceLandmarkerResult | null> {
        // const aspectRatio = video.videoHeight / video.videoWidth;
        // video.style.width = videoWidth + "px";
        // video.style.height = videoWidth * aspectRatio + "px";
        // canvasElement.style.width = videoWidth + "px";
        // canvasElement.style.height = videoWidth * aspectRatio + "px";
        // canvasElement.width = video.videoWidth;
        // canvasElement.height = video.videoHeight;

        // Now let's start detecting the stream.
        if (faceLandmarkerRunningMode === "IMAGE") {
            faceLandmarkerRunningMode = "VIDEO";
            await faceLandmarker.setOptions({ runningMode: faceLandmarkerRunningMode });
        }

        let results: FaceLandmarkerResult | null = null;
        const startTimeMs = performance.now();
        if (lastVideoTime !== video.currentTime) {
            lastVideoTime = video.currentTime;
            results = faceLandmarker.detectForVideo(video, startTimeMs);
        }
        return results;

        // // Call this function again to keep predicting when the browser is ready.
        // if (isWebcamRunning === true) {
        //     window.requestAnimationFrame(() =>
        //         _predictWebcam(faceLandmarker, video, isWebcamRunning)
        //     );
        // }
    };

    async init() {
        this.faceLandmarker = await this._createFaceLandmarker();
        return this.faceLandmarker;
    }

    async detect() {
        if (this.faceLandmarker && this.video) {
            const results = await this._predictWebcam(this.faceLandmarker, this.video);
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
