import {
    type Category,
    type FaceLandmarkerResult,
    type HandLandmarkerResult,
    type Landmark,
    type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { VRMExpressionPresetName, VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
    Hand,
    // type EulerRotation,
    Utils,
    Vector,
    Face,
    type TFace,
    type THand,
    Pose,
    type TPose,
    type Side,
} from "kalidokit";

import type Avatar from "@/3dthree/avatar/Avatar";
import { PoseLandmarkNameIndex, type RPMBoneName } from "@/models/avatar";
import type FaceTracker from "@/utils/tracking/FaceTracker";

type VectorObject = {
    x: number;
    y: number;
    z: number;
};

// const toVec3 = (
//     landmark: NormalizedLandmark | Vector | EulerRotation
// ): Vector3 => new Vector3(landmark.x, landmark.y, landmark.z);

// Import Helper Functions from Kalidokit
const clamp = Utils.clamp;
const lerp = Vector.lerp;

// Helper functions you will need to implement based on your Vector library
// or using THREE.Vector3 methods.
const findRotation = (p1: Vector3, p2: Vector3): Euler => {
    const direction = new Vector3().subVectors(p2, p1).normalize();
    return new Euler(
        Math.asin(-direction.y), // Pitch
        Math.atan2(direction.x, direction.z), // Yaw
        0 // Roll is calculated separately or ignored
    );
};

const angleBetween3DCoords = (
    p1: Vector3,
    p2: Vector3,
    p3: Vector3
): number => {
    const v1 = new Vector3().subVectors(p1, p2).normalize();
    const v2 = new Vector3().subVectors(p3, p2).normalize();
    return v1.angleTo(v2);
};

/**
 * Calculates arm rotation as euler angles
 * @param {Array} lm : array of 3D pose vectors from tfjs or mediapipe
 */
export const calcArms = (lm: Landmark[]) => {
    //Pure Rotation Calculations
    const UpperArm = {
        r: Vector.findRotation(lm[11], lm[13]),
        l: Vector.findRotation(lm[12], lm[14]),
    };
    UpperArm.r.y = Vector.angleBetween3DCoords(lm[12], lm[11], lm[13]);
    UpperArm.l.y = Vector.angleBetween3DCoords(lm[11], lm[12], lm[14]);
    const LowerArm = {
        r: Vector.findRotation(lm[13], lm[15]),
        l: Vector.findRotation(lm[14], lm[16]),
    };
    LowerArm.r.y = Vector.angleBetween3DCoords(lm[11], lm[13], lm[15]);
    LowerArm.l.y = Vector.angleBetween3DCoords(lm[12], lm[14], lm[16]);
    LowerArm.r.z = clamp(LowerArm.r.z, -2.14, 0);
    LowerArm.l.z = clamp(LowerArm.l.z, -2.14, 0);
    const Hand = {
        r: Vector.findRotation(
            Vector.fromArray(lm[15]),
            Vector.lerp(Vector.fromArray(lm[17]), Vector.fromArray(lm[19]), 0.5)
        ),
        l: Vector.findRotation(
            Vector.fromArray(lm[16]),
            Vector.lerp(Vector.fromArray(lm[18]), Vector.fromArray(lm[20]), 0.5)
        ),
    };
    //Modify Rotations slightly for more natural movement
    const rightArmRig = rigArm(UpperArm.r, LowerArm.r, Hand.r, "Right");
    const leftArmRig = rigArm(UpperArm.l, LowerArm.l, Hand.l, "Left");
    return {
        //Scaled
        UpperArm: {
            r: rightArmRig.UpperArm,
            l: leftArmRig.UpperArm,
        },
        LowerArm: {
            r: rightArmRig.LowerArm,
            l: leftArmRig.LowerArm,
        },
        Hand: {
            r: rightArmRig.Hand,
            l: leftArmRig.Hand,
        },
        //Unscaled
        Unscaled: {
            UpperArm: UpperArm,
            LowerArm: LowerArm,
            Hand: Hand,
        },
    };
};
/**
 * Converts normalized rotation values into radians clamped by human limits
 * @param {Object} UpperArm : normalized rotation values
 * @param {Object} LowerArm : normalized rotation values
 * @param {Object} Hand : normalized rotation values
 * @param {Side} side : left or right
 */
export const rigArm = (
    UpperArm: Vector,
    LowerArm: Vector,
    Hand: Vector,
    side: Side = "Right"
): {
    UpperArm: Vector;
    LowerArm: Vector;
    Hand: Vector;
} => {
    // Invert modifier based on left vs right side
    const invert = side === "Right" ? 1 : -1;
    UpperArm.z *= -2.3 * invert;
    //Modify UpperArm rotationY  by LowerArm X and Z rotations
    UpperArm.y *= Math.PI * invert;
    UpperArm.y -= Math.max(LowerArm.x);
    UpperArm.y -= -invert * Math.max(LowerArm.z, 0);
    UpperArm.x -= 0.3 * invert;
    LowerArm.z *= -2.14 * invert;
    LowerArm.y *= 2.14 * invert;
    LowerArm.x *= 2.14 * invert;
    //Clamp values to human limits
    UpperArm.x = clamp(UpperArm.x, -0.5, Math.PI);
    LowerArm.x = clamp(LowerArm.x, -0.3, 0.3);
    Hand.y = clamp(Hand.z * 2, -0.6, 0.6); //side to side
    Hand.z = Hand.z * -2.3 * invert; //up down
    return {
        //Returns Values in Radians for direct 3D usage
        UpperArm: UpperArm,
        LowerArm: LowerArm,
        Hand: Hand,
    };
};

const getLeftRightHandIndices = (
    handedness: Category[][]
): [number, number] => {
    const leftHandIndex = handedness.findIndex(
        (hand) => hand[0].categoryName === "Left"
    );
    const rightHandIndex = handedness.findIndex(
        (hand) => hand[0].categoryName === "Right"
    );
    return [leftHandIndex, rightHandIndex];
};

/**
 * A controller to synchronize a js Avatar with data from a FaceTracker.
 * This class acts as a bridge, translating tracking data into avatar animations,
 * including head rotation, facial expressions (blendshapes), and body pose via IK.
 */
class SyncAvatarController {
    private readonly avatar: Avatar;
    private readonly tracker: FaceTracker;

    private readonly SMOOTH_FACTOR: number = 0.2;
    public poseScale = 1; // Adjust if world landmarks are at a different scale

    // Reusable js objects to avoid heap allocations in the loop
    private readonly _qTarget: Quaternion = new Quaternion();
    private readonly _headM4: Matrix4 = new Matrix4();
    private readonly _eRigged = new Euler();

    // Spine rotation helpers
    private readonly _qTargetWorld = new Quaternion();
    private readonly _qParentWorld = new Quaternion();
    private readonly _qTargetLocal = new Quaternion();
    private readonly _vShoulderCenter = new Vector3();
    private readonly _vHipCenter = new Vector3();
    private readonly _vSpineUp = new Vector3();
    private readonly _vShoulderLine = new Vector3();
    private readonly _vSpineForward = new Vector3();

    // head rotation helpers
    private readonly _headRawEuler: Euler = new Euler();
    private readonly _headRemappedEuler: Euler = new Euler();

    private _oldLookTarget: Euler = new Euler();

    constructor(avatar: Avatar, tracker: FaceTracker) {
        this.avatar = avatar;
        this.tracker = tracker;
    }

    /**
     * The main update function, intended to be called in your application's
     * render loop (e.g., requestAnimationFrame).
     */
    sync(
        faceResult?: FaceLandmarkerResult,
        poseResult?: PoseLandmarkerResult
    ): void {
        if (!this.avatar.isReady || !this.tracker.isStreamReady) {
            return;
        }

        if (this.avatar.vrm) {
            this._animateVRM(faceResult, poseResult);
        } else {
            if (faceResult && faceResult.faceBlendshapes.length > 0) {
                this._syncRPMHead(faceResult);
                this._syncRPMBlendshapes(faceResult);
            }

            if (poseResult) {
                this._syncRPMPose(poseResult);
            }
        }
    }

    /**
     * Uses the high-fidelity face matrix to orient the avatar's head bone.
     */
    private _syncRPMHead(result: FaceLandmarkerResult): void {
        const headBone = this.avatar.bones?.find((b) => b.name === "Head");
        if (!headBone || result.facialTransformationMatrixes.length === 0) {
            return;
        }

        // Get the raw matrix from MediaPipe
        this._headM4.fromArray(result.facialTransformationMatrixes[0].data);

        // Decompose the RAW matrix into a quaternion, then into Euler angles.
        // This gives us the pitch, yaw, and roll in MediaPipe's coordinate space.
        // We use 'YXZ' order, which is common for head rotations (Yaw, then Pitch, then Roll).
        this._qTarget.setFromRotationMatrix(this._headM4);
        this._headRawEuler.setFromQuaternion(this._qTarget, "YXZ");

        // - "looking up and down is inverted"
        //   MediaPipe's pitch (rotation around X) needs to be flipped.
        //   => y = -mediapipe.x
        //
        // - "tilting the head left/right (roll) just rotates the neck (yaw)"
        //   MediaPipe's roll (Z-axis) is being applied to the avatar's yaw (Y-axis).
        //   We need to swap them.
        //   => x = mediapipe.y (Yaw from Roll)
        //   => z = mediapipe.y (Roll from Yaw)
        //
        this._headRemappedEuler.set(
            this._headRawEuler.x, // Pitch (inverted)
            this._headRawEuler.y, // Roll (remapped from Yaw)
            this._headRawEuler.z, // Yaw (remapped from Roll)
            "YXZ" // Fix Euler order for RPM avatar
        );

        // make avatar look up a bit because the head is tilted down
        this._headRemappedEuler.x -= Math.PI * 0.1;

        // Reconstruct the target quaternion from our corrected Euler angles.
        this._qTarget.setFromEuler(this._headRemappedEuler);

        // Smoothly apply the final, correct rotation.
        headBone.quaternion.slerp(this._qTarget, this.SMOOTH_FACTOR);
    }

    /**
     * Maps the detected facial blendshapes to the avatar's morph targets.
     */
    private _syncRPMBlendshapes(result: FaceLandmarkerResult): void {
        if (!result.faceBlendshapes?.[0]) {
            return;
        }

        const blendshapes = result.faceBlendshapes[0].categories;
        for (const shape of blendshapes) {
            // The Avatar class already handles mapping and clamping
            this.avatar.setMorphTarget(shape.categoryName, shape.score);
        }
    }

    // Animate Rotation Helper function
    private _rigVRMRotation(
        name: keyof typeof VRMHumanBoneName,
        // eslint-disable-next-line unicorn/no-object-as-default-parameter
        rotation: VectorObject = { x: 0, y: 0, z: 0 },
        dampener = 1,
        lerpAmount = 0.3
    ) {
        const bone = this.avatar.vrm?.humanoid.getNormalizedBoneNode(
            VRMHumanBoneName[name as keyof typeof VRMHumanBoneName]
        );

        if (!bone) return;

        const euler = new Euler(
            rotation.x * dampener,
            rotation.y * dampener,
            rotation.z * dampener
        );
        const quaternion = new Quaternion().setFromEuler(euler);
        bone.quaternion.slerp(quaternion, lerpAmount); // interpolate
    }

    // Animate Position Helper Function
    private _rigVRMPosition(
        name: keyof typeof VRMHumanBoneName,
        // eslint-disable-next-line unicorn/no-object-as-default-parameter
        position: VectorObject = { x: 0, y: 0, z: 0 },
        dampener = 1,
        lerpAmount = 0.3
    ) {
        if (!this.avatar.vrm) return;
        const bone = this.avatar.vrm.humanoid.getNormalizedBoneNode(
            VRMHumanBoneName[name]
        );
        if (!bone) return;

        const vector = new Vector3(
            position.x * dampener,
            position.y * dampener,
            position.z * dampener
        );
        bone.position.lerp(vector, lerpAmount); // interpolate
    }

    private _rigVRMFace(result: FaceLandmarkerResult) {
        if (!this.avatar.vrm) return;

        let riggedFace: TFace | undefined;
        try {
            if (result.faceLandmarks.length === 0)
                throw new Error("No face landmarks found");
            riggedFace = Face.solve(result.faceLandmarks[0], {
                runtime: "mediapipe",
                video: this.tracker.cameraVideoElem,
                // imageSize: {
                //     width: bitmap.width,
                //     height: bitmap.height,
                // },
                smoothBlink: false, // smooth left and right eye blink delays
                blinkSettings: [0.25, 0.75], // adjust upper and lower bound blink sensitivity
            });
            // console.log("Face VRM solver result:", riggedFace);
        } catch {
            // empty
        }

        if (!riggedFace) return;

        this._rigVRMRotation("Neck", riggedFace.head, 0.7);

        // Blendshapes and Preset Name Schema
        const expressionManager = this.avatar.vrm.expressionManager;

        if (!expressionManager) return;

        // Simple example without winking. Interpolate based on old blendshape, then stabilize blink with `Kalidokit` helper function.
        // for VRM, 1 is closed, 0 is open.
        riggedFace.eye.l = lerp(
            clamp(1 - riggedFace.eye.l, 0, 1),
            expressionManager.getValue(VRMExpressionPresetName.Blink)!,
            0.5
        );
        riggedFace.eye.r = lerp(
            clamp(1 - riggedFace.eye.r, 0, 1),
            expressionManager.getValue(VRMExpressionPresetName.Blink)!,
            0.5
        );
        riggedFace.eye = Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
        expressionManager.setValue(VRMExpressionPresetName.Blink, riggedFace.eye.l);

        // Interpolate and set mouth blendshapes
        expressionManager.setValue(
            VRMExpressionPresetName.Ih,
            lerp(
                riggedFace.mouth.shape.I,
                expressionManager.getValue(VRMExpressionPresetName.Ih)!,
                0.5
            )
        );
        expressionManager.setValue(
            VRMExpressionPresetName.Aa,
            lerp(
                riggedFace.mouth.shape.A,
                expressionManager.getValue(VRMExpressionPresetName.Aa)!,
                0.5
            )
        );
        expressionManager.setValue(
            VRMExpressionPresetName.Ee,
            lerp(
                riggedFace.mouth.shape.E,
                expressionManager.getValue(VRMExpressionPresetName.Ee)!,
                0.5
            )
        );
        expressionManager.setValue(
            VRMExpressionPresetName.Oh,
            lerp(
                riggedFace.mouth.shape.O,
                expressionManager.getValue(VRMExpressionPresetName.Oh)!,
                0.5
            )
        );
        expressionManager.setValue(
            VRMExpressionPresetName.Ou,
            lerp(
                riggedFace.mouth.shape.U,
                expressionManager.getValue(VRMExpressionPresetName.Ou)!,
                0.5
            )
        );

        //PUPILS
        //interpolate pupil and keep a copy of the value
        const lookTarget = new Euler(
            lerp(this._oldLookTarget.x, riggedFace.pupil.y, 0.4),
            lerp(this._oldLookTarget.y, riggedFace.pupil.x, 0.4),
            0,
            "XYZ"
        );
        this._oldLookTarget.copy(lookTarget);
        this.avatar.vrm.lookAt?.applier.lookAt(lookTarget);
    }

    /* VRM Character Animator */
    private _animateVRM(
        faceDetectResult?: FaceLandmarkerResult,
        poseResult?: PoseLandmarkerResult,
        handLandmarkerResult?: HandLandmarkerResult
    ) {
        if (!this.avatar.vrm) return;

        if (faceDetectResult) this._rigVRMFace(faceDetectResult);

        if (!poseResult) return;

        // Animate Pose
        let riggedPose: TPose | undefined;
        try {
            if (
                poseResult.landmarks.length === 0 ||
                poseResult.worldLandmarks.length === 0
            ) {
                throw new Error("No pose landmarks found");
            }
            riggedPose = Pose.solve(
                poseResult.worldLandmarks[0],
                poseResult.landmarks[0],
                {
                    runtime: "mediapipe",
                    video: this.tracker.cameraVideoElem,
                    enableLegs: false,
                }
            );
        } catch {
            // empty
        }

        if (!riggedPose) return;

        // this._rigVRMRotation("Hips", riggedPose.Hips.rotation, 0.7);
        // don't move the avatar
        // this._rigVRMPosition(
        //     "Hips",
        //     {
        //         x: -riggedPose.Hips.position.x, // Reverse direction
        //         y: riggedPose.Hips.position.y + 1, // Add a bit of height
        //         z: -riggedPose.Hips.position.z, // Reverse direction
        //     },
        //     1,
        //     0.07
        // );

        this._rigVRMRotation("Chest", riggedPose.Spine, 0.25, 0.3);
        this._rigVRMRotation("Spine", riggedPose.Spine, 0.45, 0.3);

        this._rigVRMRotation("RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
        this._rigVRMRotation("RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
        this._rigVRMRotation("LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
        this._rigVRMRotation("LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);

        this._rigVRMRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, 0.3);
        this._rigVRMRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, 0.3);
        this._rigVRMRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, 0.3);
        this._rigVRMRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, 0.3);

        // If no hand landmarks, skip hand animation
        if (!handLandmarkerResult || handLandmarkerResult.landmarks.length === 0) {
            return;
        }

        // Hand landmarks
        const [leftIdx, rightIdx] = getLeftRightHandIndices(
            handLandmarkerResult.handedness
        );
        const leftHandLandmarks = handLandmarkerResult.landmarks[leftIdx];
        const rightHandLandmarks = handLandmarkerResult.landmarks[rightIdx];

        let riggedLeftHand: THand<"Left"> | undefined;
        let riggedRightHand: THand<"Right"> | undefined;

        // Animate Hands
        if (leftHandLandmarks) {
            riggedLeftHand = Hand.solve(leftHandLandmarks, "Left");

            if (!riggedPose || !riggedLeftHand) return;

            this._rigVRMRotation("LeftHand", {
                // Combine pose rotation Z and hand rotation X Y
                z: riggedPose.LeftHand.z,
                y: riggedLeftHand.LeftWrist.y,
                x: riggedLeftHand.LeftWrist.x,
            });
            this._rigVRMRotation("LeftRingProximal", riggedLeftHand.LeftRingProximal);
            this._rigVRMRotation(
                "LeftRingIntermediate",
                riggedLeftHand.LeftRingIntermediate
            );
            this._rigVRMRotation("LeftRingDistal", riggedLeftHand.LeftRingDistal);
            this._rigVRMRotation(
                "LeftIndexProximal",
                riggedLeftHand.LeftIndexProximal
            );
            this._rigVRMRotation(
                "LeftIndexIntermediate",
                riggedLeftHand.LeftIndexIntermediate
            );
            this._rigVRMRotation("LeftIndexDistal", riggedLeftHand.LeftIndexDistal);
            this._rigVRMRotation(
                "LeftMiddleProximal",
                riggedLeftHand.LeftMiddleProximal
            );
            this._rigVRMRotation(
                "LeftMiddleIntermediate",
                riggedLeftHand.LeftMiddleIntermediate
            );
            this._rigVRMRotation("LeftMiddleDistal", riggedLeftHand.LeftMiddleDistal);
            this._rigVRMRotation(
                "LeftThumbProximal",
                riggedLeftHand.LeftThumbProximal
            );
            // this._rigVRMRotation(
            //     "LeftThumbIntermediate",
            //     riggedLeftHand.LeftThumbIntermediate
            // );
            this._rigVRMRotation("LeftThumbDistal", riggedLeftHand.LeftThumbDistal);
            this._rigVRMRotation(
                "LeftLittleProximal",
                riggedLeftHand.LeftLittleProximal
            );
            this._rigVRMRotation(
                "LeftLittleIntermediate",
                riggedLeftHand.LeftLittleIntermediate
            );
            this._rigVRMRotation("LeftLittleDistal", riggedLeftHand.LeftLittleDistal);
        }
        if (rightHandLandmarks) {
            riggedRightHand = Hand.solve(rightHandLandmarks, "Right");
            if (!riggedPose || !riggedRightHand) return;

            this._rigVRMRotation("RightHand", {
                // Combine Z axis from pose hand and X/Y axis from hand wrist rotation
                z: riggedPose.RightHand.z,
                y: riggedRightHand.RightWrist.y,
                x: riggedRightHand.RightWrist.x,
            });
            this._rigVRMRotation(
                "RightRingProximal",
                riggedRightHand.RightRingProximal
            );
            this._rigVRMRotation(
                "RightRingIntermediate",
                riggedRightHand.RightRingIntermediate
            );
            this._rigVRMRotation("RightRingDistal", riggedRightHand.RightRingDistal);
            this._rigVRMRotation(
                "RightIndexProximal",
                riggedRightHand.RightIndexProximal
            );
            this._rigVRMRotation(
                "RightIndexIntermediate",
                riggedRightHand.RightIndexIntermediate
            );
            this._rigVRMRotation(
                "RightIndexDistal",
                riggedRightHand.RightIndexDistal
            );
            this._rigVRMRotation(
                "RightMiddleProximal",
                riggedRightHand.RightMiddleProximal
            );
            this._rigVRMRotation(
                "RightMiddleIntermediate",
                riggedRightHand.RightMiddleIntermediate
            );
            this._rigVRMRotation(
                "RightMiddleDistal",
                riggedRightHand.RightMiddleDistal
            );
            this._rigVRMRotation(
                "RightThumbProximal",
                riggedRightHand.RightThumbProximal
            );
            // this._rigVRMRotation(
            //     "RightThumbIntermediate",
            //     riggedRightHand.RightThumbIntermediate
            // );
            this._rigVRMRotation(
                "RightThumbDistal",
                riggedRightHand.RightThumbDistal
            );
            this._rigVRMRotation(
                "RightLittleProximal",
                riggedRightHand.RightLittleProximal
            );
            this._rigVRMRotation(
                "RightLittleIntermediate",
                riggedRightHand.RightLittleIntermediate
            );
            this._rigVRMRotation(
                "RightLittleDistal",
                riggedRightHand.RightLittleDistal
            );
        }
    }

    /**
     * The main update function. Takes the entire result from the Pose Landmarker.
     * It prioritizes using `worldLandmarks` for accuracy.
     * @param poseResult The result object from `poseDetector.detect()`.
     */
    private _syncRPMPose(poseResult: PoseLandmarkerResult): void {
        if (!this.avatar.isReady) return;

        if (
            poseResult.landmarks[0].length === 0 ||
            poseResult.worldLandmarks.length === 0
        )
            return;

        // Prioritize using the accurate 3D world landmarks
        const landmarks = poseResult.landmarks[0];
        const worldLandmarks = poseResult.worldLandmarks[0];

        // const leftShoulder = this.avatar.bonesByName.get("LeftShoulder");
        // const leftArm = this.avatar.bonesByName.get("LeftArm");
        // const leftForeArm = this.avatar.bonesByName.get("LeftForeArm");
        // const rightShoulder = this.avatar.bonesByName.get("RightShoulder");
        // const rightArm = this.avatar.bonesByName.get("RightArm");
        // const rightForeArm = this.avatar.bonesByName.get("RightForeArm");

        // leftShoulder?.rotation.set(0, 0, 0);
        // leftArm?.rotation.set(0, 0, 0);
        // leftForeArm?.rotation.set(0, 0, 0);
        // rightShoulder?.rotation.set(0, 0, 0);
        // rightArm?.rotation.set(0, 0, 0);
        // rightForeArm?.rotation.set(0, 0, 0);

        // this._syncArms(worldLandmarks);
        // this._rotateSpine(worldLandmarks);

        const Arms = calcArms(worldLandmarks);

        let _a, _b;

        //DETECT OFFSCREEN AND RESET VALUES TO DEFAULTS
        const rightHandOffscreen =
            worldLandmarks[15].y > 0.1 ||
            ((_a = worldLandmarks[15].visibility) !== null && _a !== void 0
                ? _a
                : 0) < 0.23 ||
            0.995 < landmarks[15].y;
        const leftHandOffscreen =
            worldLandmarks[16].y > 0.1 ||
            ((_b = worldLandmarks[16].visibility) !== null && _b !== void 0
                ? _b
                : 0) < 0.23 ||
            0.995 < landmarks[16].y;
        // const leftFootOffscreen =
        //     worldLandmarks[23].y > 0.1 ||
        //     ((_c = worldLandmarks[23].visibility) !== null && _c !== void 0 ? _c : 0) < 0.63 ||
        //     Hips.Hips.position.z > -0.4;
        // const rightFootOffscreen =
        //     worldLandmarks[24].y > 0.1 ||
        //     ((_d = worldLandmarks[24].visibility) !== null && _d !== void 0 ? _d : 0) < 0.63 ||
        //     Hips.Hips.position.z > -0.4;
        Arms.UpperArm.l = Arms.UpperArm.l.multiply(leftHandOffscreen ? 0 : 1);
        Arms.UpperArm.l.z = leftHandOffscreen ? 0 : Arms.UpperArm.l.z;
        Arms.UpperArm.r = Arms.UpperArm.r.multiply(rightHandOffscreen ? 0 : 1);
        Arms.UpperArm.r.z = rightHandOffscreen ? 0 : Arms.UpperArm.r.z;
        Arms.LowerArm.l = Arms.LowerArm.l.multiply(leftHandOffscreen ? 0 : 1);
        Arms.LowerArm.r = Arms.LowerArm.r.multiply(rightHandOffscreen ? 0 : 1);
        Arms.Hand.l = Arms.Hand.l.multiply(leftHandOffscreen ? 0 : 1);
        Arms.Hand.r = Arms.Hand.r.multiply(rightHandOffscreen ? 0 : 1);

        const riggedPose = {
            RightUpperArm: Arms.UpperArm.r,
            RightLowerArm: Arms.LowerArm.r,
            LeftUpperArm: Arms.UpperArm.l,
            LeftLowerArm: Arms.LowerArm.l,
            RightHand: Arms.Hand.r,
            LeftHand: Arms.Hand.l,
        };

        this._rigRPMRotation("RightArm", riggedPose.RightUpperArm, 1, 0.3);
        this._rigRPMRotation("RightForeArm", riggedPose.RightLowerArm, 1, 0.3);
        this._rigRPMRotation("LeftArm", riggedPose.LeftUpperArm, 1, 0.3);
        this._rigRPMRotation("LeftForeArm", riggedPose.LeftLowerArm, 1, 0.3);
    }

    /**
     * Rotates the upper spine bone based on the orientation of the torso.
     * @param landmarks The array of 3D world landmarks.
     */
    private _rotateSpine(landmarks: Landmark[]): void {
        const spineBone = this.avatar.bonesByName.get("Spine2");
        if (!spineBone || !spineBone.parent) return;

        // 1. Calculate the center points of the shoulders and hips
        const leftShoulderVec3 = new Vector3();
        const rightShoulderVec3 = new Vector3();
        this._transformWorldLandmark(
            landmarks[PoseLandmarkNameIndex.LeftShoulder],
            leftShoulderVec3
        );
        this._transformWorldLandmark(
            landmarks[PoseLandmarkNameIndex.RightShoulder],
            rightShoulderVec3
        );
        this._vShoulderCenter
            .addVectors(leftShoulderVec3, rightShoulderVec3)
            .multiplyScalar(0.5);

        const leftHipVec3 = new Vector3();
        const rightHipVec3 = new Vector3();
        this._transformWorldLandmark(
            landmarks[PoseLandmarkNameIndex.LeftHip],
            leftHipVec3
        );
        this._transformWorldLandmark(
            landmarks[PoseLandmarkNameIndex.RightHip],
            rightHipVec3
        );
        this._vHipCenter.addVectors(leftHipVec3, rightHipVec3).multiplyScalar(0.5);

        // 2. Define the spine's "up" and "forward" vectors
        // The "up" vector points from the hips to the shoulders
        this._vSpineUp
            .subVectors(this._vShoulderCenter, this._vHipCenter)
            .normalize();

        // The "forward" vector is perpendicular to the shoulders and the spine's up vector
        this._vShoulderLine
            .subVectors(leftShoulderVec3, rightShoulderVec3)
            .normalize();
        this._vSpineForward
            .crossVectors(this._vSpineUp, this._vShoulderLine)
            .normalize();

        // 3. Calculate the target world rotation for the spine
        const matrix = new Matrix4();
        matrix.lookAt(this._vSpineForward, new Vector3(0, 0, 0), this._vSpineUp);
        this._qTargetWorld.setFromRotationMatrix(matrix);

        // 4. Get the parent's world rotation
        spineBone.parent.getWorldQuaternion(this._qParentWorld);

        // 5. Calculate the required LOCAL rotation
        this._qTargetLocal
            .copy(this._qParentWorld)
            .invert()
            .multiply(this._qTargetWorld);

        // 6. Apply a T-Pose correction offset (calibration needed)
        // The spine bone in the model is likely oriented differently than our calculated vectors.
        // A common offset is needed to align them.
        const spineOffset = new Quaternion().setFromEuler(
            new Euler(Math.PI * 0.15, Math.PI, 0)
        );
        this._qTargetLocal.multiply(spineOffset);

        // 7. Apply the final rotation with smoothing
        spineBone.quaternion.slerp(this._qTargetLocal, this.SMOOTH_FACTOR);
    }

    /**
     * Converts a single MediaPipe world landmark into a Three.js Vector3,
     * correcting for the coordinate system difference.
     * @param landmark The landmark object from MediaPipe {x, y, z}.
     * @param targetVector The THREE.Vector3 to store the result in.
     */
    private _transformWorldLandmark(
        landmark: Landmark,
        targetVector: Vector3
    ): void {
        targetVector.set(
            landmark.x,
            -landmark.y, // Invert Y-axis (+Y is down in MediaPipe, up in Three.js)
            -landmark.z // Invert Z-axis (MP is right-handed, but Z points away)
        );
    }

    private _syncArms(landmarks: Landmark[]): void {
        if (!this.avatar.isReady || landmarks.length < 33) return;

        // 1. Convert MediaPipe landmarks to Three.js vectors
        const lm = landmarks.map((l) => new Vector3(l.x, -l.y, -l.z));

        // 2. Calculate pure kinematic arm rotations
        const armRotations = this._calcArmRotations(lm);

        // 3. Retarget and apply the rotations to the RPM avatar
        this._applyArmRotations(armRotations);
    }

    /**
     * Step 1: Calculate pure rotations from landmarks, inspired by kalidokit.
     */
    private _calcArmRotations(lm: Vector3[]) {
        const {
            LeftShoulder,
            RightShoulder,
            LeftElbow,
            RightElbow,
            LeftWrist,
            RightWrist,
        } = PoseLandmarkNameIndex;

        // --- Left Arm ---
        const UpperArmL = findRotation(lm[LeftShoulder], lm[LeftElbow]);
        // Yaw is the angle between the shoulder line and the upper arm line.
        // This provides a stable "swing" rotation.
        UpperArmL.y = angleBetween3DCoords(
            lm[RightShoulder],
            lm[LeftShoulder],
            lm[LeftElbow]
        );

        const LowerArmL = findRotation(lm[LeftElbow], lm[LeftWrist]);
        // Yaw is the angle between the upper arm and the forearm.
        LowerArmL.y = angleBetween3DCoords(
            lm[LeftShoulder],
            lm[LeftElbow],
            lm[LeftWrist]
        );

        // --- Right Arm ---
        const UpperArmR = findRotation(lm[RightShoulder], lm[RightElbow]);
        UpperArmR.y = angleBetween3DCoords(
            lm[LeftShoulder],
            lm[RightShoulder],
            lm[RightElbow]
        );

        const LowerArmR = findRotation(lm[RightElbow], lm[RightWrist]);
        LowerArmR.y = angleBetween3DCoords(
            lm[RightShoulder],
            lm[RightElbow],
            lm[RightWrist]
        );

        return { UpperArmL, LowerArmL, UpperArmR, LowerArmR };
    }

    /**
     * Step 2: Apply rotations, including the crucial retargeting/calibration step.
     */
    private _applyArmRotations(
        rotations: ReturnType<typeof this._calcArmRotations>
    ) {
        // --- Left Arm ---
        const riggedUpperArmL = this._rigArmForRPM(rotations.UpperArmL, "left");
        const riggedLowerArmL = this._rigArmForRPM(rotations.LowerArmL, "left");
        this._rigRPMRotation("LeftArm", riggedUpperArmL);
        this._rigRPMRotation("LeftForeArm", riggedLowerArmL);

        // --- Right Arm ---
        const riggedUpperArmR = this._rigArmForRPM(rotations.UpperArmR, "right");
        const riggedLowerArmR = this._rigArmForRPM(rotations.LowerArmR, "right");
        this._rigRPMRotation("RightArm", riggedUpperArmR);
        this._rigRPMRotation("RightForeArm", riggedLowerArmR);
    }

    /**
     * The Retargeting Layer for YOUR Ready Player Me Avatar.
     * CALIBRATE THIS FUNCTION!
     */
    private _rigArmForRPM(rotation: Euler, side: "left" | "right"): Euler {
        const invert = side === "left" ? 1 : -1;
        this._eRigged.copy(rotation);

        // --- START CALIBRATION HERE ---
        // Stand in a T-Pose and adjust these values until the avatar matches.

        // 1. Axis Swapping and Inversion (if necessary)
        // Example: this._eRigged.set(rotation.x, rotation.z, rotation.y * invert);

        // 2. T-Pose Offsets (add or subtract radians)
        this._eRigged.x -= Math.PI * 0.5 * invert; // Pitch offset
        // this._eRigged.y += 0; // Yaw offset
        // this._eRigged.z += Math.PI * 0.5 * invert; // Roll offset (90 degrees is common for arms)

        // 3. Scaling (multiply to increase/decrease motion)
        this._eRigged.x *= 1;
        this._eRigged.y *= 1;
        this._eRigged.z *= 1;

        // --- END CALIBRATION ---

        return this._eRigged;
    }

    /**
     * Helper to apply a calculated Euler rotation to a bone.
     */
    private _rigRPMRotation(
        boneName: RPMBoneName,
        // eslint-disable-next-line unicorn/no-object-as-default-parameter
        rotation: VectorObject = { x: 0, y: 0, z: 0 },
        dampener: number = 1,
        lerpAmount: number = this.SMOOTH_FACTOR
    ): void {
        const bone = this.avatar.bonesByName.get(boneName);
        if (!bone) return;

        // this._qFinal.setFromEuler(euler);
        // bone.quaternion.slerp(this._qFinal, this.SMOOTH_FACTOR);

        const euler = new Euler(
            rotation.x * dampener,
            rotation.y * dampener,
            rotation.z * dampener
        );
        const quaternion = new Quaternion().setFromEuler(euler);
        bone.quaternion.slerp(quaternion, lerpAmount);
    }
}

export default SyncAvatarController;
