/* eslint-disable unicorn/prefer-add-event-listener */

// This makes TypeScript happy about the worker environment
/// <reference lib="webworker" />
import {
    FaceLandmarker,
    FilesetResolver,
} from "@mediapipe/tasks-vision";
// import { Face, type TFace } from "kalidokit";

import type { LandmarkerWorkerRequest, LandmarkerWorkerResponse } from "@/models/tracking";

// Since we're in a worker, we need to import the main library script
// Make sure this version matches the one in your package.json
// globalThis.importScripts(
//     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js"
// );

let faceLandmarker: FaceLandmarker | undefined;

// Listen for messages from the main thread
globalThis.self.onmessage = async (event: MessageEvent<LandmarkerWorkerRequest>) => {
    const { type, payload } = event.data;

    switch (type) {
        case "init": {
            try {
                // Construct the full, absolute URL for the WASM files.
                // self.location.origin gives you the base URL (e.g., "https://localhost:3000")
                const wasmPath = new URL(
                    payload.wasmPath,
                    globalThis.self.location.origin
                ).toString();

                const filesetResolver = await FilesetResolver.forVisionTasks(
                    wasmPath
                );

                const modelAssetPath = new URL(
                    payload.modelAssetPath,
                    globalThis.self.location.origin
                ).toString();
                faceLandmarker = await FaceLandmarker.createFromOptions(
                    filesetResolver,
                    {
                        baseOptions: {
                            modelAssetPath,
                            delegate: "GPU",
                        },
                        numFaces: 1,
                        runningMode: "VIDEO",
                        outputFaceBlendshapes: true,
                        outputFacialTransformationMatrixes: true,
                    }
                );

                // Signal that initialization is complete
                globalThis.self.postMessage({ type: "init_done" } as LandmarkerWorkerResponse);
            } catch (error) {
                globalThis.self.postMessage({
                    type: "error",
                    payload: { message: (error as Error).message },
                } as LandmarkerWorkerResponse);
            }
            break;
        }

        case "detect": {
            if (!faceLandmarker) return;

            // Get the requestId from the payload
            const { bitmap, timestamp } = payload;
            const result = faceLandmarker.detectForVideo(bitmap, timestamp);

            // let faceRigged: TFace | undefined;

            // try {
            //     faceRigged = Face.solve(result.faceLandmarks[0], {
            //         runtime: "mediapipe",
            //         video: bitmap as unknown as HTMLVideoElement,
            //         imageSize: {
            //             width: bitmap.width,
            //             height: bitmap.height,
            //         },
            //         smoothBlink: false, // smooth left and right eye blink delays
            //         blinkSettings: [0.25, 0.75], // adjust upper and lower bound blink sensitivity
            //     });
            //     // console.log("Face VRM solver result:", faceRigged);
            // } catch {
            //     // empty
            // }

            // Send the result back to the main thread
            globalThis.self.postMessage({
                type: "result",
                payload: { result },
            } as LandmarkerWorkerResponse);

            // IMPORTANT: Close the bitmap to release memory
            bitmap.close();
            break;
        }
        case "dispose": {
            faceLandmarker?.close();
            faceLandmarker = undefined;
            globalThis.self.close(); // Terminates the worker
            break;
        }
    }
};
