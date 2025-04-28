"use client";

import { useEffect, useRef, useState, type FC } from "react";

import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";

import { FaceDetector } from "@/app/utils/FaceDetector";
import { HandDetector } from "@/app/utils/HandDetector";
import { clamp, hasGetUserMedia, normalize } from "@/app/utils/utilities";

import type { AvatarType } from "@/app/3d/Avatar";
import { useAvatarStore } from "@/app/stores/useAvatarStore";
import type { Category } from "@mediapipe/tasks-vision";

export const VideoChat: FC = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);

  const faceDetectorRef = useRef<FaceDetector>(null);
  const handDetectorRef = useRef<HandDetector>(null);
  const detectFaceInterval = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const detectHandInterval = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const avatar = useAvatarStore((state) => state.avatar);

  const runFaceDetection = async () => {
    if (!videoElement?.srcObject) throw new Error("No video stream!");

    if (detectFaceInterval.current) {
      clearInterval(detectFaceInterval.current);
      detectFaceInterval.current = null;
    }

    detectFaceInterval.current = setInterval(async () => {
      detectFace();
    }, 1000 / 60);
  };

  const runHandDetection = async () => {
    if (!videoElement?.srcObject) throw new Error("No video stream!");

    if (detectHandInterval.current) {
      clearInterval(detectHandInterval.current);
      detectHandInterval.current = null;
    }
    detectHandInterval.current = setInterval(async () => {
      detectHand();
    }, 1000 / 60);
  };

  const detectFace = async () => {
    const result = await faceDetectorRef.current?.detect();

    if (!result || result.faceBlendshapes.length === 0) return;

    if (avatar) {
      // sync morph targets with avatar
      const blendShapes = result.faceBlendshapes[0].categories;
      syncMorphTargets(avatar, blendShapes);

      // sync head rotation
      const matrixData = result.facialTransformationMatrixes[0].data;
      const faceRotation = Quaternion.FromRotationMatrix(
        Matrix.FromArray(matrixData)
      );
      syncHeadRotation(avatar, faceRotation);
    }
  };

  const detectHand = async () => {
    const result = await handDetectorRef.current?.detect();
    if (!result || result.handedness.length === 0) return;

    // console.log('hand result', result);
  };

  const syncMorphTargets = (avatar: AvatarType, blendShapes: Category[]) => {
    if (!avatar.morphTargetManager) return;

    for (const blendShape of blendShapes) {
      const value = blendShape.score;
      const target = avatar.morphTargetManager.getTargetByName(
        blendShape.categoryName
      );
      if (!target) continue;

      let val = value;

      // if is eyeblink then make the value more pronounced
      if (target.name.includes("eyeBlink")) {
        val = clamp(normalize(value, 0, 0.75), 0, 1);
      }
      target.influence = val > 0.1 ? val : 0;
    }
  };

  const syncHeadRotation = (
    avatar: AvatarType,
    faceRotation: Quaternion,
    mirrored: boolean = false
  ) => {
    const headBoneNode = avatar.bones
      ?.find((bone) => bone.name === "Head")
      ?.getTransformNode();
    if (!headBoneNode) return;

    const rotation = new Quaternion(
      mirrored ? -faceRotation.x : faceRotation.x,
      faceRotation.y,
      faceRotation.z,
      // maintain quaternion unit rotation direction when mirrored
      mirrored ? -faceRotation.w : faceRotation.w
    );

    // Fix head looking down more than intended
    const euler = rotation.toEulerAngles();
    euler.x -= Math.PI * 0.15;
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

  const getUserVideoStream = async (video: HTMLVideoElement) => {
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
  };

  useEffect(() => {
    runFaceDetection();
    runHandDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreamReady, avatar]);

  useEffect(() => {
    const video = document.createElement("video");
    setVideoElement(video);
    getUserVideoStream(video);

    faceDetectorRef.current ??= new FaceDetector(video);
    faceDetectorRef.current.init();
    handDetectorRef.current ??= new HandDetector(video);
    handDetectorRef.current.init();

    return () => {
      faceDetectorRef.current?.dispose();
      handDetectorRef.current?.dispose();
    };
  }, []);

  return null;
};
