import { getCenterIndex, normalize } from "@/app/utils/utilities";

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

// export const getFaceSize = (boundingBox: {
//     topLeft: number[];
//     bottomRight: number[];
// }): number => {
//     const width = boundingBox.bottomRight[0] - boundingBox.topLeft[0];
//     const height = boundingBox.bottomRight[1] - boundingBox.topLeft[1];
//     return Math.sqrt(width ** 2 + height ** 2); // diagonal length
// };

// export const getFaceSize = (
//     mesh: number[][],
//     headRotation?: Quaternion
// ): number => {
//     const forehead = Vector3.FromArray(mesh[10]);
//     const chin = Vector3.FromArray(mesh[152]);
//     const leftEar = Vector3.FromArray(mesh[234]);
//     const rightEar = Vector3.FromArray(mesh[454]);

//     if (headRotation) {
//         const invRot = headRotation.invert();
//         const transform = Matrix.Identity();
//         Matrix.FromQuaternionToRef(invRot, transform);

//         const localForehead = Vector3.TransformCoordinates(forehead, transform);
//         const localChin = Vector3.TransformCoordinates(chin, transform);
//         const localLeftEar = Vector3.TransformCoordinates(leftEar, transform);
//         const localRightEar = Vector3.TransformCoordinates(rightEar, transform);

//         const vertical = Vector3.Distance(localChin, localForehead);
//         const horizontal = Vector3.Distance(localLeftEar, localRightEar);
//         return Math.sqrt(vertical ** 2 + horizontal ** 2); // diagonal
//     }

//     const vertical = Vector3.Distance(chin, forehead);
//     const horizontal = Vector3.Distance(leftEar, rightEar);
//     return Math.sqrt(vertical ** 2 + horizontal ** 2);
// };

export const getFaceWidth = (
    mesh: number[][],
    headRotation?: Quaternion
): number => {
    const leftEar = Vector3.FromArray(mesh[234]);
    const rightEar = Vector3.FromArray(mesh[454]);

    if (headRotation) {
        const invRot = headRotation.invert();
        const transform = Matrix.Identity();
        Matrix.FromQuaternionToRef(invRot, transform);

        const localLeftEar = Vector3.TransformCoordinates(leftEar, transform);
        const localRightEar = Vector3.TransformCoordinates(rightEar, transform);
        return Vector3.Distance(localLeftEar, localRightEar);
    }

    return Vector3.Distance(leftEar, rightEar);
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
    upperIndex: number,
    lowerIndex: number,
    mesh: number[][],
    faceWidth: number,
    headRotation?: Quaternion
): number => {
    let upper = Vector3.FromArray(mesh[upperIndex]);
    let lower = Vector3.FromArray(mesh[lowerIndex]);

    if (headRotation) {
        const invRot = headRotation.invert();
        const transform = Matrix.Identity();
        Matrix.FromQuaternionToRef(invRot, transform);
        upper = Vector3.TransformCoordinates(upper, transform);
        lower = Vector3.TransformCoordinates(lower, transform);
    }

    const dist = Vector3.Distance(upper, lower) / faceWidth;
    return normalize(dist, 0.065, 0.025);
};

export const getBrowWeights = (
    mesh: number[][],
    faceWidth: number,
    headRotation?: Quaternion
) => {
    const rotMatrix = headRotation
        ? (() => {
              const m = Matrix.Identity();
              Matrix.FromQuaternionToRef(headRotation.invert(), m);
              return m;
          })()
        : null;

    const getPoint = (index: number) => {
        const point = Vector3.FromArray(mesh[index]);
        return rotMatrix ? Vector3.TransformCoordinates(point, rotMatrix) : point;
    };

    // Outer brow raise (brow to eyelid)
    const leftBrowOuter = getPoint(336);
    const leftEyeUpper = getPoint(386);
    const rightBrowOuter = getPoint(107);
    const rightEyeUpper = getPoint(159);

    const leftBrowDist = Vector3.Distance(leftBrowOuter, leftEyeUpper) / faceWidth;
    const rightBrowDist = Vector3.Distance(rightBrowOuter, rightEyeUpper) / faceWidth;

    // Inner brow raise
    const leftInnerBrow = getPoint(296);
    const rightInnerBrow = getPoint(334);
    const innerBrow = Vector3.Center(leftInnerBrow, rightInnerBrow);
    const centerBetweenEyes = getPoint(168);
    const innerDist = Vector3.Distance(innerBrow, centerBetweenEyes) / faceWidth;
    

    return {
        browOuterUpLeft: normalize(leftBrowDist, 0.225, 0.17),
        browOuterUpRight: normalize(rightBrowDist, 0.225, 0.17),
        browInnerUp: normalize(innerDist, 0.318, 0.28),
        // browDownLeft: 1 - normalize(0.1 - leftBrowDist, 0.0, 0.04),
        // browDownRight: 1 - normalize(0.1 - rightBrowDist, 0.0, 0.04),
    };
};

export const getEyeLookWeights = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    annotations: any,
    faceWidth: number
): Record<string, number> => {
    const getCenter = (points: number[][]): Vector3 =>
        Vector3.FromArray(points.at(getCenterIndex(points.length))!);

    const leftIris = getCenter(annotations.leftEyeIris);
    const rightIris = getCenter(annotations.rightEyeIris);
    const leftEye = getCenter(annotations.leftEyeUpper0);
    const rightEye = getCenter(annotations.rightEyeUpper0);

    const leftDelta = leftIris.subtract(leftEye).scale(1 / faceWidth);
    const rightDelta = rightIris.subtract(rightEye).scale(1 / faceWidth);

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
    mesh: number[][],
    faceWidth: number,
    headRotation?: Quaternion
): number => {
    let upper = Vector3.FromArray(mesh[13]); // upper lip center
    let lower = Vector3.FromArray(mesh[14]); // lower lip center

    if (headRotation) {
        const invRot = headRotation.invert();
        const transform = Matrix.Identity();
        Matrix.FromQuaternionToRef(invRot, transform);
        upper = Vector3.TransformCoordinates(upper, transform);
        lower = Vector3.TransformCoordinates(lower, transform);
    }

    const dist = Vector3.Distance(upper, lower) / faceWidth;
    return normalize(dist, 0.017, 0.2);
};

export const getMouthPuckerWeight = (
    mesh: number[][],
    faceWidth: number,
    headRotation?: Quaternion
): number => {
    let left = Vector3.FromArray(mesh[61]);
    let right = Vector3.FromArray(mesh[291]);

    if (headRotation) {
        const invRot = headRotation.invert();
        const transform = Matrix.Identity();
        Matrix.FromQuaternionToRef(invRot, transform);
        left = Vector3.TransformCoordinates(left, transform);
        right = Vector3.TransformCoordinates(right, transform);
    }

    const dist = Vector3.Distance(left, right) / faceWidth;
    return normalize(dist, 0.355, 0.33);
};

export const getMouthSmileFrownWeights = (
    mesh: number[][],
    faceWidth: number,
    headRotation?: Quaternion
) => {
    const rotMatrix = headRotation
        ? (() => {
              const m = Matrix.Identity();
              Matrix.FromQuaternionToRef(headRotation.invert(), m);
              return m;
          })()
        : null;

    const getPoint = (index: number) => {
        const point = Vector3.FromArray(mesh[index]);
        return rotMatrix ? Vector3.TransformCoordinates(point, rotMatrix) : point;
    };

    const leftEye = getPoint(263);
    const rightEye = getPoint(33);
    const leftMouth = getPoint(61);
    const rightMouth = getPoint(291);

    const leftVertical = (leftEye.y - leftMouth.y) / faceWidth;
    const rightVertical = (rightEye.y - rightMouth.y) / faceWidth;

    console.log('leftVertical:', leftVertical);
    console.log('rightVertical:', rightVertical);
    console.log('-----------');

    return {
        mouthSmileLeft: normalize(-leftVertical, 0.54, 0.39),
        mouthSmileRight: normalize(-rightVertical, 0.47, 0.36),
        mouthFrownLeft: normalize(-leftVertical, 0.01, 0.04),
        mouthFrownRight: normalize(-rightVertical, 0.01, 0.04),
    };
};

export const computeFaceWeights = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceMesh: any,
    faceWidth: number,
    headRotation: Quaternion
): Record<string, number> => {
    const weights: Record<string, number> = {};

    // Eyes
    const leftBlink = getEyeBlinkWeight(386, 374, faceMesh, faceWidth, headRotation);
    const rightBlink = getEyeBlinkWeight(159, 145, faceMesh, faceWidth, headRotation);
    weights.eyeBlinkLeft = leftBlink;
    weights.eyeBlinkRight = rightBlink;

    // Iris (very inaccurate)
    // const eyeWeights = getEyeLookWeights(annotations, faceWidth);
    // weights.eyeLookInLeft = eyeWeights.eyeLookInLeft;
    // weights.eyeLookOutLeft = eyeWeights.eyeLookOutLeft;
    // weights.eyeLookUpLeft = eyeWeights.eyeLookUpLeft;
    // weights.eyeLookDownLeft = eyeWeights.eyeLookDownLeft;

    // weights.eyeLookInRight = eyeWeights.eyeLookInRight;
    // weights.eyeLookOutRight = eyeWeights.eyeLookOutRight;
    // weights.eyeLookUpRight = eyeWeights.eyeLookUpRight;
    // weights.eyeLookDownRight = eyeWeights.eyeLookDownRight;

    // Brows (brow tracking is somewhat faulty right now)
    const browWeights = getBrowWeights(faceMesh, faceWidth, headRotation);
    weights.browOuterUpLeft = browWeights.browOuterUpLeft;
    weights.browOuterUpRight = browWeights.browOuterUpRight;
    weights.browInnerUp = browWeights.browInnerUp;
    // weights.browDownLeft = browWeights.browDownLeft;
    // weights.browDownRight = browWeights.browDownRight;

    // Jaw
    const jawOpen = getJawOpenWeight(faceMesh, faceWidth, headRotation);
    weights.jawOpen = jawOpen;

    weights.mouthPucker = getMouthPuckerWeight(faceMesh, faceWidth, headRotation);

    // Mouth (W.I.P, but may not be needed)
    // const mouthParts = getMouthOpenParts(annotations, faceWidth);
    // weights.mouthLowerDownLeft = mouthParts.mouthLowerDownLeft;
    // weights.mouthLowerDownRight = mouthParts.mouthLowerDownRight;
    // weights.mouthUpperUpLeft = mouthParts.mouthUpperUpLeft;
    // weights.mouthUpperUpRight = mouthParts.mouthUpperUpRight;

    // Smile
    const smileWeights = getMouthSmileFrownWeights(faceMesh, faceWidth, headRotation);
    weights.mouthSmileLeft = smileWeights.mouthSmileLeft;
    weights.mouthSmileRight = smileWeights.mouthSmileRight;
    // weights.mouthFrownLeft = smileWeights.mouthFrownLeft;
    // weights.mouthFrownRight = smileWeights.mouthFrownRight;

    return weights;
};
