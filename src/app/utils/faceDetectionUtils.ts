import { getCenterIndex, getDistance, normalize } from "@/app/utils/utilities";

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

export const getFaceSize = (boundingBox: {
    topLeft: number[];
    bottomRight: number[];
}): number => {
    const width = boundingBox.bottomRight[0] - boundingBox.topLeft[0];
    const height = boundingBox.bottomRight[1] - boundingBox.topLeft[1];
    return Math.sqrt(width ** 2 + height ** 2); // diagonal length
};

export const getMouthOpenWeight = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    annotations: any,
    faceSize: number
): number => {
    const upper = annotations.lipsUpperInner[5];
    const lower = annotations.lipsLowerInner[5];
    const dist = getDistance(upper, lower);
    return normalize(dist / faceSize, 0.01, 0.07); // 1 = fully open
};

/**
 * Calculates the weight of the eyebrow raise based on the distance between the upper brow and lower brow.
 * @param annotations Face detection annotations
 * @param faceSize The size of the face
 * @param upperBrow Key value for the upper brow
 * @param lowerBrow Key value for the lower brow
 * @param sensitivity The lower the value, the more sensitive the detection
 * @returns The weight of the eyebrow raise
 */
export const getEyeBrowRaiseWeights = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    annotations: any,
    faceSize: number,
    upperBrowKey: string,
    lowerRefKey: string
): { inner: number; middle: number; outer: number } => {
    const brow = annotations[upperBrowKey];
    const eye = annotations[lowerRefKey];

    const getWeight = (
        browIndex: number,
        eyeIndex: number,
        min: number,
        max: number
    ) => {
        const dist = getDistance(brow[browIndex], eye[eyeIndex]);
        return 1 - normalize(dist / faceSize, min, max);
    };

    return {
        inner: getWeight(0, 0, 0.03, 0.05),
        middle: getWeight(2, 2, 0.02, 0.06),
        outer: getWeight(4, 4, 0.03, 0.05),
    };
};

export const getHeadRotationFromMesh = (
    mesh: number[][],
    correction: Quaternion = Quaternion.Identity()
): Quaternion => {
    const leftEar = Vector3.FromArray(mesh[234]);
    const rightEar = Vector3.FromArray(mesh[454]);
    const forehead = Vector3.FromArray(mesh[10]);
    const chin = Vector3.FromArray(mesh[152]);

    // X axis: from right to left ear
    const xAxis = rightEar.subtract(leftEar).normalize();

    // Y axis: from chin to forehead (upward)
    const yAxis = forehead.subtract(chin).normalize();

    // Z axis: forward, perpendicular to both
    const zAxis = Vector3.Cross(xAxis, yAxis).normalize();

    // Re-orthogonalize
    const correctedYAxis = Vector3.Cross(zAxis, xAxis).normalize();

    // Build rotation matrix
    // eslint-disable-next-line
    let mat = Matrix.Identity();
    Matrix.FromXYZAxesToRef(xAxis, correctedYAxis, zAxis, mat);
    const faceQuat = Quaternion.FromRotationMatrix(mat);
    return correction.multiply(faceQuat); // face * correction
};

export const getEyeBlinkWeight = (
    upper: number[][],
    lower: number[][],
    faceSize: number
): number => {
    const dist = Vector3.FromArray(upper[3])
        .subtract(Vector3.FromArray(lower[4]))
        .length();
    return 1 - normalize(dist / faceSize, 0.005, 0.025);
};

export const getEyebrowRaise = (
    brow: number[],
    eye: number[],
    faceSize: number
): number => {
    const dist = Vector3.FromArray(brow)
        .subtract(Vector3.FromArray(eye))
        .length();
    return normalize(dist / faceSize, 0.025, 0.045);
};

export const getBrowWeights = (annotations: any, faceSize: number) => {
    const getMid = (arr: number[][]) =>
        Vector3.FromArray(arr.at(getCenterIndex(arr.length))!);
    const getFirst = (arr: number[][]) => Vector3.FromArray(arr.at(0)!);

    // Outer brow raise (midpoint)
    const leftOuter = getMid(annotations.leftEyebrowUpper);
    const rightOuter = getMid(annotations.rightEyebrowUpper);
    const leftEye = getMid(annotations.leftEyeUpper0);
    const rightEye = getMid(annotations.rightEyeUpper0);

    const leftOuterDist = leftOuter.subtract(leftEye).length() / faceSize;
    const rightOuterDist = rightOuter.subtract(rightEye).length() / faceSize;

    // Inner brow raise (center between left & right)
    const innerBrow = getFirst(annotations.leftEyebrowUpper)
        .add(getFirst(annotations.rightEyebrowUpper))
        .scale(0.5);
    const innerEye = getFirst(annotations.leftEyeUpper0)
        .add(getFirst(annotations.rightEyeUpper0))
        .scale(0.5);
    const innerDist = innerBrow.subtract(innerEye).length() / faceSize;

    return {
        browOuterUpLeft: 1 - normalize(leftOuterDist, 0.02, 0.06),
        browOuterUpRight: 1 - normalize(rightOuterDist, 0.02, 0.06),
        browInnerUp: 1 - normalize(innerDist, 0.015, 0.045),
        browDownLeft: 1 - normalize(0.1 - leftOuterDist, 0.0, 0.04), // inverted outer raise
        browDownRight: 1 - normalize(0.1 - rightOuterDist, 0.0, 0.04),
    };
};
const getEyeLookWeights = (
    annotations: any,
    faceSize: number
): Record<string, number> => {
    const getCenter = (points: number[][]): Vector3 =>
        Vector3.FromArray(points.at(getCenterIndex(points.length))!);

    const leftIris = getCenter(annotations.leftEyeIris);
    const rightIris = getCenter(annotations.rightEyeIris);
    const leftEye = getCenter(annotations.leftEyeUpper0);
    const rightEye = getCenter(annotations.rightEyeUpper0);

    const leftDelta = leftIris.subtract(leftEye).scale(1 / faceSize);
    const rightDelta = rightIris.subtract(rightEye).scale(1 / faceSize);

    return {
        eyeLookInLeft: normalize(leftDelta.x, 0.005, 0.03),
        eyeLookOutLeft: normalize(-leftDelta.x, 0.005, 0.03),
        eyeLookUpLeft: normalize(-leftDelta.y, 0.005, 0.03),
        eyeLookDownLeft: normalize(leftDelta.y, 0.005, 0.03),

        eyeLookInRight: normalize(-rightDelta.x, 0.005, 0.03),
        eyeLookOutRight: normalize(rightDelta.x, 0.005, 0.03),
        eyeLookUpRight: normalize(-rightDelta.y, 0.005, 0.03),
        eyeLookDownRight: normalize(rightDelta.y, 0.005, 0.03),
    };
};

export const getJawOpenWeight = (
    annotations: any,
    faceSize: number
): number => {
    const upper =
        annotations.lipsUpperInner[
        getCenterIndex(annotations.lipsUpperInner.length)
        ];
    const lower =
        annotations.lipsLowerInner[
        getCenterIndex(annotations.lipsLowerInner.length)
        ];
    const dist = Vector3.FromArray(upper)
        .subtract(Vector3.FromArray(lower))
        .length();
    return normalize(dist / faceSize, 0.01, 0.06);
};

export const computeFaceWeights = (
    annotations: any,
    faceSize: number
): Record<string, number> => {
    const weights: Record<string, number> = {};

    // Eyes
    const leftBlink = getEyeBlinkWeight(
        annotations.leftEyeUpper0,
        annotations.leftEyeLower0,
        faceSize
    );
    const rightBlink = getEyeBlinkWeight(
        annotations.rightEyeUpper0,
        annotations.rightEyeLower0,
        faceSize
    );
    weights.eyeBlinkLeft = leftBlink;
    weights.eyeBlinkRight = rightBlink;

    // Iris (very inaccurate)
    // const eyeWeights = getEyeLookWeights(annotations, faceSize);
    // weights.eyeLookInLeft = eyeWeights.eyeLookInLeft;
    // weights.eyeLookOutLeft = eyeWeights.eyeLookOutLeft;
    // weights.eyeLookUpLeft = eyeWeights.eyeLookUpLeft;
    // weights.eyeLookDownLeft = eyeWeights.eyeLookDownLeft;

    // weights.eyeLookInRight = eyeWeights.eyeLookInRight;
    // weights.eyeLookOutRight = eyeWeights.eyeLookOutRight;
    // weights.eyeLookUpRight = eyeWeights.eyeLookUpRight;
    // weights.eyeLookDownRight = eyeWeights.eyeLookDownRight;

    // Brows (brow tracking is faulty right now)
    // const leftBrow = getEyebrowRaise(
    //     annotations.leftEyebrowUpper[3],
    //     annotations.leftEyeUpper0[3],
    //     faceSize
    // );
    // const rightBrow = getEyebrowRaise(
    //     annotations.rightEyebrowUpper[3],
    //     annotations.rightEyeUpper0[3],
    //     faceSize
    // );
    // weights.browOuterUpLeft = leftBrow;
    // weights.browOuterUpRight = rightBrow;

    // const browWeights = getBrowWeights(annotations, faceSize);
    // weights.browOuterUpLeft = browWeights.browOuterUpLeft;
    // weights.browOuterUpRight = browWeights.browOuterUpRight;
    // weights.browInnerUp = browWeights.browInnerUp;
    // weights.browDownLeft = browWeights.browDownLeft;
    // weights.browDownRight = browWeights.browDownRight;

    // Jaw
    const jawOpen = getJawOpenWeight(annotations, faceSize);
    weights.jawOpen = jawOpen;

    // Mouth (W.I.P, but may not be needed)
    // const mouthParts = getMouthOpenParts(annotations, faceSize);
    // weights.mouthLowerDownLeft = mouthParts.mouthLowerDownLeft;
    // weights.mouthLowerDownRight = mouthParts.mouthLowerDownRight;
    // weights.mouthUpperUpLeft = mouthParts.mouthUpperUpLeft;
    // weights.mouthUpperUpRight = mouthParts.mouthUpperUpRight;

    return weights;
};
