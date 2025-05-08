"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";

import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

import type Avatar from "@/3d/avatar/Avatar";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { drawConnectors, drawLandmarks } from "@/utils/draw_hands";
import { FaceDetector } from "@/utils/FaceDetector";
import { HandDetector } from "@/utils/HandDetector";
import {
  clamp,
  hasGetUserMedia,
  // lerp,
  normalize,
  normalizeToRange,
} from "@/utils/utilities";

import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Category, NormalizedLandmark } from "@mediapipe/tasks-vision";

const getLeftRightHandIndices = (handedness: Category[][]) => {
  const leftHandIndex = handedness.findIndex(
    (hand) => hand[0].categoryName === "Left"
  );
  const rightHandIndex = handedness.findIndex(
    (hand) => hand[0].categoryName === "Right"
  );
  return [leftHandIndex, rightHandIndex];
};

const mapLandmarkToWorld = (
  lm: NormalizedLandmark,
  engine: Engine,
  camera: Camera,
  fixedDistance = 0.7 // How far away from camera (in meters)
) => {
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
};

const syncMorphTargets = (avatar: Avatar, blendShapes: Category[]) => {
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
};

const syncHeadRotation = (
  avatar: Avatar,
  faceMatrix: Matrix,
  isMultiplayer: boolean = false,
  mirrored: boolean = false,
) => {
  const headBoneNode = avatar.bones
    ?.find((bone) => bone.name === "Head")
    ?.getTransformNode();

  if (!headBoneNode) {
    console.warn("Head bone not found in avatar bones.");
    return;
  }

  // TODO: match head rotation with user's face rotation in multiplayer (unstable right now)
  // if (isMultiplayer) {
  //   const userFacePosition = faceMatrix.getTranslation();
  //   const userFaceForward = Vector3.TransformCoordinates(
  //     Vector3.Forward(),
  //     faceMatrix
  //   );

  //   const targetPositionOffset = userFaceForward.subtract(userFacePosition).scale(10);
  //   const targetPosition = headBoneNode.absolutePosition
  //   .add(avatar.root.forward.scale(0.5))
  //   .add(targetPositionOffset);

  //   // check if camera is behind avatar's back or in front of
  //   // avatar's face to invert the target position
  //   const cameraPosition = avatar.coreScene.camera.globalPosition;
  //   const avatarForward = avatar.root.forward.normalize();
  //   const toTarget = cameraPosition
  //     .subtract(avatar.root.absolutePosition)
  //     .normalize();
  //   const dot = Vector3.Dot(avatarForward, toTarget);

  //   // is behind avatar's back, invert target horizontal position
  //   if (dot <= -0.1) {
  //     targetPosition.x *= -1;
  //   }

  //   avatar.currentBoneLookControllerTarget = targetPosition;

  //   return;
  // }

  const faceRotation = Quaternion.FromRotationMatrix(faceMatrix);

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
};

const syncHeadPosition = (avatar: Avatar, faceMatrix: Matrix) => {
  const faceMatrixPosition = faceMatrix.getTranslation();

  // fix distance of avatar from 3D camera's position
  const headPosition = faceMatrixPosition.multiplyByFloats(-0.02, 0.008, 1);
  headPosition.z = normalizeToRange(faceMatrixPosition.z, -60, -10, -0.8, 0.2);

  if (avatar.container) {
    const lerped = Vector3.Lerp(
      avatar.container.meshes[0].position,
      headPosition,
      0.25
    );
    avatar.container.meshes[0].position = lerped;
  }
};

type Props = {
  isMultiplayer?: boolean;
};

export const AvatarFacialTracking: FC<Props> = ({ isMultiplayer = false }) => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement>();
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);

  const avatar = useAvatarStore((state) => state.avatar);

  const faceDetectorRef = useRef<FaceDetector>(null);
  const handDetectorRef = useRef<HandDetector>(null);
  const detectFaceInterval = useRef<ReturnType<typeof setInterval>>(undefined);
  const detectHandInterval = useRef<ReturnType<typeof setInterval>>(undefined);
  // const isHeadReset = useRef<boolean>(false);
  const isPositionReset = useRef<boolean>(false);

  const runFaceDetection = () => {
    if (detectFaceInterval.current) {
      clearInterval(detectFaceInterval.current);
      detectFaceInterval.current = undefined;
    }

    detectFaceInterval.current = setInterval(() => {
      detectFace();
    }, 1000 / 60);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runHandDetection = () => {
    if (detectHandInterval.current) {
      clearInterval(detectHandInterval.current);
      detectHandInterval.current = undefined;
    }
    detectHandInterval.current = setInterval(() => {
      detectHand();
    }, 1000 / 60);
  };

  const detectFace = async () => {
    if (!avatar) return;

    const result = await faceDetectorRef.current?.detect();

    if (!result || result.faceBlendshapes.length === 0) return;

    const blendShapes = result.faceBlendshapes[0].categories;
    syncMorphTargets(avatar, blendShapes);

    const matrixData = result.facialTransformationMatrixes[0].data;
    const faceMatrix = Matrix.FromArray(matrixData);
    syncHeadRotation(avatar, faceMatrix, isMultiplayer);

    // reset head rotation and avatar position for multiplayer
    if (isMultiplayer) {
      // if (!isHeadReset.current) {
      //   const headBoneNode = avatar.bones
      //     ?.find((bone) => bone.name === "Head")
      //     ?.getTransformNode();

      //   if (headBoneNode) {
      //     headBoneNode.rotationQuaternion = Quaternion.Identity();
      //     isHeadReset.current = true;
      //   }
      // }
      if (!isPositionReset.current && avatar.container) {
        avatar.container.meshes[0].position = Vector3.Zero();
        isPositionReset.current = true;
      }
      return;
    }

    syncHeadPosition(avatar, faceMatrix);
  };

  const detectHand = async () => {
    if (!avatar) return;

    const result = await handDetectorRef.current?.detect();
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

    const [leftIdx, rightIdx] = getLeftRightHandIndices(result.handedness);

    // flipped index because canvas is mirrored
    if (rightIdx > -1) {
      const hand = result.landmarks[rightIdx];
      const wrist = hand[0];

      const rightWristWorldPos = mapLandmarkToWorld(
        wrist,
        avatar.scene.getEngine() as Engine,
        avatar.scene.activeCamera as Camera,
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

      const leftWristWorldPos = mapLandmarkToWorld(
        wrist,
        avatar.scene.getEngine() as Engine,
        avatar.scene.activeCamera as Camera,
        -0.3
      );
      leftWristWorldPos.z *= -1; // flip z axis
      console.log("leftWristWorldPos", leftWristWorldPos);
      avatar.boneIKTargets.left.target.setAbsolutePosition(
        leftWristWorldPos.scale(5)
      );
    }

    // update bone ik
    avatar.boneIKControllers.left?.update();
    avatar.boneIKControllers.right?.update();
  };

  const getUserVideoStream = useCallback(async (video: HTMLVideoElement) => {
    if (!hasGetUserMedia()) throw new Error("No webcam access!");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    video.srcObject = stream;
    video.playsInline = true; // Important for iOS Safari
    await video.play();
    setIsStreamReady(true);

    return stream;
  }, []);

  useEffect(() => {
    if (!videoElement?.srcObject) return;

    runFaceDetection();
    // runHandDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, isStreamReady, avatar]);

  useEffect(() => {
    const cameraVideoElem = document.createElement("video");

    // for testing only
    // cameraVideoElem.id = "webcam";
    // cameraVideoElem.style.position = "absolute";
    // cameraVideoElem.style.top = "1rem";
    // cameraVideoElem.style.right = "0";
    // cameraVideoElem.style.width = "auto";
    // cameraVideoElem.style.height = "25%";
    // cameraVideoElem.style.zIndex = "1000";
    // cameraVideoElem.style.transform = "scaleX(-1)"; // flip video for mirror effect
    // cameraVideoElem.style.pointerEvents = "none"; // disable pointer events
    // document.body.appendChild(cameraVideoElem);

    setVideoElement(cameraVideoElem);
    getUserVideoStream(cameraVideoElem);

    faceDetectorRef.current ??= new FaceDetector(cameraVideoElem);
    faceDetectorRef.current.init();
    handDetectorRef.current ??= new HandDetector(cameraVideoElem);
    handDetectorRef.current.init();

    return () => {
      cameraVideoElem.remove();
      faceDetectorRef.current?.dispose();
      handDetectorRef.current?.dispose();
    };
  }, []);

  // eslint-disable-next-line unicorn/no-null
  return null;
};
