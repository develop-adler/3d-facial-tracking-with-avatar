import { BoneIKController } from "@babylonjs/core/Bones/boneIKController";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Scene } from "@babylonjs/core/scene";
import { isValidRPMAvatarId } from "../utils/utilities";
import { useAvatarStore } from "../stores/useAvatarStore";

type EyeBones = {
    left?: Bone;
    right?: Bone;
};

const RPM_AVATAR_PARAMS = `
    morphTargets=
        browDownLeft,
        browDownRight,
        browInnerUp,
        browOuterUpLeft,
        browOuterUpRight,
        cheekPuff,
        cheekSquintLeft,
        cheekSquintRight,
        eyeBlinkLeft,
        eyeBlinkRight,
        eyeLookDownLeft,
        eyeLookDownRight,
        eyeLookInLeft,
        eyeLookInRight,
        eyeLookOutLeft,
        eyeLookOutRight,
        eyeLookUpLeft,
        eyeLookUpRight,
        eyeSquintLeft,
        eyeSquintRight,
        eyeWideLeft,
        eyeWideRight,
        jawForward,
        jawLeft,
        jawOpen,
        jawRight,
        mouthClose,
        mouthDimpleLeft,
        mouthDimpleRight,
        mouthFrownLeft,
        mouthFrownRight,
        mouthFunnel,
        mouthLeft,
        mouthLowerDownLeft,
        mouthLowerDownRight,
        mouthPressLeft,
        mouthPressRight,
        mouthPucker,
        mouthRight,
        mouthRollLower,
        mouthRollUpper,
        mouthShrugLower,
        mouthShrugUpper,
        mouthSmileLeft,
        mouthSmileRight,
        mouthStretchLeft,
        mouthStretchRight,
        mouthUpperUpLeft,
        mouthUpperUpRight,
        noseSneerLeft,
        noseSneerRight
    &useDracoMeshCompression=true
    &useQuantizeMeshOptCompression=true
    &textureAtlas=1024
    &textureFormat=webp
`.replace(/\s+/g, '');

const DEFAULT_AVATAR_ID = '67fe6f7713b3fb7e8aa0328c';

export class Avatar {
    readonly scene: Scene;
    container?: AssetContainer;
    bones?: Bone[];
    headBone?: Bone;
    eyeBones: EyeBones;
    morphTargetManager?: MorphTargetManager;
    boneIKController?: BoneIKController;
    boneIKUpdateObserver?: Observer<Scene>;

    currentAvatarId: string = '';
    private _isLoadingAvatar: boolean = false;

    constructor(scene: Scene) {
        this.scene = scene;
        this.eyeBones = {};
    }

    async loadAvatar(id: string = useAvatarStore.getState().avatarId ?? DEFAULT_AVATAR_ID) {
        if (this._isLoadingAvatar || this.currentAvatarId === id) return;

        this._isLoadingAvatar = true;

        const container = await loadAssetContainerAsync(
            `https://models.readyplayer.me/${id}.glb?` +
            RPM_AVATAR_PARAMS,
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

        this.boneIKUpdateObserver = this.scene.onBeforeRenderObservable.add(() => {
            this.boneIKController?.update();
        });

        this.currentAvatarId = id;
        useAvatarStore.getState().setAvatarId(id);

        this.bones = container.skeletons[0].bones;
        this.headBone = container.skeletons[0].bones.find(
            (bone) => bone.name === "Head"
        );
        this.eyeBones.left = container.skeletons[0].bones.find(
            (bone) => bone.name === "LeftEye"
        );
        this.eyeBones.right = container.skeletons[0].bones.find(
            (bone) => bone.name === "RightEye"
        );

        const leftEyeTNode = this.eyeBones.left?.getTransformNode();
        if (leftEyeTNode) leftEyeTNode.rotationQuaternion = null;
        const rightEyeTNode = this.eyeBones.right?.getTransformNode();
        if (rightEyeTNode) rightEyeTNode.rotationQuaternion = null;

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
        this.eyeBones = {};
        this.morphTargetManager = undefined;
        this.currentAvatarId = '';
        this._isLoadingAvatar = false;

        this.boneIKUpdateObserver?.remove();
        this.boneIKUpdateObserver = undefined;
        this.boneIKController = undefined;

        this.container?.dispose();
    }
}

export type AvatarType = InstanceType<typeof Avatar>;
