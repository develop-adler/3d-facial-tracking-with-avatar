import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

import type {
    // DetectorResult,
    LandmarkerWorkerRequest,
    LandmarkerWorkerResponse,
} from "@/models/tracking";

import { clientSettings } from "clientSettings";

export class FaceDetector {
    private worker?: Worker;
    private _isDisposed: boolean;
    readonly video: HTMLVideoElement;

    private _activeRequest?: {
        resolve: (result: FaceLandmarkerResult) => void;
        reject: (reason?: unknown) => void;
    };
    private _isDetecting: boolean;

    constructor(video: HTMLVideoElement) {
        this.video = video;
        this._isDisposed = true;
        this._isDetecting = false;
    }

    get isDetecting(): boolean {
        return this._isDetecting;
    }
    get isDisposed(): boolean {
        return this._isDisposed;
    }

    /**
     * Initializes the worker and the FaceLandmarker instance within it.
     * Returns a promise that resolves when the landmarker is ready.
     */
    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            // For Next.js/Turbopack/Webpack, this is the correct way to load a worker.
            // It tells the bundler to create a separate chunk for the worker file.
            this.worker = new Worker(
                new URL("@/workers/face-detector.worker.ts", import.meta.url),
                { type: "module" }
            );

            const onMessageHandler = (event: MessageEvent) => {
                const { type, payload } = event.data as LandmarkerWorkerResponse;
                switch (type) {
                    case "init_done": {
                        this._isDisposed = false;
                        if (clientSettings.DEBUG) {
                            console.log("FaceDetector worker initialized successfully.");
                        }
                        resolve();
                        break;
                    }
                    case "result": {
                        // If there's an active request, resolve its promise
                        // this._activeRequest?.resolve({
                        //     result: payload.result as FaceLandmarkerResult,
                        //     faceRigged: payload.faceRigged,
                        // });
                        this._activeRequest?.resolve(payload.result as FaceLandmarkerResult);
                        this._activeRequest = undefined;
                        break;
                    }
                    case "error": {
                        if (clientSettings.DEBUG) {
                            console.error("Error from FaceDetector worker:", payload.message);
                        }
                        this.worker?.removeEventListener("message", onMessageHandler);
                        this._activeRequest?.reject(new Error(payload.message));
                        this._activeRequest = undefined;
                        reject(new Error(payload.message));
                        break;
                    }
                }
            };

            this.worker.addEventListener("message", onMessageHandler);

            // Send the init command to the worker
            this.worker.postMessage({
                type: "init",
                payload: {
                    wasmPath: "/@mediapipe-tasks-vision/wasm",
                    modelAssetPath: "/landmarker/face_landmarker.task",
                },
            } as LandmarkerWorkerRequest);
        });
    }

    /**
     * Grabs a frame from the video, creates an ImageBitmap, sends it to the worker,
     * and returns a Promise that resolves with the detection result.
     */
    async detect(): Promise<FaceLandmarkerResult | undefined> {
        if (this._isDisposed || !this.worker) {
            console.warn("Detector is disposed or not initialized. Cannot detect.");
            return;
        }

        if (this._isDetecting) return;
        if (!this.video.srcObject) return;

        const bitmap = await createImageBitmap(this.video);

        this._isDetecting = true;
        const promise = new Promise<FaceLandmarkerResult>((resolve, reject) => {
            this._activeRequest = { resolve, reject };

            this.worker?.postMessage(
                {
                    type: "detect",
                    payload: { bitmap, timestamp: performance.now() },
                } as LandmarkerWorkerRequest,
                [bitmap]
            );
        });

        promise.finally(() => {
            this._isDetecting = false;
        });

        return promise;
    }

    /**
     * Terminates the worker and cleans up resources.
     */
    dispose() {
        if (this.worker) {
            this.worker.postMessage({ type: "dispose" } as LandmarkerWorkerRequest);
            this.worker = undefined;
        }
        this._activeRequest?.reject();
        this._activeRequest = undefined;
        this._isDisposed = true;
    }
}
