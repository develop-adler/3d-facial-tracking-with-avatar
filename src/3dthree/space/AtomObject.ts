import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import type Resource from "@/3d/assets/Resource";
import type CoreScene from "@/3dthree/core/CoreScene";
import type { ObjectQualityWithNoTexture, ObjectTransform } from "@/models/3d";
import type { Asset } from "@/models/common";
import type { StudioMeshMetaData } from "@/models/studio";

import { clientSettings } from "clientSettings";
import {
    OBJECT_LOD_DISTANCES,
    OBJECT_LOD_LEVELS,
    STUDIO_OBJECT_TYPE_DICTIONARY,
} from "constant";

class AtomObject {
    readonly coreScene: CoreScene;
    readonly id: string;
    readonly asset: Asset;
    readonly metadata: StudioMeshMetaData;
    position: ObjectTransform;
    rotation: ObjectTransform;
    scaling: ObjectTransform;
    lods: Record<ObjectQualityWithNoTexture, GLTF | undefined>;
    currentLOD: ObjectQualityWithNoTexture;
    currentLODRoot?: Group; // The root is now a THREE.Group
    loadingPromise?: Promise<GLTF>;
    isClone: boolean;
    originalGltf?: GLTF; // Store the original GLTF for cloning

    constructor(
        coreScene: CoreScene,
        asset: Asset,
        id: string,
        position: ObjectTransform = [0, 0, 0],
        rotation: ObjectTransform = [0, 0, 0],
        scale: ObjectTransform = [1, 1, 1],
        originalGltf?: GLTF
    ) {
        this.coreScene = coreScene;
        this.asset = asset;
        this.id = id;
        this.metadata = {
            id: asset.id,
            name: asset.title,
            type: asset.type,
            subType: asset.subType,
            type3D: asset.subType
                ? STUDIO_OBJECT_TYPE_DICTIONARY[asset.subType]
                : "ground",
            position,
            rotation,
            scale,
        } as StudioMeshMetaData;
        this.position = position;
        this.rotation = rotation;
        this.scaling = scale;
        this.lods = {
            notexture: undefined,
            lowest: undefined,
            low: undefined,
            medium: undefined,
            high: undefined,
            ultra: undefined,
        };
        this.currentLOD = "low";
        this.isClone = !!originalGltf;
        if (originalGltf) {
            this.originalGltf = originalGltf;
        }
    }

    get scene() {
        return this.coreScene.scene;
    }

    async load(quality: ObjectQualityWithNoTexture = "low"): Promise<GLTF> {
        this.currentLOD = quality;
        if (this.isClone) {
            return this.clone(this.originalGltf, quality);
        }
        if (this.loadingPromise) return this.loadingPromise;
        this.loadingPromise = this.loadOriginal(quality);
        return this.loadingPromise;
    }

    async loadOriginal(
        quality: ObjectQualityWithNoTexture = "low"
    ): Promise<GLTF> {
        if (this.loadingPromise) return this.loadingPromise;
        if (this.lods[quality]) return this.lods[quality] as GLTF;

        const { id, path } = this.asset;

        const qualities: ObjectQualityWithNoTexture[] = [
            "notexture",
            "lowest",
            "low",
            "medium",
            "high",
            "ultra",
        ];

        let startIndex = qualities.indexOf(quality);
        if (startIndex === -1) startIndex = 0;

        // a recursive function that tries to load a LOD
        // if any version is not available, load the next quality version
        const getModelLODResource = async (index: number): Promise<Resource> => {
            if (index >= qualities.length) {
                throw new Error("No available model quality found");
            }

            const currentQuality = qualities[index];
            const resourcePath = `/static/${path}/model_${currentQuality}.glb`;

            try {
                const resource = await this.coreScene.coreEngine.getAssetFilePath(
                    `${id}_${quality}`,
                    resourcePath
                );
                if (!resource.isAvailable && resource.checkedAvailability)
                    throw new Error("Resource not available");
                else if (resource.isAvailable && resource.checkedAvailability) {
                    // if the resource is already available, return it
                    return resource;
                } else if (!resource.checkedAvailability) {
                    const available = await resource.checkAvailability();
                    if (!available) throw new Error("Resource not available");
                }
                return resource;
            } catch {
                console.warn(`Failed to load ${resourcePath}, trying next quality...`);
                // try the next quality
                // return getModelLODResource(qualityToLoad, qualities, index + 1);
                return getModelLODResource(index + 1);
            }
        };

        let resource: Resource;
        try {
            resource = await getModelLODResource(OBJECT_LOD_LEVELS.indexOf(quality));
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error(`Failed to find model: ${this.id}`, error);
            throw error;
        }

        if (!this.scene) throw new Error("Scene is disposed");

        let gltf: GLTF;
        try {
            // Use the CoreEngine's shared GLTFLoader instance
            gltf = await this.coreScene.coreEngine.gltfLoader.loadAsync(resource.url);
            this.originalGltf = gltf; // Store the first loaded GLTF
            this.lods[quality] = gltf;
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Failed to load studio model:", error);
            throw new Error(`Failed to load studio model: ${this.id}`);
        }

        this.loadingPromise = undefined;
        this._setupRootNode(gltf.scene, quality);
        this.switchLOD(quality);

        return gltf;
    }

    clone(gltf?: GLTF, quality: ObjectQualityWithNoTexture = "low"): GLTF {
        if (!gltf) throw new Error("Original GLTF not provided for cloning");

        // Use SkeletonUtils.clone for robust cloning of skinned and regular meshes
        const clonedScene = gltf.scene.clone();
        const clonedGltf: GLTF = { ...gltf, scene: clonedScene };

        this.lods[quality] = clonedGltf;
        this._setupRootNode(clonedGltf.scene, quality);
        this.switchLOD(quality);

        return clonedGltf;
    }

    private _setupRootNode(
        root: Group,
        quality: ObjectQualityWithNoTexture
    ): void {
        root.position.fromArray(this.position);
        root.rotation.fromArray(this.rotation);
        root.scale.fromArray(this.scaling);

        // Attach metadata to the root for picking or identification
        root.userData = this.metadata;

        const defaultMaterial = this.coreScene.atom.defaultMaterial;

        root.traverse((node) => {
            if (node.type === "Mesh") {
                if (quality === "notexture") {
                    (node as Mesh).material = defaultMaterial;
                }
                // Performance optimization: disable matrix auto-update if objects are static
                // node.matrixAutoUpdate = false;
                // node.updateMatrix();
            }
        });
    }

    handleLODSwitchDistance(cameraDistance: number): void {
        // find the LOD to switch to based on distance to camera
        let lodToSwitchTo = OBJECT_LOD_LEVELS.at(-1)!;

        switch (true) {
            case cameraDistance > OBJECT_LOD_DISTANCES[0]: {
                lodToSwitchTo = "lowest";
                break;
            }
            case cameraDistance > OBJECT_LOD_DISTANCES[1]: {
                lodToSwitchTo = "low";
                break;
            }
            case cameraDistance > OBJECT_LOD_DISTANCES[2]: {
                lodToSwitchTo = "medium";
                break;
            }
            case cameraDistance > OBJECT_LOD_DISTANCES[3]: {
                lodToSwitchTo = "high";
                break;
            }
            case cameraDistance <= OBJECT_LOD_DISTANCES[3]: {
                lodToSwitchTo = "ultra";
                break;
            }
        }

        try {
            this.switchLOD(lodToSwitchTo);
        } catch {
            // empty
        }
    }

    switchLOD(quality: ObjectQualityWithNoTexture): void {
        if (this.currentLOD === quality && this.currentLODRoot) return;
        const newLod = this.lods[quality];
        if (!newLod) {
            // Don't throw an error, just means we can't switch yet
            return;
        }

        const newRoot = newLod.scene;
        if (this.currentLODRoot !== newRoot) {
            if (this.currentLODRoot) {
                this.scene.remove(this.currentLODRoot);
            }
            this.scene.add(newRoot);
            this.currentLODRoot = newRoot;
            this.currentLOD = quality;
        }
    }

    dispose(): void {
        this.currentLODRoot = undefined;
        this.loadingPromise = undefined;
        this.originalGltf = undefined;

        for (const lod of Object.values(this.lods)) {
            if (!lod) continue;
            const scene = lod.scene;
            if (!scene) continue;

            // Remove from parent scene
            scene.parent?.remove(scene);

            // Dispose of all materials and geometries
            scene.traverse((object) => {
                if (object.type === "Mesh") {
                    (object as Mesh).geometry?.dispose();
                    if (Array.isArray((object as Mesh).material)) {
                        for (const material of (object as Mesh)
                            .material as Array<MeshStandardMaterial>) {
                            material.dispose();
                        }
                    } else {
                        ((object as Mesh).material as MeshStandardMaterial)?.dispose();
                    }
                }
            });
        }
        // Clear the lods object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.lods = {} as any;
    }
}

export default AtomObject;
