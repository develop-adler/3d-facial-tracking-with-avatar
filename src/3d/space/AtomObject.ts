import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

import type Resource from "@/3d/assets/Resource";
import type CoreScene from "@/3d/core/CoreScene";
import type { ObjectQualityWithNoTexture, ObjectTransform } from "@/models/3d";
import type { Asset } from "@/models/common";
import type { StudioMeshMetaData } from "@/models/studio";

import { clientSettings } from "clientSettings";
import {
    OBJECT_LOD_DISTANCES,
    OBJECT_LOD_LEVELS,
    STUDIO_OBJECT_TYPE_DICTIONARY,
} from "constant";

import type {
    AssetContainer,
    InstantiatedEntries,
} from "@babylonjs/core/assetContainer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

type Container = AssetContainer | InstantiatedEntries;

/**
 * This class represents an atom object in a multiplayer environment.
 * This is used to synchronize the state of objects across different clients in a multiplayer session.
 */
class AtomObject {
    readonly coreScene: CoreScene;
    readonly id: string;
    readonly asset: Asset;
    readonly metadata: StudioMeshMetaData;
    position: ObjectTransform;
    rotation: ObjectTransform;
    scaling: ObjectTransform;
    lods: Record<ObjectQualityWithNoTexture, Container | undefined>;
    currentLOD: ObjectQualityWithNoTexture;
    currentLODRoot?: Mesh;
    container?: AssetContainer;
    loadingPromise?: Promise<AssetContainer>;
    isClone: boolean;

    constructor(
        coreScene: CoreScene,
        asset: Asset,
        id: string,
        position: ObjectTransform = [0, 0, 0],
        rotation: ObjectTransform = [0, 0, 0],
        scale: ObjectTransform = [1, 1, 1],
        container?: AssetContainer
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
        this.currentLOD = "low"; // default quality
        this.isClone = !!container;
        if (container) {
            this.container = container;
        }
    }

    get scene() {
        return this.coreScene.scene;
    }

    async load(quality: ObjectQualityWithNoTexture = "low"): Promise<Container> {
        this.currentLOD = quality;
        if (this.isClone) {
            this.loadingPromise = undefined; // reset loading promise for clones
            return this.clone(this.container, quality);
        }
        if (this.loadingPromise) return this.loadingPromise;
        this.loadingPromise = this.loadOriginal(quality);
        return this.loadingPromise;
    }

    async loadOriginal(
        quality: ObjectQualityWithNoTexture = "low"
    ): Promise<AssetContainer> {
        if (this.loadingPromise) return this.loadingPromise;

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
            resource = await getModelLODResource(startIndex);
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Failed to load studio model:", id, error);
            throw new Error(`Failed to load studio model: ${id}, ${error}`);
        }

        if (!this.scene || this.scene.isDisposed)
            throw new Error("Scene is disposed");

        let container: AssetContainer;

        try {
            container = await LoadAssetContainerAsync(resource.url, this.scene, {
                pluginExtension: ".glb",
                pluginOptions: {
                    gltf: {
                        skipMaterials: quality === "notexture",
                        useSRGBBuffers: quality !== "notexture",
                        compileMaterials: quality !== "notexture",
                        animationStartMode: quality === "notexture" ? 0 : 2, // ALL = 2, NONE = 0
                        loadSkins: quality !== "notexture",
                        loadNodeAnimations: quality !== "notexture",
                        loadMorphTargets: quality !== "notexture",
                    },
                },
            });

            // just to make sure animations are disposed
            if (quality === "notexture") {
                for (const animGroup of container.animationGroups) animGroup.dispose();
            }

            this.container = container;
            this.lods[quality] = container;

            container.addAllToScene();
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Failed to load studio model:", error);
            throw new Error(`Failed to load studio model: ${id}`);
        }

        this.loadingPromise = undefined;

        if (!this.scene || this.scene.isDisposed)
            throw new Error("Scene is disposed");

        if (this.currentLODRoot) this.scene.removeMesh(this.currentLODRoot, true);
        const root = container.meshes[0] as Mesh;
        this.currentLODRoot = root;

        root.position = Vector3.FromArray(this.position);
        // eslint-disable-next-line unicorn/no-null
        root.rotationQuaternion = null;
        root.rotation = Vector3.FromArray(this.rotation);
        root.scaling = Vector3.FromArray(this.scaling);

        // flip horizontally for GLTF right-handed coordinate system
        root.scaling.x *= -1;

        root.metadata = this.metadata;

        // if (imageNameOrPath) this.setImageForAddedStudioObject(root, imageNameOrPath);

        for (const mesh of root.getChildMeshes()) {
            if (quality === "notexture") {
                mesh.material = this.scene.getMaterialByName("defaultMaterial");
            }

            // don't comment this to utilize occlusion culling
            mesh.freezeWorldMatrix();

            // don't use these to utilize frustum culling
            // mesh.doNotSyncBoundingInfo = true;
            // mesh.alwaysSelectAsActiveMesh = true;

            // don't enable occlusion culling due to flickering when camera is too close to object
            // mesh.occlusionType = 1; // AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
            // mesh.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
            // mesh.isOccluded = false; // don't make object occluded by default
        }

        this.switchLOD(quality);

        return container;
    }

    clone(
        container?: AssetContainer,
        quality: ObjectQualityWithNoTexture = "low",
        _imageNameOrPath?: string
    ): InstantiatedEntries {
        if (!container) {
            throw new Error("Container is not provided for cloning");
        }

        // let newObject: Mesh;
        // if object already exists in the scene, clone it for minimum draw calls
        const instancedContainer = container.instantiateModelsToScene(
            undefined,
            false,
            {
                // // don't instantiate objects with custom textures to use separate materials
                // doNotInstantiate: metadata.subType === "picture_frame" // || metadata.type === "images"

                // clone GLTF because users will be able to select and manipulate the objects with gizmo
                doNotInstantiate: true,
            }
        );

        this.lods[quality] = instancedContainer;

        const newObject = instancedContainer.rootNodes[0] as Mesh;
        this.currentLODRoot = newObject;

        newObject.metadata = { ...this.metadata };

        newObject.position = Vector3.FromArray(this.position);
        newObject.rotation = Vector3.FromArray(this.rotation);
        newObject.scaling = Vector3.FromArray(this.scaling);

        // flip horizontally for GLTF right-handed coordinate system
        newObject.scaling.x *= -1;

        // if (imageNameOrPath) {
        //     this.setImageForAddedStudioObject(newObject, imageNameOrPath, true);
        // }

        // for (const mesh of newObject.getChildMeshes()) {
        // don't comment this to utilize occlusion culling
        // mesh.freezeWorldMatrix();

        // don't use these to utilize frustum culling
        // mesh.doNotSyncBoundingInfo = true;
        // mesh.alwaysSelectAsActiveMesh = true;

        // don't enable occlusion culling due to flickering when camera is too close to object
        // mesh.occlusionType = 1; // AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
        // mesh.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
        // mesh.isOccluded = false; // don't make object occluded by default
        // }

        this.switchLOD(quality);

        return instancedContainer;
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
        if (this.currentLOD === quality) return;
        if (!this.lods[quality]) {
            throw new Error(
                `LOD quality "${quality}" is not loaded for object ${this.id}`
            );
        }

        const root = this.lods[quality].rootNodes[0] as Mesh;
        this.scene.addMesh(root, true);
        if (this.currentLODRoot) this.scene.removeMesh(this.currentLODRoot, true);
        this.currentLODRoot = root;
    }

    dispose(): void {
        this.currentLODRoot = undefined;
        this.loadingPromise = undefined;
        this.container?.dispose();
        this.container = undefined;
        for (const lod of Object.values(this.lods)) {
            lod?.dispose();
        }
        this.lods = {
            notexture: undefined,
            lowest: undefined,
            low: undefined,
            medium: undefined,
            high: undefined,
            ultra: undefined,
        };
    }
}

export default AtomObject;
