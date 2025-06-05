import { DrawingUtils, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export const drawPoseLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[][],
    drawingUtils: DrawingUtils
): void => {
    const { width, height } = ctx.canvas;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    for (const landmark of landmarks) {
        drawingUtils.drawLandmarks(landmark, {
            radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1)
        });
        drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
    }
    ctx.restore();
};
