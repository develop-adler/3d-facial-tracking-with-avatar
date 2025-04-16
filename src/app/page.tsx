"use client";

import { useEffect, useRef } from "react";

import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import "@mediapipe/face_mesh";
import "@tensorflow/tfjs-core";
// Register WebGL backend.
import "@tensorflow/tfjs-backend-webgl";
import * as faceDetect from "@tensorflow-models/face-landmarks-detection";
import Webcam from "react-webcam";

import { CoreEngine } from "@/app/3d/CoreEngine";
import { CoreScene } from "@/app/3d/CoreScene";
import { Avatar } from "@/app/3d/Avatar";
import {
  computeFaceWeights,
  getFaceSize,
  getHeadRotationFromMesh,
} from "@/app/utils/faceDetectionUtils";
import { drawMesh } from "@/app/utils/utilities";

const applyFaceWeightsToAvatar = (
  avatar: Avatar,
  weights: Record<string, number>
) => {
  if (!avatar.morphTargetManager) return;

  for (const [name, weight] of Object.entries(weights)) {
    const target = avatar.morphTargetManager.getTargetByName(name);
    if (target) target.influence = weight;
  }
};

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bjsCanvas = useRef<HTMLCanvasElement>(null); // For 3D scene
  const coreEngineRef = useRef<CoreEngine | null>(null);
  const coreSceneRef = useRef<CoreScene | null>(null);
  const avatarRef = useRef<Avatar | null>(null);

  const runFacemesh = async () => {
    const detector = await faceDetect.load(
      faceDetect.SupportedPackages.mediapipeFacemesh,
      {
        maxFaces: 1,
      }
    );
    setInterval(() => {
      detect(detector);
    }, 1000 / 24);
  };

  const detect = async (detector: faceDetect.FaceLandmarksDetector) => {
    if (!webcamRef.current || !canvasRef.current) return;
    if (typeof webcamRef.current === "undefined") return;
    if (webcamRef.current.video?.readyState !== 4) return;

    // Get Video Properties
    const video = webcamRef.current.video;
    const videoWidth = webcamRef.current.video.videoWidth;
    const videoHeight = webcamRef.current.video.videoHeight;

    // Set video width
    webcamRef.current.video.width = videoWidth;
    webcamRef.current.video.height = videoHeight;

    // Set canvas width
    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;

    const faces = await detector.estimateFaces({ input: video });

    if (faces.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const face = faces[0] as any;
      // console.log('face:', face);

      const annotations = face.annotations;
      // console.log("annotations:", annotations);

      const faceSize = getFaceSize(face.boundingBox);
      // const mouthOpenWeight = getMouthOpenWeight(annotations, faceSize);
      // const leftEyeBlinkWeight = getEyeBlinkWeight(
      //   annotations.leftEyeUpper0,
      //   annotations.leftEyeLower0,
      //   faceSize
      // );
      // const rightEyeBlinkWeight = getEyeBlinkWeight(
      //   annotations.rightEyeUpper0,
      //   annotations.rightEyeLower0,
      //   faceSize
      // );
      // const leftEyebrowRaiseWeight = getEyeBrowRaiseWeights(
      //   annotations,
      //   faceSize,
      //   "leftEyebrowUpper",
      //   "leftEyeUpper0"
      // );
      // const rightEyebrowRaiseWeight = getEyeBrowRaiseWeights(
      //   annotations,
      //   faceSize,
      //   "rightEyebrowUpper",
      //   "rightEyeUpper0"
      // );

      // console.log("Mouth Open Weight:", mouthOpenWeight);
      // console.log("Left Eye Blink Weight:", leftEyeBlinkWeight);
      // console.log("Right Eye Blink Weight:", rightEyeBlinkWeight);
      // console.log("Left Eyebrow Raise Weight:", leftEyebrowRaiseWeight);
      // console.log("Right Eyebrow Raise Weight:", rightEyebrowRaiseWeight);

      if (!avatarRef.current) return;

      const faceWeights = computeFaceWeights(annotations, faceSize);
      // console.log("Face Weights:", faceWeights);
      applyFaceWeightsToAvatar(avatarRef.current, faceWeights);

      // Sync head rotation with user's face
      const headBoneNode = avatarRef.current.headBone?.getTransformNode();
      if (headBoneNode && face.faceInViewConfidence >= 0.85) {
        headBoneNode.rotationQuaternion = Quaternion.Slerp(
          headBoneNode.rotationQuaternion ?? Quaternion.Identity(),
          getHeadRotationFromMesh(
            face.mesh,
            // correction for the head rotation
            Quaternion.FromEulerAngles(Math.PI * 0.85, 0, 0)
          ),
          0.3
        );
      }
    }

    // Get canvas context
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      requestAnimationFrame(() => {
        drawMesh(faces, ctx);
      });
    }
  };

  const create3DScene = (canvas: HTMLCanvasElement) => {
    const coreEngine = new CoreEngine(canvas);
    const coreScene = new CoreScene(coreEngine);
    const avatar = new Avatar(coreScene.scene);

    coreEngineRef.current = coreEngine;
    coreSceneRef.current = coreScene;
    avatarRef.current = avatar;

    avatar.loadAvatar();

    return { coreEngine, coreScene, avatar };
  };

  useEffect(() => {
    runFacemesh();

    if (!bjsCanvas.current) return;
    const { coreEngine } = create3DScene(bjsCanvas.current);

    window.addEventListener("resize", coreEngine.resize.bind(coreEngine));

    return () => {
      window.removeEventListener("resize", coreEngine.resize.bind(coreEngine));
      coreEngine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Webcam
        ref={webcamRef}
        style={{
          position: "absolute",
          margin: "none",
          top: "25%",
          left: 0,
          width: "50%",
          height: "auto",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          margin: "none",
          top: "25%",
          left: 0,
          width: "50%",
          height: "auto",
        }}
      />
      <canvas
        ref={bjsCanvas}
        style={{
          position: "absolute",
          margin: "none",
          top: "25%",
          right: 0,
          width: "50%",
          height: "auto",
          userSelect: "none",
        }}
      />
    </div>
  );
}
