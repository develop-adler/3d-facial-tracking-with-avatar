import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

type OptionFunc<T> = (args: {
    index: number;
    from: NormalizedLandmark;
    to?: NormalizedLandmark;
}) => T;

type Options = {
    color?: string | OptionFunc<string>;
    lineWidth?: number | OptionFunc<number>;
    radius?: number | OptionFunc<number>;
    visibility?: number;
    visibilityMin?: number;
};

export const HAND_CONNECTIONS = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [13, 17],
    [0, 17],
    [17, 18],
    [18, 19],
    [19, 20],
];

export const drawLandmarks = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    options: Options
) => {
    const defaultOptions = {
        color: "white",
        lineWidth: 2,
        radius: 4,
        visibilityMin: 0.5,
    };
    const opts = { ...defaultOptions, fillColor: options.color, ...options };

    ctx.save();
    const { width, height } = ctx.canvas;
    landmarks.forEach((landmark, index) => {
        // if (
        //     !landmark ||
        //     (landmark.visibility !== undefined &&
        //         landmark.visibility <= opts.visibilityMin)
        // )
        //     return;

        const fillColor =
            typeof opts.fillColor === "function"
                ? opts.fillColor({ index, from: landmark })
                : opts.fillColor;
        const strokeColor =
            typeof opts.color === "function"
                ? opts.color({ index, from: landmark })
                : opts.color;
        const lineWidth =
            typeof opts.lineWidth === "function"
                ? opts.lineWidth({ index, from: landmark })
                : opts.lineWidth;
        const radius =
            typeof opts.radius === "function"
                ? opts.radius({ index, from: landmark })
                : opts.radius;

        if (fillColor) ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;

        const path = new Path2D();
        path.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2);
        ctx.fill(path);
        ctx.stroke(path);
    });
    ctx.restore();
};

export const drawConnectors = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    options: Options
) => {
    const defaultOptions = {
        color: "white",
        lineWidth: 4,
        radius: 6,
        visibilityMin: 0.5,
    };
    const opts = { ...defaultOptions, fillColor: options.color, ...options };

    ctx.save();
    const { width, height } = ctx.canvas;
    HAND_CONNECTIONS.forEach(([startIdx, endIdx], index) => {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];

        if (!start || !end) return;
        // if (
        //     (start.visibility !== undefined &&
        //         start.visibility <= opts.visibilityMin) ||
        //     (end.visibility !== undefined && end.visibility <= opts.visibilityMin)
        // )
        //     return;

        ctx.beginPath();
        const strokeColor =
            typeof opts.color === "function"
                ? opts.color({ index, from: start, to: end })
                : opts.color;
        const lineWidth =
            typeof opts.lineWidth === "function"
                ? opts.lineWidth({ index, from: start, to: end })
                : opts.lineWidth;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
    });
    ctx.restore();
};
export const drawHandSilhouette = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    width: number,
    height: number
) => {
    if (!landmarks || landmarks.length !== 21) return;

    const px = (i: number) => landmarks[i].x * width;
    const py = (i: number) => landmarks[i].y * height;

    // Full outer contour including finger roots
    const path = [
        0,  // WRIST
        1, 2, 3, 4,       // thumb outer
        8, 7, 6, 5,       // index (around tip and back)
        12, 11, 10, 9,    // middle
        16, 15, 14, 13,   // ring
        20, 19, 18, 17,   // pinky
        0                // back to wrist to close
    ];

    ctx.beginPath();
    ctx.moveTo(px(path[0]), py(path[0]));

    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(px(path[i]), py(path[i]));
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(255, 224, 189, 0.4)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
};
