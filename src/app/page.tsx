"use client";

import { useEffect, useRef } from "react";

import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import Webcam from "react-webcam";

import { CoreEngine } from "@/app/3d/CoreEngine";
import { CoreScene } from "@/app/3d/CoreScene";
import { Avatar } from "@/app/3d/Avatar";
import { FaceDetector } from "@/app/utils/FaceDetector";
import { hasGetUserMedia } from "@/app/utils/utilities";

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bjsCanvas = useRef<HTMLCanvasElement>(null); // For 3D scene
  const coreEngineRef = useRef<CoreEngine>(null);
  const coreSceneRef = useRef<CoreScene>(null);
  const avatarRef = useRef<Avatar>(null);
  const faceDetectorRef = useRef<FaceDetector>(null);

  const runFacemesh = async () => {
    if (!webcamRef.current) throw new Error("Webcam element not found!");

    faceDetectorRef.current ??= new FaceDetector(
      webcamRef.current.video as HTMLVideoElement
    );
    faceDetectorRef.current.init();

    setInterval(async () => {
      const result = await faceDetectorRef.current?.detect();

      if (!result || result.faceBlendshapes.length === 0) return;

      console.log('result:', result);

      // sync morph targets with avatar
      const blendShapes = result.faceBlendshapes[0].categories;
      blendShapes.forEach((blendShape) => {
        const value = blendShape.score;
        if (!avatarRef.current?.morphTargetManager) return;

        const target = avatarRef.current.morphTargetManager.getTargetByName(
          blendShape.categoryName
        );
        if (!target) return;
        target.influence = value > 0.1 ? value : 0;
      });

      // sync head rotation
      if (avatarRef.current) {
        const matrixData = result.facialTransformationMatrixes[0].data;
        const faceRotation = Quaternion.FromRotationMatrix(Matrix.FromArray(matrixData));

        syncHeadRotation(
          avatarRef.current,
          faceRotation
        );
      }

    }, 1000 / 60);
  };

  const onUserMedia = (stream: MediaStream) => {
    console.log("Webcam stream:", stream);
    if (webcamRef.current) {
      webcamRef.current.video!.srcObject = stream;
    }
    runFacemesh();
  };

  const syncHeadRotation = (
    avatar: Avatar,
    headRotation: Quaternion
  ) => {
    // if (face.faceInViewConfidence < 0.85) return;
    const headBoneNode = avatar.bones?.find(bone => bone.name === "Head")?.getTransformNode();
    if (!headBoneNode) return;

    headBoneNode.rotationQuaternion = Quaternion.Slerp(
      headBoneNode.rotationQuaternion ?? Quaternion.Identity(),
      headRotation,
      0.3
    );

    const spine2Node = avatar.bones?.find(bone => bone.name === "Spine1")?.getTransformNode();
    if (!spine2Node) return;

    // slightly rotate the spine with the head
    const spineRotation = Quaternion.FromEulerAngles(
      -headRotation.x * 0.7, // forward backward
      -headRotation.y * 0.65, // rotate left right horizontally
      -headRotation.z * 0.85 // rotate left right vertically
    );
    spine2Node.rotationQuaternion = Quaternion.Slerp(
      spine2Node.rotationQuaternion ?? Quaternion.Identity(),
      spineRotation,
      0.3
    );
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
    if (!hasGetUserMedia()) throw new Error("No webcam access!");
    if (!webcamRef.current) throw new Error("Webcam element not found!");

    faceDetectorRef.current = new FaceDetector(
      webcamRef.current.video as HTMLVideoElement
    );

    if (!bjsCanvas.current) return;
    const { coreEngine } = create3DScene(bjsCanvas.current);

    window.addEventListener("resize", coreEngine.resize.bind(coreEngine));

    return () => {
      window.removeEventListener("resize", coreEngine.resize.bind(coreEngine));
      coreEngine.dispose();
    };
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
        mirrored={true}
        onUserMedia={onUserMedia}
        onUserMediaError={(err) => {
          console.error("Webcam error:", err);
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
