import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { Scene } from "@babylonjs/core/scene";
import { v4 } from "uuid";

import type CoreScene from "@/3d/core/CoreScene";
import AtomObject from "@/3d/space/AtomObject";
import Skybox from "@/3d/space/Skybox";
import eventBus from "@/eventBus";
import type { ObjectQualityWithNoTexture } from "@/models/3d";
import type { Asset } from "@/models/common";
import type {
    StudioDecorationObjectProperty,
    StudioMeshMetaData,
} from "@/models/studio";
import { isMobile } from "@/utils/browserUtils";

import { clientSettings } from "clientSettings";
import { OBJECT_LOD_LEVELS, PHYSICS_SHAPE_FILTER_GROUPS } from "constant";

import type { Camera } from "@babylonjs/core/Cameras/camera";
// import type { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";

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
    numberOfObjects: number;

    private _loadStep: number;
    private _atomObjects: Array<AtomObject>;
    private readonly _uniqueAtomObjects: Map<string, AtomObject>;
    private readonly _lodObserver: Observer<Camera>;

    constructor(coreScene: CoreScene) {
        this.coreScene = coreScene;

        this.isPhysicsGenerated = false;
        this.isAtomFinishLoading = false;
        this.isLoadingLODs = false;
        this.objectPhysicsShape = new Map();
        this.spacePhysicsBodies = [];
        this.numberOfObjects = 0;
        this._loadStep = -1;
        this._atomObjects = [];
        this._uniqueAtomObjects = new Map();

        this.skybox = new Skybox(this);
        this.defaultMaterial = this._createDefaultMaterial(this.scene);
        this._lodObserver = this._runLodObserver();
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

    private _runLodObserver() {
        // check object LOD switching every 15 fps
        let lastTime = 0;
        return this.scene.onBeforeCameraRenderObservable.add((camera) => {
            if (!this.isAtomFinishLoading) return;

            const time = performance.now();
            if (time - lastTime < 1000 / 15) return;
            lastTime = time;

            // switch to lower LODs when at certain distances from camera
            for (const object of this._atomObjects.values()) {
                const root = object.currentLODRoot;

                if (!root) continue;

                // if (root.isOccluded === true) return;

                const distanceToCamera = Vector3.Distance(
                    root.absolutePosition,
                    camera.globalPosition
                );
                object.handleLODSwitchDistance(distanceToCamera);
            }
        });
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
        }

        // console.log('assetList:', assetList);
        // console.log('uniqueObjects:', uniqueObjects);
        // console.log('repeatedObjects:', repeatedObjects);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const promises: Array<Promise<any>> = [];

        this.scene.blockMaterialDirtyMechanism = true;

        // load no-texture version for faster load time
        promises.push(
            this.loadStudioObjectModels(uniqueObjects, repeatedObjects, "notexture")
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

        this.loadCollisions(this._atomObjects);

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

            // // hide non-texture objects
            // if (this._loadStep === 0) {
            //     for (const mesh of this.lodObjects[-1]) {
            //         mesh.setEnabled(false);
            //         for (const child of mesh.getChildMeshes()) child.setEnabled(false);
            //     }

            //     // for (const object of this._atomObjects) {
            //     //     object.root
            //     // }

            //     // // remove non-texture models geometries for lower memory usage
            //     // this.lodObjects[-1].forEach(mesh => {
            //     //     mesh
            //     //         .getChildMeshes(false, (mesh): mesh is Mesh => mesh.getClassName() === 'Mesh')
            //     //         .forEach(mesh => {
            //     //             if (mesh.geometry) {
            //     //                 mesh.geometry.clearCachedData();
            //     //                 mesh.geometry.dispose();
            //     //             }
            //     //         });
            //     // });

            //     // // remove image assets from list because images don't have LODs
            //     // assetList = assetList.filter(asset => asset.type !== 'images');
            // }

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

    async loadStudioObjectModels(
        uniqueObjects: Array<StudioDecorationObjectProperty>,
        repeatedObjects: Array<StudioDecorationObjectProperty>,
        quality: ObjectQualityWithNoTexture = "high"
    ) {
        let repeatedObjectsCopy = [...repeatedObjects];

        if (clientSettings.DEBUG) {
            console.log(
                "Loading studio object models:",
                uniqueObjects,
                this.coreScene.coreEngine.cachedAssets
            );
        }

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

                const atomObject = new AtomObject(
                    this.coreScene,
                    asset,
                    v4(),
                    object.position,
                    object.rotation,
                    object.scale
                    // object.image,
                    // noTextures
                );
                this._uniqueAtomObjects.set(object.id, atomObject);
                this._atomObjects.push(atomObject);

                // if (asset.type === 'images') {
                //     return this.loadStudioImageObject(
                //         asset,
                //         quality,
                //         object.position,
                //         object.rotation,
                //         [object.scale[0], object.scale[1], 1]
                //     );
                // }
                try {
                    await atomObject.load(quality); // quality === "notexture" ? "low" : quality);
                    if (!atomObject.container) throw new Error("Container is not loaded");
                } catch (error) {
                    if (clientSettings.DEBUG)
                        console.error("Failed to load 3D object:", error);
                    return;
                }

                const root = atomObject.container.meshes[0];

                // this.storeNewObjectLOD(
                //     object,
                //     root,
                //     noTextures === true ? "notexture" : quality
                // );
                roots.push(root);

                // load repeated objects by cloning after original one is added
                // (much faster and lower memory usage)
                for (const repeatedObject of repeatedObjectsCopy) {
                    if (repeatedObject.id !== asset.id) continue;

                    const clonedAtomObject = new AtomObject(
                        this.coreScene,
                        asset,
                        v4(),
                        repeatedObject.position,
                        repeatedObject.rotation,
                        repeatedObject.scale,
                        atomObject.container
                    );
                    this._atomObjects.push(clonedAtomObject);
                    try {
                        await clonedAtomObject.load(
                            // quality === "notexture" ? "low" : quality
                            quality,
                            // quality === "notexture"
                        );
                        if (!clonedAtomObject.container)
                            throw new Error("Container is not loaded");
                    } catch (error) {
                        if (clientSettings.DEBUG)
                            console.error("Failed to load 3D object:", error);
                        return;
                    }

                    const root = clonedAtomObject.container.meshes[0];

                    // this.storeNewObjectLOD(
                    //     repeatedObject,
                    //     root,
                    //     noTextures === true ? "notexture" : quality
                    // );
                    roots.push(root);
                }

                // remove from repeated objects
                repeatedObjectsCopy = repeatedObjectsCopy.filter(
                    (item) => item.id !== asset.id
                );
            })
        ).then(() => {
            if (!this.scene || this.scene.isDisposed) return;
        });
    }

    /** Load physics collisions for all studio objects in the scene */
    async loadCollisions(objects: Array<AtomObject>) {
        if (this.isPhysicsGenerated === true) return;

        const start = performance.now();

        for (const object of objects) {
            if (object.currentLODRoot) this.generateCollision(object.currentLODRoot);
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

    generateCollision(root: Mesh, useCachedShape: boolean = true) {
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
                (root.metadata as StudioMeshMetaData).id + "_" + v4();

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

        this._lodObserver.remove();
        this._uniqueAtomObjects.clear();

        if (disposeSkybox) this.skybox.dispose();

        for (const shape of this.objectPhysicsShape.values()) {
            shape.dispose();
        }
        this.objectPhysicsShape.clear();
        for (const body of this.spacePhysicsBodies) {
            body.dispose();
        }
        this.spacePhysicsBodies = [];
        for (const object of this._atomObjects) {
            object.dispose();
        }
        this._atomObjects = [];

        this.isPhysicsGenerated = false;
        this.isAtomFinishLoading = false;

        this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
    }
}

export default Atom;
