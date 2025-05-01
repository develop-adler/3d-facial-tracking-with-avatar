import { BoneIKController } from "@babylonjs/core/Bones/boneIKController";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Scene } from "@babylonjs/core/scene";
import { isValidRPMAvatarId } from "@/app/utils/utilities";
import { useAvatarStore } from "@/app/stores/useAvatarStore";

const RPM_AVATAR_PARAMS = `
    morphTargets=
        browDownLeft,browDownRight,browInnerUp,browOuterUpLeft,browOuterUpRight,
        cheekPuff,cheekSquintLeft,cheekSquintRight,
        eyeBlinkLeft,eyeBlinkRight,
        eyeLookDownLeft,eyeLookDownRight,eyeLookInLeft,eyeLookInRight,eyeLookOutLeft,
        eyeLookOutRight,eyeLookUpLeft,eyeLookUpRight,
        eyeSquintLeft,eyeSquintRight,eyeWideLeft,eyeWideRight,
        jawForward,jawLeft,jawOpen,jawRight,
        mouthClose,
        mouthDimpleLeft,mouthDimpleRight,
        mouthFrownLeft,mouthFrownRight,
        mouthFunnel,mouthLeft,mouthRight,mouthLowerDownLeft,mouthLowerDownRight,
        mouthPressLeft,mouthPressRight,mouthPucker,mouthRollLower,mouthRollUpper,
        mouthShrugLower,mouthShrugUpper,mouthSmileLeft,mouthSmileRight,
        mouthStretchLeft,mouthStretchRight,mouthUpperUpLeft,mouthUpperUpRight,
        noseSneerLeft,
        noseSneerRight
    &useDracoMeshCompression=true
    &useQuantizeMeshOptCompression=true
    &textureAtlas=1024
    &textureFormat=webp
`.replace(/\s+/g, "");

const DEFAULT_AVATAR_ID = "67fe6f7713b3fb7e8aa0328c";

export class Avatar {
    readonly scene: Scene;
    currentAvatarId: string = "";
    container?: AssetContainer;
    bones?: Bone[];
    headBone?: Bone;
    morphTargetManager?: MorphTargetManager;
    boneIKControllers: {
        left?: BoneIKController;
        right?: BoneIKController;
    }
    boneIKUpdateObserver?: Observer<Scene>;
    readonly boneIKTargets: {
        left: {
            pole: TransformNode;
            target: TransformNode;
        };
        right: {
            pole: TransformNode;
            target: TransformNode;
        };
    }
    private _isLoadingAvatar: boolean = false;

    constructor(scene: Scene) {
        this.scene = scene;

        this.boneIKControllers = {};
        this.boneIKTargets = {
            left: {
                pole: new TransformNode("leftHandPoleTarget", scene),
                target: new TransformNode("leftHandTarget", scene),
            },
            right: {
                pole: new TransformNode("rightHandPoleTarget", scene),
                target: new TransformNode("rightHandTarget", scene),
            },
        }
    }

    async loadAvatar(
        id: string = useAvatarStore.getState().avatarId ?? DEFAULT_AVATAR_ID
    ) {
        if (this._isLoadingAvatar || this.currentAvatarId === id) return;

        this._isLoadingAvatar = true;

        const container = await loadAssetContainerAsync(
            `https://models.readyplayer.me/${id}.glb?` + RPM_AVATAR_PARAMS,
            this.scene,
            {
                pluginExtension: ".glb",
                pluginOptions: {
                    gltf: {
                        compileMaterials: true,
                    },
                },
            }
        );
        this.dispose();
        container.addAllToScene();

        this.currentAvatarId = id;
        useAvatarStore.getState().setAvatarId(id);

        const bones = container.skeletons[0].bones;

        console.log('bones', bones.map((bone) => bone.name));

        this.bones = bones;
        this.headBone = bones.find((bone) => bone.name === "Head");

        // update camera position and target to face the avatar's eyes
        const leftEyeTNode = bones
            .find((bone) => bone.name === "LeftEye")
            ?.getTransformNode();
        const rightEyeTNode = bones
            .find((bone) => bone.name === "RightEye")
            ?.getTransformNode();

        if (leftEyeTNode && rightEyeTNode) {
            if (this.scene.activeCamera instanceof ArcRotateCamera) {
                const pointBetweenEyes = new Vector3(
                    (leftEyeTNode.absolutePosition.x + rightEyeTNode.absolutePosition.x) /
                    2,
                    (leftEyeTNode.absolutePosition.y + rightEyeTNode.absolutePosition.y) /
                    2,
                    (leftEyeTNode.absolutePosition.z + rightEyeTNode.absolutePosition.z) /
                    2
                );

                const position = new Vector3(pointBetweenEyes.x, pointBetweenEyes.y, 0);
                this.scene.activeCamera.setPosition(position);
                this.scene.activeCamera.setTarget(position);
            }
        }

        // parent pole target meshes to avatar mesh so that it
        // moves relative to the avatar
        this.boneIKTargets.left.target.parent = container.meshes[0];
        this.boneIKTargets.right.target.parent = container.meshes[0];
        this.boneIKTargets.left.pole.parent = container.meshes[0];
        this.boneIKTargets.right.pole.parent = container.meshes[0];

        this.boneIKControllers.left = new BoneIKController(
            container.meshes[0],
            bones.find((bone) => bone.name === "LeftHand")!,
            {
                targetMesh: this.boneIKTargets.left.target,
                // poleTargetBone: bones.find(bone => bone.name === "LeftShoulder"), // orient bending based on this bone
                // poleTargetMesh: this.boneIKTargets.left.pole,
                // poleAngle: 0,
                // bendAxis: Vector3.Right(),      // usually 'Right' for arms
                slerpAmount: 0.3,
            }
        );
        this.boneIKControllers.right = new BoneIKController(
            container.meshes[0],
            bones.find((bone) => bone.name === "RightHand")!,
            {
                targetMesh: this.boneIKTargets.right.target,
                poleTargetBone: bones.find(bone => bone.name === "RightForeArm"), // orient bending based on this bone
                poleTargetMesh: this.boneIKTargets.right.pole,
                // poleAngle: 0,
                // bendAxis: Vector3.Right(),      // usually 'Right' for arms
                slerpAmount: 0.3,
            }
        );

        // this.boneIKUpdateObserver = this.scene.onBeforeRenderObservable.add(() => {
        //     this.boneIKControllers.left?.update();
        //     this.boneIKControllers.right?.update();
        // });

        if (container.morphTargetManagers.length > 0) {
            this.morphTargetManager = container.morphTargetManagers[0];
        }

        this.container = container;
        this._isLoadingAvatar = false;
        return [this.container, this.headBone] as const;
    }

    async changeAvatar(url: string) {
        if (this._isLoadingAvatar) {
            let interval: NodeJS.Timeout | null = null;
            await new Promise<void>((resolve) => {
                interval = setInterval(() => {
                    if (!this._isLoadingAvatar) {
                        clearInterval(interval!);
                        resolve();
                    }
                }, 50);
            });
        }

        // extract id from url
        const id = url.split("/").pop()?.split(".")[0];
        if (!id || !isValidRPMAvatarId(id)) {
            window.alert("Invalid avatar URL");
            return;
        }
        if (this.currentAvatarId === id) return;
        return this.loadAvatar(id);
    }

    dispose() {
        this.bones = undefined;
        this.headBone = undefined;
        this.morphTargetManager = undefined;
        this.currentAvatarId = "";
        this._isLoadingAvatar = false;

        this.boneIKUpdateObserver?.remove();
        this.boneIKUpdateObserver = undefined;
        this.boneIKControllers = {};

        this.container?.dispose();
    }
}

export type AvatarType = InstanceType<typeof Avatar>;
