/* eslint-disable unicorn/prefer-add-event-listener */

// This makes TypeScript happy about the worker environment
/// <reference lib="webworker" />

import type {
    LandmarkerWorkerRequest,
    LandmarkerWorkerResponse,
} from "@/models/tracking";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
// import { Pose, type TPose } from "kalidokit";

// Since we're in a worker, we need to import the main library script
// Make sure this version matches the one in your package.json
// globalThis.importScripts(
//     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js"
// );

let poseLandmarker: PoseLandmarker | undefined;

// Listen for messages from the main thread
globalThis.self.onmessage = async (
    event: MessageEvent<LandmarkerWorkerRequest>
) => {
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

                const filesetResolver = await FilesetResolver.forVisionTasks(wasmPath);

                const modelAssetPath = new URL(
                    payload.modelAssetPath,
                    globalThis.self.location.origin
                ).toString();
                poseLandmarker = await PoseLandmarker.createFromOptions(
                    filesetResolver,
                    {
                        baseOptions: {
                            modelAssetPath,
                            delegate: "GPU",
                        },
                        numPoses: 1,
                        runningMode: "VIDEO",
                        outputSegmentationMasks: false,
                    }
                );

                // Signal that initialization is complete
                globalThis.self.postMessage({
                    type: "init_done",
                } as LandmarkerWorkerResponse);
            } catch (error) {
                globalThis.self.postMessage({
                    type: "error",
                    payload: { message: (error as Error).message },
                } as LandmarkerWorkerResponse);
            }
            break;
        }

        case "detect": {
            if (!poseLandmarker) return;

            // Get the requestId from the payload
            const { bitmap, timestamp } = payload;
            const result = poseLandmarker.detectForVideo(bitmap, timestamp);

            // let poseRigged: TPose | undefined;

            // try {
            //     poseRigged = Pose.solve(result.worldLandmarks[0], result.landmarks[0], {
            //         runtime: "mediapipe",
            //         video: bitmap as unknown as HTMLVideoElement,
            //         imageSize: {
            //             width: bitmap.width,
            //             height: bitmap.height,
            //         },
            //         enableLegs: false,
            //     });
            //     // console.log("Pose VRM solver result:", poseRigged);
            //     // console.log("Pose VRM solver result:", poseRigged);
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
            poseLandmarker?.close();
            poseLandmarker = undefined;
            globalThis.self.close(); // Terminates the worker
            break;
        }
    }
};
