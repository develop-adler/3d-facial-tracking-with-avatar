import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Scene } from "@babylonjs/core/scene";

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

export class Avatar {
    readonly scene: Scene;
    container?: AssetContainer;
    bones?: Bone[];
    headBone?: Bone;
    eyeBones: EyeBones;
    morphTargetManager?: MorphTargetManager;

    constructor(scene: Scene) {
        this.scene = scene;
        this.eyeBones = {};
    }

    async loadAvatar(id: string = '67fe6f7713b3fb7e8aa0328c') {
        // asian female: 6809df026026f5144d94f3f4
        // white female: 6809df7c4e68c7a706ac7e55
        // black male: 6809d76c64ce38bc90a10c88
        // white male: 67fe6f7713b3fb7e8aa0328c

        this.container = await loadAssetContainerAsync(
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
        this.container.addAllToScene();

        this.bones = this.container.skeletons[0].bones;
        this.headBone = this.container.skeletons[0].bones.find(
            (bone) => bone.name === "Head"
        );
        this.eyeBones.left = this.container.skeletons[0].bones.find(
            (bone) => bone.name === "LeftEye"
        );
        this.eyeBones.right = this.container.skeletons[0].bones.find(
            (bone) => bone.name === "RightEye"
        );

        const leftEyeTNode = this.eyeBones.left?.getTransformNode();
        if (leftEyeTNode) leftEyeTNode.rotationQuaternion = null;
        const rightEyeTNode = this.eyeBones.right?.getTransformNode();
        if (rightEyeTNode) rightEyeTNode.rotationQuaternion = null;

        if (this.container.morphTargetManagers.length > 0) {
            this.morphTargetManager = this.container.morphTargetManagers[0];
        }
        return [this.container, this.headBone] as const;
    }

    dispose() {
        this.container?.dispose();
    }
}
