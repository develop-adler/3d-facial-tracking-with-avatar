import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Bone } from "@babylonjs/core/Bones/bone";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

registerBuiltInLoaders();

// mouthLowerDownLeft,
// mouthLowerDownRight,
// mouthUpperUpLeft,
// mouthUpperUpRight,

const RPM_AVATAR_PARAMS = `morphTargets=
        eyeBlinkLeft,
        eyeBlinkRight,
        eyeLookDownLeft,
        eyeLookInLeft,
        eyeLookOutLeft,
        eyeLookUpLeft,
        eyeLookDownRight,
        eyeLookInRight,
        eyeLookOutRight,
        eyeLookUpRight,
        browDownLeft,
        browDownRight,
        browInnerUp,
        browOuterUpLeft,
        browOuterUpRight,
        jawOpen,
        mouthPucker
    &useDracoMeshCompression=true
    &useQuantizeMeshOptCompression=true
    &textureAtlas=1024
    &textureFormat=webp
`.replace(/\s+/g, "");

export class Avatar {
    readonly scene: Scene;
    container?: AssetContainer;
    headBone?: Bone;
    morphTargetManager?: MorphTargetManager;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    async loadAvatar() {
        this.container = await loadAssetContainerAsync(
            "https://models.readyplayer.me/67fe6f7713b3fb7e8aa0328c.glb?" +
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
        this.headBone = this.container.skeletons[0].bones.find(
            (bone) => bone.name === "Head"
        );
        if (this.container.morphTargetManagers.length > 0) {
            this.morphTargetManager = this.container.morphTargetManagers[0];
        }
        return [this.container, this.headBone] as const;
    }

    dispose() {
        this.container?.dispose();
    }
}
