import type {
    FaceLandmarkerResult,
    PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { TFace, THand, TPose } from "kalidokit";

export type DetectorResult = {
    result: FaceLandmarkerResult | PoseLandmarkerResult;
    faceRigged?: TFace;
    poseRigged?: TPose;
    handLeftRigged?: THand<"Left">;
    handRightRigged?: THand<"Right">;
};

export type LandmarkerWorkerRequest =
    | {
        type: "init";
        payload: {
            wasmPath: string;
            modelAssetPath: string;
        };
    }
    | {
        type: "detect";
        payload: {
            bitmap: ImageBitmap;
            timestamp: number;
        };
    }
    | { type: "dispose"; payload: true };

export type LandmarkerWorkerResponse =
    | { type: "init_done"; payload: true }
    | {
        type: "result";
        payload: {
            result: FaceLandmarkerResult | PoseLandmarkerResult;
            // faceRigged?: TFace;
            // poseRigged?: TPose;
            // handLeftRigged?: THand<"Left">;
            // handRightRigged?: THand<"Right">;
        };
    }
    | { type: "error"; payload: { message: string } };
