import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { type Category, DrawingUtils, type NormalizedLandmark } from "@mediapipe/tasks-vision";

import type Avatar from "@/3d/avatar/Avatar";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { FaceDetector } from "@/utils/tracking/FaceDetector";
import { HandDetector } from "@/utils/tracking/HandDetector";
import { PoseDetector } from "@/utils/tracking/PoseDetector";
import { drawConnectors, drawLandmarks } from "@/utils/landmarker/draw_hands";
import {
    clamp,
    hasGetUserMedia,
    // lerp,
    normalize,
    normalizeToRange,
} from "@/utils/utilities";

import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { useTrackingStore } from "@/stores/useTrackingStore";
import { drawPoseLandmarks } from "@/utils/landmarker/draw_pose";

const SafeVideo = (() =>
    typeof document === "undefined"
        ? ({
            getContext: () => { },
        } as unknown as HTMLVideoElement)
        : document.createElement("video"))();

class FaceTracker {
    private static instance: FaceTracker;
    readonly cameraVideoElem: HTMLVideoElement;
    faceDetector: FaceDetector;
    handDetector: HandDetector;
    poseDetector: PoseDetector;
    private _isMultiplayer: boolean;
    private _isGettingVideoStream: boolean;
    isStreamReady: boolean;
    isAvatarPositionReset: boolean;
    isAvatarHeadRotationReset: boolean;

    private _poseDrawingUtil?: DrawingUtils
    private _isDisposed: boolean;

    private constructor() {
        this._isDisposed = false;
        this._isMultiplayer = false;
        this._isGettingVideoStream = false;
        this.isStreamReady = false;
        this.isAvatarPositionReset = false;
        this.isAvatarHeadRotationReset = false;

        if (typeof document === "undefined") {
            this.cameraVideoElem = SafeVideo;
            this.faceDetector = new FaceDetector(this.cameraVideoElem);
            this.faceDetector.dispose();
            this.handDetector = new HandDetector(this.cameraVideoElem);
            this.handDetector.dispose();
            this.poseDetector = new PoseDetector(this.cameraVideoElem);
            this.poseDetector.dispose();
            return;
        }

        this.cameraVideoElem = document.createElement("video");
        // prevent right click context menu
        this.cameraVideoElem.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });
        this.faceDetector = new FaceDetector(this.cameraVideoElem);
        this.faceDetector.init();
        this.handDetector = new HandDetector(this.cameraVideoElem);
        this.handDetector.init();
        this.poseDetector = new PoseDetector(this.cameraVideoElem);
        this.poseDetector.init();

        // for testing only
        // this.cameraVideoElem.id = "webcam";
        // this.cameraVideoElem.style.position = "absolute";
        // this.cameraVideoElem.style.top = "1rem";
        // this.cameraVideoElem.style.right = "0";
        // this.cameraVideoElem.style.width = "auto";
        // this.cameraVideoElem.style.height = "25%";
        // this.cameraVideoElem.style.zIndex = "1000";
        // this.cameraVideoElem.style.transform = "scaleX(-1)"; // flip video for mirror effect
        // this.cameraVideoElem.style.pointerEvents = "none"; // disable pointer events
        // document.body.appendChild(this.cameraVideoElem);

        // this.detect();
        // this.getUserVideoStream(this.cameraVideoElem);
    }
    get isMultiplayer() {
        return this._isMultiplayer;
    }
    get isDisposed() {
        return this._isDisposed;
    }

    static getInstance(): FaceTracker {
        if (!FaceTracker.instance) {
            FaceTracker.instance = new FaceTracker();
        }
        return FaceTracker.instance;
    }

    async detectFace() {
        if (!this.isStreamReady) {
            await this.getUserVideoStream();
        }

        if (!this.cameraVideoElem.srcObject) return;
        if (this.faceDetector.isDisposed) return;

        const avatar = useAvatarStore.getState().avatar;

        if (!avatar) return;

        let result;
        try {
            result = await this.faceDetector.detect();
        } catch {
            this.faceDetector.dispose();
            this.faceDetector = new FaceDetector(this.cameraVideoElem);
            this.faceDetector.init();
            return;
        }

        if (!result || result.faceBlendshapes.length === 0) return;

        const blendShapes = result.faceBlendshapes[0].categories;
        this.syncMorphTargets(avatar, blendShapes);

        const matrixData = result.facialTransformationMatrixes[0].data;
        const faceMatrix = Matrix.FromArray(matrixData);
        this.syncHeadRotation(avatar, faceMatrix);

        // reset head rotation and avatar position for multiplayer
        if (this._isMultiplayer && !this.isAvatarPositionReset) {
            avatar.root.position = Vector3.Zero();
            this.isAvatarPositionReset = true;
        }

        this.syncHeadPosition(avatar, faceMatrix);
    }

    async detectHand() {
        if (!this.isStreamReady) {
            await this.getUserVideoStream();
        }
        if (!this.cameraVideoElem.srcObject) return;
        if (this.handDetector.isDisposed) return;

        const avatar = useAvatarStore.getState().avatar;

        if (!avatar) return;

        let result;
        try {
            result = await this.handDetector.detect();
        } catch {
            this.handDetector.dispose();
            this.handDetector = new HandDetector(this.cameraVideoElem);
            this.handDetector.init();
            return;
        }

        if (!result || result.handedness.length === 0) {
            const canvas = document.querySelector(
                "#hand-canvas"
            ) as HTMLCanvasElement | null;
            if (canvas) {
                const cxt = canvas.getContext("2d");
                cxt?.clearRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }

        // draw 2D hands from landmarks
        const canvas = document.querySelector(
            "#hand-canvas"
        ) as HTMLCanvasElement | null;
        if (canvas) {
            const cxt = canvas.getContext("2d");

            if (!cxt) return;

            cxt.clearRect(0, 0, canvas.width, canvas.height);

            for (const landmarks of result.landmarks) {
                drawConnectors(cxt, landmarks, {
                    color: "#00FF00",
                    lineWidth: 2,
                });
                drawLandmarks(cxt, landmarks, {
                    color: "#FF0000",
                    radius: 3,
                });
                // drawHandSilhouette(cxt, landmarks, canvas.width, canvas.height);
            }
        }

        const [leftIdx, rightIdx] = this.getLeftRightHandIndices(result.handedness);

        // flipped index because canvas is mirrored
        if (rightIdx > -1) {
            const hand = result.landmarks[rightIdx];
            const wrist = hand[0];

            const rightWristWorldPos = this.mapLandmarkToWorld(
                wrist,
                avatar.scene.getEngine() as Engine,
                avatar.scene.getCameraByName("camera") as Camera,
                -0.3
            );
            rightWristWorldPos.z *= -1; // flip z axis
            console.log("rightWristWorldPos", rightWristWorldPos);
            avatar.boneIKTargets.right.target.setAbsolutePosition(
                rightWristWorldPos.scale(5)
            );
        }
        if (leftIdx > -1) {
            const hand = result.landmarks[leftIdx];
            const wrist = hand[0];

            const leftWristWorldPos = this.mapLandmarkToWorld(
                wrist,
                avatar.scene.getEngine() as Engine,
                avatar.scene.getCameraByName("camera") as Camera,
                -0.3
            );
            leftWristWorldPos.z *= -1; // flip z axis
            console.log("leftWristWorldPos", leftWristWorldPos);
            avatar.boneIKTargets.left.target.setAbsolutePosition(
                leftWristWorldPos.scale(5)
            );
        }

        // TODO: update bone ik
    }

    async detectPose() {
        if (!this.isStreamReady) {
            await this.getUserVideoStream();
        }

        if (!this.cameraVideoElem.srcObject) return;
        if (this.poseDetector.isDisposed) return;

        const avatar = useAvatarStore.getState().avatar;

        if (!avatar) return;

        let result;
        try {
            result = await this.poseDetector.detect();
        } catch {
            this.poseDetector.dispose();
            this.poseDetector = new PoseDetector(this.cameraVideoElem);
            this.poseDetector.init();
            return;
        }

        if (!result || result.landmarks.length === 0) return;

        // draw 2D pose from landmarks
        const canvas = document.querySelector(
            "#pose-canvas"
        ) as HTMLCanvasElement | null;
        if (canvas) {
            const cxt = canvas.getContext("2d");
            if (!cxt) return;
            if (!this._poseDrawingUtil) {
                this._poseDrawingUtil = new DrawingUtils(cxt);
            }
            drawPoseLandmarks(cxt, result.landmarks, this._poseDrawingUtil);
        }

        result.close();
    }

    syncMorphTargets(avatar: Avatar, blendShapes: Category[]) {
        if (!avatar.morphTargetManager) return;

        for (const blendShape of blendShapes) {
            const target = avatar.morphTargetManager.getTargetByName(
                blendShape.categoryName
            );
            if (!target) continue;

            const value = blendShape.score;
            let val = value;

            // Enhance blink sensitivity
            if (target.name.includes("eyeBlink")) {
                val = clamp(normalize(value, 0, 0.6), 0, 1);
            }

            target.influence = val;

            // // lerp for to make facial features not twitchy
            // target.influence = lerp(
            //   target.influence ?? 0,
            //   val > 0.1 ? val : 0,
            //   0.3
            // );
        }
    }

    syncHeadRotation(
        avatar: Avatar,
        faceMatrix: Matrix,
        mirrored: boolean = false
    ) {
        if (avatar.dontSyncHeadWithUser) return;

        const headBoneNode = avatar.bones
            ?.find((bone) => bone.name === "Head")
            ?.getTransformNode();

        if (!headBoneNode) {
            console.warn("Head bone not found in avatar bones.");
            return;
        }

        const faceRotation = Quaternion.FromRotationMatrix(faceMatrix);

        // get dot product of camera and avatar position to check if is behind or in front
        const camera = avatar.coreScene.camera;
        const cameraPosition = camera.globalPosition;
        const avatarPosition = avatar.getPosition(true);
        const avatarForward = avatar.root.forward.normalize();
        const toTarget = cameraPosition.subtract(avatarPosition).normalize();
        const dot = Vector3.Dot(avatarForward, toTarget);

        // camera is behind avatar
        if (dot < -0.1) {
            if (!this.isAvatarHeadRotationReset) {
                headBoneNode.rotationQuaternion = Quaternion.Identity();
                this.isAvatarHeadRotationReset = true;
            }
            return;
        }

        const rotation = new Quaternion(
            mirrored ? -faceRotation.x : faceRotation.x,
            faceRotation.y,
            faceRotation.z,
            // maintain quaternion unit rotation direction when mirrored
            mirrored ? -faceRotation.w : faceRotation.w
        );

        // Fix head looking down more than intended
        const euler = rotation.toEulerAngles();
        euler.x -= Math.PI * 0.1;
        const correctedRotation = Quaternion.FromEulerAngles(
            euler.x,
            euler.y,
            euler.z
        );

        headBoneNode.rotationQuaternion = Quaternion.Slerp(
            headBoneNode.rotationQuaternion ?? Quaternion.Identity(),
            correctedRotation,
            0.3
        );
        if (this.isAvatarHeadRotationReset) this.isAvatarHeadRotationReset = false;

        // don't sync spine rotation in multiplayer
        if (this.isMultiplayer) return;

        const spine2Node = avatar.bones
            ?.find((bone) => bone.name === "Spine1")
            ?.getTransformNode();
        if (!spine2Node) return;

        // slightly rotate the spine with the head
        const spineRotation = Quaternion.FromEulerAngles(
            0, // forward backward
            correctedRotation.y * 0.8, // rotate left right horizontally
            correctedRotation.z * 0.85 // rotate left right vertically
        );
        spine2Node.rotationQuaternion = Quaternion.Slerp(
            spine2Node.rotationQuaternion ?? Quaternion.Identity(),
            spineRotation,
            0.3
        );
    }

    syncHeadPosition(avatar: Avatar, faceMatrix: Matrix) {
        if (this.isMultiplayer) return;

        const faceMatrixPosition = faceMatrix.getTranslation();

        // fix distance of avatar from 3D camera's position
        const headPosition = faceMatrixPosition.multiplyByFloats(-0.02, 0.008, 1);
        headPosition.z = normalizeToRange(
            faceMatrixPosition.z,
            -60,
            -10,
            -0.8,
            0.2
        );

        if (avatar.container) {
            const lerped = Vector3.Lerp(avatar.root.position, headPosition, 0.25);
            avatar.root.position = lerped;
        }
    }

    getLeftRightHandIndices(handedness: Category[][]) {
        const leftHandIndex = handedness.findIndex(
            (hand) => hand[0].categoryName === "Left"
        );
        const rightHandIndex = handedness.findIndex(
            (hand) => hand[0].categoryName === "Right"
        );
        return [leftHandIndex, rightHandIndex];
    }

    mapLandmarkToWorld(
        lm: NormalizedLandmark,
        engine: Engine,
        camera: Camera,
        fixedDistance = 0.7 // How far away from camera (in meters)
    ) {
        const screenX = lm.x * engine.getRenderWidth();
        const screenY = lm.y * engine.getRenderHeight();

        // Babylon expects (x, y, zDepth) where z is 0-1 between near/far planes
        // We want a fixed distance
        const z = (fixedDistance - camera.minZ) / (camera.maxZ - camera.minZ);

        const projected = new Vector3(screenX, screenY, z);

        return Vector3.Unproject(
            projected,
            engine.getRenderWidth(),
            engine.getRenderHeight(),
            Matrix.Identity(), // assume no transform yet
            camera.getViewMatrix(),
            camera.getProjectionMatrix()
        );
    }

    setIsMultiplayer(isMultiplayer: boolean) {
        this._isMultiplayer = isMultiplayer;
        // re-run detection intervals
        this.isAvatarPositionReset = false;
        // this.detect();
    }

    async getUserVideoStream() {
        if (this.isStreamReady) return;
        if (this._isGettingVideoStream) return;
        if (!hasGetUserMedia()) throw new Error("No webcam access!");

        this._isGettingVideoStream = true;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
        });

        this.cameraVideoElem.srcObject = stream;
        this.cameraVideoElem.playsInline = true; // Important for iOS Safari
        await this.cameraVideoElem.play();
        this.isStreamReady = true;
        this._isGettingVideoStream = false;

        return stream;
    }

    /**
     * Dispose current FaceTracker instance and create a new one.
     * This is useful for resetting the state of the FaceTracker.
     * @returns new FaceTracker instance
     */
    dispose() {
        if (this._isDisposed) return;

        this._poseDrawingUtil?.close();
        this._poseDrawingUtil = undefined;

        this.faceDetector.dispose();
        this.handDetector.dispose();
        this.poseDetector.dispose();
        // eslint-disable-next-line unicorn/no-null
        this.cameraVideoElem.srcObject = null;
        this.cameraVideoElem.remove();
        this.isStreamReady = false;
        this._isMultiplayer = false;
        this.isAvatarPositionReset = false;
        this._isDisposed = true;

        FaceTracker.instance = new FaceTracker();
        useTrackingStore.setState({
            faceTracker: FaceTracker.instance,
        });
        return FaceTracker.instance;
    }
}

export default FaceTracker;
