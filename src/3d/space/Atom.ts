import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { Scene } from "@babylonjs/core/scene";
import { toast } from "react-toastify";

import type CoreScene from "@/3d/core/CoreScene";
import type Resource from "@/3d/assets/Resource";
import Skybox from "@/3d/space/Skybox";
import eventBus from "@/eventBus";
import type {
    ObjectLODData,
    ObjectQualityWithNoTexture,
    ObjectTransform,
} from "@/models/3d";
import type { Asset } from "@/models/common";
import type {
    StudioDecorationObjectProperty,
    StudioMeshMetaData,
} from "@/models/studio";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { isMobile } from "@/utils/browserUtils";

import { clientSettings } from "clientSettings";
import {
    OBJECT_LOD_LEVELS,
    PHYSICS_SHAPE_FILTER_GROUPS,
    STUDIO_OBJECT_TYPE_DICTIONARY,
    TOAST_TOP_OPTIONS,
} from "constant";

import type { AssetContainer, InstantiatedEntries } from "@babylonjs/core/assetContainer";
// import type { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

type ImportedObject = {
    root: AbstractMesh;
    container: AssetContainer;
};

class Atom {
    readonly coreScene: CoreScene;
    readonly skybox: Skybox;
    readonly defaultMaterial: PBRMaterial;

    // set to true when physics bodies of all objects are generated
    isPhysicsGenerated: boolean;
    isLoadingLODs: boolean;
    isAtomFinishLoading: boolean;
    readonly objectPhysicsShape: Map<string, PhysicsShape>;
    spacePhysicsBodies: Array<PhysicsBody>;
    currentSceneObjects: Array<AbstractMesh>;
    private _currentQualityObjects: Array<AbstractMesh>; // only used for progressive loading
    numberOfObjects: number;

    // store objects for each LOD level
    // -1: no texture, 0: low, 1: high
    lodObjects: Record<number, Array<AbstractMesh>>;
    private readonly _meshLODData: Map<
        StudioDecorationObjectProperty,
        ObjectLODData
    >;
    private _loadStep: number;
    private _objectContainers: Array<AssetContainer | InstantiatedEntries>;

    constructor(coreScene: CoreScene) {
        this.coreScene = coreScene;

        this.isPhysicsGenerated = false;
        this.isAtomFinishLoading = false;
        this.isLoadingLODs = false;
        this.objectPhysicsShape = new Map();
        this.spacePhysicsBodies = [];
        this.currentSceneObjects = [];
        this._currentQualityObjects = [];
        this.numberOfObjects = 0;
        this.lodObjects = {};
        this._meshLODData = new Map();
        this._loadStep = -1;
        this._objectContainers = [];

        this.skybox = new Skybox(this);
        this.defaultMaterial = this._createDefaultMaterial(this.scene);
    }

    get scene(): Scene {
        return this.coreScene.scene;
    }

    private _createDefaultMaterial(scene: Scene): PBRMaterial {
        const material = new PBRMaterial("defaultMaterial", scene);
        material.albedoColor = Color3.White();
        material.roughness = 0.75;
        material.metallic = 0.6;
        material.freeze();
        return material;
    }

    async load(executeWhenReady?: () => void) {
        // need to load env map first otherwise materials will be black
        await this.skybox.load();

        // await this.loadSpace();
        await this.loadAtomObjects(executeWhenReady);
    }

    async loadAtomObjects(executeWhenReady?: () => void) {
        const start = performance.now();

        const studioSpace = await import("@/jsons/templates/modern.json").then(
            (m) => m.default
        );

        if (clientSettings.DEBUG) console.log("Loading studio space:", studioSpace);

        // let assetIdsToLoad: Array<string> = [];

        // const skyboxId = models.skybox;
        // assetIdsToLoad.push(skyboxId);

        const { architectures, furnitures, decorations, entertainments } =
            studioSpace.space.atom.models;

        // add up all 3D objects to load
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assetList: any[] = [];
        if (architectures) assetList.push(...architectures);
        if (furnitures) assetList.push(...furnitures);
        if (decorations) assetList.push(...decorations);
        if (entertainments) assetList.push(...entertainments);
        // if (images) assetList.push(...images);
        // if (objects) assetList.push(...objects);

        // assetIdsToLoad.push(...assetList.map(item => item.id));

        this.numberOfObjects = assetList.length;

        // // remove duplicates
        // assetIdsToLoad = [...new Set(assetIdsToLoad)];

        // // preload all assets jsons, this is faster than
        // // having to individually load them because we'll only use
        // // 1 API call to get all assets
        // await this.coreScene.coreEngine.loadAssets(assetIdsToLoad);

        // if there are more than 1 instance of the object in the models list,
        // clone the objects instead of importing them again for better performance
        const repeatedObjects: Array<StudioDecorationObjectProperty> = [];
        const uniqueObjects: Array<StudioDecorationObjectProperty> = [];
        const uniqueIds: Array<string> = [];

        for (const item of assetList) {
            if (uniqueIds.includes(item.id)) {
                repeatedObjects.push(item);
            } else {
                uniqueIds.push(item.id);
                uniqueObjects.push(item);
            }

            // init LOD data
            if (!this._meshLODData.has(item)) {
                this._meshLODData.set(item, {
                    lods: {
                        notexture: undefined,
                        lowest: undefined,
                        low: undefined,
                        medium: undefined,
                        high: undefined,
                        ultra: undefined,
                    },
                    currentLOD: undefined,
                });
            }
        }

        // console.log('assetList:', assetList);
        // console.log('uniqueObjects:', uniqueObjects);
        // console.log('repeatedObjects:', repeatedObjects);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const promises: Array<Promise<any>> = [];

        this.scene.blockMaterialDirtyMechanism = true;

        // load no-texture version for faster load time
        promises.push(
            this.loadStudioObjectModels(
                uniqueObjects,
                repeatedObjects,
                "low",
                true
            )
        );

        await Promise.all(promises);

        this.scene.blockMaterialDirtyMechanism = false;

        this.coreScene.coreEngine.spaceLoadingData.space_fst_lod_ready =
            performance.now() -
            this.coreScene.coreEngine.spaceLoadingData.space_initialized;

        eventBus.emit(`space:noTextureLoaded:${this.coreScene.room.name}`, this);

        this._loadStep++;

        if (clientSettings.DEBUG) {
            console.log(
                "%c[ATOM DEBUG] %cAtom no-texture LOD loaded in:",
                "color: orange",
                "color: white",
                (performance.now() - start) / 1000,
                "seconds"
            );
        }

        this.loadCollisions();

        executeWhenReady?.();

        const loadSpaceLOD = async (quality: ObjectQualityWithNoTexture) => {
            this.scene.blockMaterialDirtyMechanism = true;
            await this.loadStudioObjectModels(
                uniqueObjects,
                repeatedObjects,
                quality
            );
            this.scene.blockMaterialDirtyMechanism = false;

            if (clientSettings.DEBUG) {
                console.log(
                    `%c[ATOM DEBUG] %cAtom ${quality} LOD loaded in:`,
                    "color: orange",
                    "color: white",
                    (performance.now() - start) / 1000,
                    "seconds"
                );
            }

            switch (quality) {
                case "lowest": {
                    eventBus.emit(`space:lowestLoaded:${this.coreScene.room.name}`, this);
                    this.coreScene.coreEngine.spaceLoadingData.space_vl_lod_ready =
                        performance.now() -
                        this.coreScene.coreEngine.spaceLoadingData.space_initialized;
                    break;
                }
                case "low": {
                    eventBus.emit(`space:lowLoaded:${this.coreScene.room.name}`, this);
                    this.coreScene.coreEngine.spaceLoadingData.space_lw_lod_ready =
                        performance.now() -
                        this.coreScene.coreEngine.spaceLoadingData.space_initialized;
                    break;
                }
                case "medium": {
                    eventBus.emit(`space:mediumLoaded:${this.coreScene.room.name}`, this);
                    this.coreScene.coreEngine.spaceLoadingData.space_md_lod_ready =
                        performance.now() -
                        this.coreScene.coreEngine.spaceLoadingData.space_initialized;
                    break;
                }
                case "high": {
                    eventBus.emit(`space:highLoaded:${this.coreScene.room.name}`, this);
                    this.coreScene.coreEngine.spaceLoadingData.space_hg_lod_ready =
                        performance.now() -
                        this.coreScene.coreEngine.spaceLoadingData.space_initialized;
                    break;
                }
                case "ultra": {
                    eventBus.emit(`space:ultraLoaded:${this.coreScene.room.name}`, this);
                    this.coreScene.coreEngine.spaceLoadingData.space_uh_lod_ready =
                        performance.now() -
                        this.coreScene.coreEngine.spaceLoadingData.space_initialized;
                    break;
                }
            }

            if (this._loadStep === 0) {
                // hide non-texture objects
                for (const mesh of this.lodObjects[-1]) {
                    mesh.setEnabled(false);
                    for (const child of mesh.getChildMeshes()) child.setEnabled(false);
                }

                // // remove non-texture models geometries for lower memory usage
                // this.lodObjects[-1].forEach(mesh => {
                //     mesh
                //         .getChildMeshes(false, (mesh): mesh is Mesh => mesh.getClassName() === 'Mesh')
                //         .forEach(mesh => {
                //             if (mesh.geometry) {
                //                 mesh.geometry.clearCachedData();
                //                 mesh.geometry.dispose();
                //             }
                //         });
                // });

                // // remove image assets from list because images don't have LODs
                // assetList = assetList.filter(asset => asset.type !== 'images');
            }

            this._loadStep++;
        };

        (async () => {
            this.isLoadingLODs = true;

            // only load low quality version on mobile
            if (isMobile()) {
                await loadSpaceLOD(OBJECT_LOD_LEVELS[2]);
            } else {
                // load high quality LOD on other devices
                await loadSpaceLOD(OBJECT_LOD_LEVELS[1]);
                await loadSpaceLOD(OBJECT_LOD_LEVELS[4]);

                // for await (const level of OBJECT_LOD_LEVELS) {
                //     if (level === OBJECT_LOD_LEVELS[0]) continue; // skip lowest quality
                //     loadSpaceLOD(level);
                // }
            }

            this.isLoadingLODs = false;
            this.coreScene.coreEngine.spaceLoadingData.space_fully_loaded =
                performance.now() -
                this.coreScene.coreEngine.spaceLoadingData.space_initialized;

            this.isAtomFinishLoading = true;
            eventBus.emit(`space:allLODsLoaded:${this.coreScene.room.name}`, this);
            if (clientSettings.DEBUG) {
                console.log(
                    "%c[ATOM DEBUG] %cAtom all LODs loaded in:",
                    "color: orange",
                    "color: white",
                    (performance.now() - start) / 1000,
                    "seconds"
                );
            }
        })();

        return this;
    }

    storeNewObjectLOD(
        objectProperty: StudioDecorationObjectProperty,
        mesh: AbstractMesh,
        quality: ObjectQualityWithNoTexture,
        hideOldLOD: boolean = true
    ): void {
        const lodData = this._meshLODData.get(objectProperty);
        if (lodData) {
            lodData.lods[quality] = mesh;
            if (hideOldLOD && lodData.currentLOD) {
                const oldLOD = lodData.lods[lodData.currentLOD];
                if (oldLOD) {
                    oldLOD.setEnabled(false);
                    for (const child of oldLOD.getChildMeshes()) child.setEnabled(false);
                }
            }
            lodData.currentLOD = quality;

            // since highest quality is loaded last, set it as current LOD
            if (quality === OBJECT_LOD_LEVELS.at(-1)) {
                lodData.currentLOD = quality;
            }
        }
    }

    async loadStudioObjectModels(
        uniqueObjects: Array<StudioDecorationObjectProperty>,
        repeatedObjects: Array<StudioDecorationObjectProperty>,
        quality: ObjectQualityWithNoTexture = "high",
        noTextures: boolean = false
    ) {
        let repeatedObjectsCopy = [...repeatedObjects];

        console.log(
            "Loading studio object models:",
            uniqueObjects,
            this.coreScene.coreEngine.cachedAssets
        );

        const roots: Array<AbstractMesh> = [];
        return Promise.all(
            uniqueObjects.map(async (object) => {
                let asset: Asset;
                try {
                    asset = await this.coreScene.coreEngine.loadAsset(
                        object.id,
                        object.type
                    );
                } catch (error) {
                    if (clientSettings.DEBUG)
                        console.error("Failed to load studio asset:", error);
                    return;
                }

                // if (asset.type === 'images') {
                //     return this.loadStudioImageObject(
                //         asset,
                //         quality,
                //         object.position,
                //         object.rotation,
                //         [object.scale[0], object.scale[1], 1]
                //     );
                // }

                // add to scene
                let data: ImportedObject;
                try {
                    data = await this.loadStudioObject(
                        asset,
                        quality === "notexture" ? "low" : quality,
                        object.position,
                        object.rotation,
                        object.scale,
                        object.image,
                        noTextures
                    );
                } catch (error) {
                    if (clientSettings.DEBUG)
                        console.error("Failed to load studio asset:", error);
                    return;
                }

                const { root, container } = data;

                this.storeNewObjectLOD(
                    object,
                    root,
                    noTextures === true ? "notexture" : quality
                );
                roots.push(root);

                // load repeated objects by cloning after original one is added
                // (much faster and lower memory usage)
                for (const repeatedObject of repeatedObjectsCopy) {
                    if (repeatedObject.id !== asset.id) continue;
                    const clone = this.cloneObject(
                        root.metadata,
                        container,
                        repeatedObject.position,
                        repeatedObject.rotation,
                        repeatedObject.scale,
                        repeatedObject.image
                    );
                    if (clone) {
                        this.storeNewObjectLOD(
                            repeatedObject,
                            clone,
                            noTextures === true ? "notexture" : quality
                        );
                        roots.push(clone);
                    }
                }

                // remove from repeated objects
                repeatedObjectsCopy = repeatedObjectsCopy.filter(
                    (item) => item.id !== asset.id
                );
            })
        ).then(() => {
            if (!this.scene || this.scene.isDisposed) return;

            this.currentSceneObjects = this.currentSceneObjects.filter(
                (mesh) => !this._currentQualityObjects.includes(mesh)
            );

            this._currentQualityObjects = roots;
            this.lodObjects[this._loadStep] = this._currentQualityObjects;
        });
    }

    async loadStudioObject(
        object: Asset,
        quality: ObjectQualityWithNoTexture = "high",
        position?: ObjectTransform,
        rotation?: ObjectTransform,
        scale?: ObjectTransform,
        _imageNameOrPath?: string,
        noTextures: boolean = false
    ): Promise<ImportedObject> {
        if (!this.scene || this.scene.isDisposed)
            throw new Error("Scene is disposed");

        const { id, path, type, title, subType } = object;

        const type3D = subType ? STUDIO_OBJECT_TYPE_DICTIONARY[subType] : "ground";

        // a recursive function that tries to load a LOD
        // if any version is not available, load the next quality version
        const getModelLODResource = async (
            qualityToLoad: ObjectQualityWithNoTexture,
            qualities: string[] = [
                "notexture",
                "lowest",
                "low",
                "medium",
                "high",
                "ultra",
            ],
            index: number = 0
        ): Promise<Resource> => {
            if (index >= qualities.length) {
                throw new Error("No available model quality found");
            }

            const quality = qualities[index];

            if (qualityToLoad !== quality) {
                return getModelLODResource(qualityToLoad, qualities, index + 1);
            }

            const resourcePath = `/static/${path}/model_${quality}.glb`;

            try {
                const resource = await this.coreScene.coreEngine.getAssetFilePath(
                    `${id}_${quality}`,
                    resourcePath
                );
                if (!resource.isAvailable && resource.checkedAvailability)
                    throw new Error("Resource not available");
                else if (!resource.checkedAvailability) {
                    if (!(await resource.checkAvailability())) {
                        throw new Error("Resource not available");
                    }
                }
                return resource;
            } catch {
                console.warn(`Failed to load ${resourcePath}, trying next quality...`);
                // try the next quality
                return getModelLODResource(qualityToLoad, qualities, index + 1);
            }
        };

        let resource: Resource;
        try {
            resource = await getModelLODResource(quality);
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Failed to load studio model:", id, error);
            throw new Error(`Failed to load studio model: ${id}, ${error}`);
        }

        if (!this.scene || this.scene.isDisposed)
            throw new Error("Scene is disposed");

        let container: AssetContainer;
        let meshes: Array<AbstractMesh> = [];

        try {
            container = await loadAssetContainerAsync(resource.url, this.scene, {
                pluginExtension: ".glb",
                pluginOptions: {
                    gltf: {
                        skipMaterials: noTextures,
                        useSRGBBuffers: !noTextures,
                        compileMaterials: !noTextures,
                        animationStartMode: noTextures ? 0 : 2, // ALL = 2, NONE = 0
                        loadSkins: !noTextures,
                        loadNodeAnimations: !noTextures,
                        loadMorphTargets: !noTextures,
                    },
                },
            });
            this._objectContainers.push(container);
            if (noTextures) {
                for (const animGroup of container.animationGroups) animGroup.dispose();
            }
            meshes = container.meshes;
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Failed to load studio model:", error);
            throw new Error(`Failed to load studio model: ${id}`);
        }

        if (!this.scene || this.scene.isDisposed)
            throw new Error("Scene is disposed");

        const root = meshes[0];

        if (position) root.position = Vector3.FromArray(position);
        if (rotation) {
            // eslint-disable-next-line unicorn/no-null
            root.rotationQuaternion = null;
            root.rotation = rotation ? Vector3.FromArray(rotation) : Vector3.Zero();
        }
        if (scale) root.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

        // flip horizontally for GLTF right-handed coordinate system
        root.scaling.x *= -1;

        root.metadata = {
            id,
            name: title,
            type,
            subType,
            type3D,
            position,
            rotation,
            scale,
        } as StudioMeshMetaData;

        // if (imageNameOrPath) this.setImageForAddedStudioObject(root, imageNameOrPath);

        for (const mesh of root.getChildMeshes()) {
            if (noTextures) {
                mesh.material = this.scene.getMaterialByName("defaultMaterial");
            }

            // don't comment this to utilize occlusion culling
            // mesh.freezeWorldMatrix();

            // don't use these to utilize frustum culling
            // mesh.doNotSyncBoundingInfo = true;
            // mesh.alwaysSelectAsActiveMesh = true;

            // don't enable occlusion culling due to flickering when camera is too close to object
            // mesh.occlusionType = 1; // AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
            // mesh.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
            // mesh.isOccluded = false; // don't make object occluded by default
        }
        container.addAllToScene();
        this.currentSceneObjects.push(root);

        return { root, container };
    }

    cloneObject(
        metadata: StudioMeshMetaData,
        container: AssetContainer,
        position: ObjectTransform,
        rotation: ObjectTransform,
        scale: ObjectTransform,
        _imageNameOrPath?: string
    ) {
        // let newObject: Mesh;
        // if object already exists in the scene, clone it for minimum draw calls
        const instancedContainer = container.instantiateModelsToScene(
            undefined,
            false,
            {
                // // don't instantiate objects with custom textures to use separate materials
                // doNotInstantiate: metadata.subType === "picture_frame" // || metadata.type === "images"
                // clone GLTF to
                doNotInstantiate: true,
            }
        );
        this._objectContainers.push(instancedContainer);
        const newObject = instancedContainer.rootNodes[0] as Mesh;

        newObject.metadata = { ...metadata };
        (newObject.metadata as StudioMeshMetaData).position = position;
        (newObject.metadata as StudioMeshMetaData).rotation = rotation;
        (newObject.metadata as StudioMeshMetaData).scale = scale;

        newObject.position = Vector3.FromArray(position);
        newObject.rotation = Vector3.FromArray(rotation);
        newObject.scaling = Vector3.FromArray(scale);

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

        this.currentSceneObjects.push(newObject);

        return newObject;
    }

    /** Load physics collisions for all studio objects in the scene */
    async loadCollisions() {
        if (this.isPhysicsGenerated === true) return;

        const start = performance.now();

        for (const object of this._currentQualityObjects) {
            this.generateCollision(object as Mesh);
        }

        this.scene.onAfterPhysicsObservable.addOnce(() => {
            this.isPhysicsGenerated = true;
            eventBus.emit(`space:physicsReady:${this.coreScene.room.name}`, this);
            this.coreScene.coreEngine.spaceLoadingData.space_physics_ready =
                performance.now() -
                this.coreScene.coreEngine.spaceLoadingData.space_initialized;

            if (clientSettings.DEBUG) {
                console.log(
                    "%c[ATOM DEBUG] %cPhysics generated in:",
                    "color: orange",
                    "color: white",
                    (performance.now() - start) / 1000,
                    "seconds"
                );
            }
        });
    }

    generateCollision(
        root: Mesh,
        useCachedShape: boolean = true
    ) {
        const metadata = root.metadata as StudioMeshMetaData;
        // if (metadata.type === 'images') return;

        let shapeType = 6;
        switch (metadata.subType) {
            case "picture_frame": {
                shapeType = 4;
                break;
            }
        }

        let shape;

        if (useCachedShape) {
            const cacheShapeParams =
                (root.metadata as StudioMeshMetaData).id +
                "_" +
                (root.metadata as StudioMeshMetaData).scale.map((num) => num).join("_");

            shape = this.objectPhysicsShape.get(cacheShapeParams);
            if (!shape) {
                const bbMinMax = root.getHierarchyBoundingVectors(true);
                const bbCenter = bbMinMax.min.add(bbMinMax.max).scale(0.5);
                shape = new PhysicsShape(
                    {
                        type: shapeType,
                        parameters: {
                            mesh: root,
                            includeChildMeshes: true,
                            rotation: root.absoluteRotationQuaternion,
                            center: bbCenter, // to correctly position the shape
                        },
                    },
                    this.scene
                );
                shape.material = { friction: 0.6, restitution: 0 };
                shape.filterMembershipMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
                this.objectPhysicsShape.set(cacheShapeParams, shape);

                // console.log('Generated physics shape for:', cacheShapeParams, shape);
                // } else {
                //     console.log(
                //         'Has physics shape from',
                //         root.metadata.name, (root.metadata as StudioMeshMetaData).scale.map(num => num).join('_'),
                //         ':',
                //         this.objectPhysicsShape.get(cacheShapeParams)
                //     );
            }
        } else {
            const bbMinMax = root.getHierarchyBoundingVectors(true);
            const bbCenter = bbMinMax.min.add(bbMinMax.max).scale(0.5);
            shape = new PhysicsShape(
                {
                    type: shapeType,
                    parameters: {
                        mesh: root,
                        includeChildMeshes: true,
                        rotation: root.absoluteRotationQuaternion,
                        center: bbCenter, // to correctly position the shape
                    },
                },
                this.scene
            );
            shape.material = { friction: 0.6, restitution: 0 };
            shape.filterMembershipMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
        }

        const body = new PhysicsBody(root, 0, true, this.scene);
        body.setMassProperties({ mass: 0 });
        body.shape = shape;

        // for debugging
        // this.physicsViewer.showBody(body);
    }

    dispose(disposeSkybox: boolean = true) {
        this.scene.blockfreeActiveMeshesAndRenderingGroups = true;

        if (disposeSkybox) this.skybox.dispose();

        for (const container of this._objectContainers) {
            container.dispose();
        }
        this._objectContainers = [];
        for (const mesh of this.currentSceneObjects) {
            mesh.dispose(false, true);
        }
        this.currentSceneObjects = [];
        for (const shape of this.objectPhysicsShape.values()) {
            shape.dispose();
        }
        this.objectPhysicsShape.clear();
        for (const body of this.spacePhysicsBodies) {
            body.dispose();
        }
        this.spacePhysicsBodies = [];
        this._currentQualityObjects = [];

        this.isPhysicsGenerated = false;
        this.isAtomFinishLoading = false;

        this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
    }
}

export default Atom;
