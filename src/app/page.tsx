"use client";

import { useEffect, useRef } from "react";

import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import Webcam from "react-webcam";

import { CoreEngine } from "@/app/3d/CoreEngine";
import { CoreScene } from "@/app/3d/CoreScene";
import { Avatar } from "@/app/3d/Avatar";
import { FaceDetector } from "@/app/utils/FaceDetector";
import { clamp, hasGetUserMedia, normalize } from "@/app/utils/utilities";

import type { Category } from "@mediapipe/tasks-vision";

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

      if (avatarRef.current) {
        // sync morph targets with avatar
        const blendShapes = result.faceBlendshapes[0].categories;
        syncMorphTargets(avatarRef.current, blendShapes);

        // sync head rotation
        const matrixData = result.facialTransformationMatrixes[0].data;
        const faceRotation = Quaternion.FromRotationMatrix(
          Matrix.FromArray(matrixData)
        );
        syncHeadRotation(avatarRef.current, faceRotation);
      }
    }, 1000 / 60);
  };

  const onUserMedia = (stream: MediaStream) => {
    if (webcamRef.current) webcamRef.current.video!.srcObject = stream;
    runFacemesh();
  };

  const syncMorphTargets = (avatar: Avatar, blendShapes: Category[]) => {
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
    avatar: Avatar,
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
      faceDetectorRef.current?.dispose();
    };
  }, []);

  return (
    <>
      {/* centered div horizontally while laying buttons out horizontally */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "absolute",
          margin: "none",
          top: 0,
          left: 0,
          width: "100%",
          height: "25%",
        }}
      >
        {/* 
          asian female: 6809df026026f5144d94f3f4
          white female: 6809df7c4e68c7a706ac7e55
          black male: 6809d76c64ce38bc90a10c88
          white male: 67fe6f7713b3fb7e8aa0328c
        */}
        <button
          style={{
            margin: "0 0.4rem",
            padding: "0.2rem 0.4rem",
            fontSize: "3rem",
            backgroundColor: "#007BFF",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onClick={() => {
            avatarRef.current?.loadAvatar("6809df026026f5144d94f3f4")
          }}
        >
          Asian female
        </button>
        <button
          style={{
            margin: "0 0.4rem",
            padding: "0.2rem 0.4rem",
            fontSize: "3rem",
            backgroundColor: "#007BFF",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onClick={() =>{
            avatarRef.current?.loadAvatar("6809df7c4e68c7a706ac7e55")
          }}
        >
          White female
        </button>
        <button
          style={{
            margin: "0 0.4rem",
            padding: "0.2rem 0.4rem",
            fontSize: "3rem",
            backgroundColor: "#007BFF",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onClick={() =>{
            avatarRef.current?.loadAvatar("6809d76c64ce38bc90a10c88")
          }}
        >
          Black male
        </button>
        <button
          style={{
            margin: "0 0.4rem",
            padding: "0.2rem 0.4rem",
            fontSize: "3rem",
            backgroundColor: "#007BFF",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            transition: "background-color 0.3s",
          }}
          onClick={() =>{
            avatarRef.current?.loadAvatar("67fe6f7713b3fb7e8aa0328c")
          }}
        >
          White male
        </button>
      </div>
      <Webcam
        ref={webcamRef}
        mirrored={true}
        audio={false}
        onUserMedia={onUserMedia}
        onUserMediaError={(err) => {
          console.error("Webcam error:", err);
        }}
        style={{
          position: "absolute",
          margin: "none",
          top: "25%",
          left: 0,
          width: "50%",
          height: "auto",
        }}
      />
      <div
        style={{
          position: "absolute",
          margin: "none",
          top: "25%",
          left: 0,
          width: "50%",
          height: "auto",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "auto",
          }}
        />
      </div>
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

          // mirror
          transform: "scaleX(-1)",
          WebkitTransform: "scaleX(-1)",
          OTransform: "scaleX(-1)",
          MozTransform: "scaleX(-1)",
          filter: "FlipH",
        }}
      />
    </>
  );
}
