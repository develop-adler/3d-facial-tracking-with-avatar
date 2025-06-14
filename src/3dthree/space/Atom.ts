// Three.js imports
import { MeshStandardMaterial, Vector3, Object3D, Box3, Quaternion } from "three";
import { v4 } from "uuid";

// Rapier imports
// import type { World, RigidBody, ColliderDesc } from "@dimforge/rapier3d-compat";

import type CoreScene from "@/3dthree/core/CoreScene";
import AtomObject from "@/3dthree/space/AtomObject";
import Skybox from "@/3dthree/space/Skybox";
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

import type { Camera, Group, Mesh } from "three";
import { PhysicsShape } from "@/utils/three/havok/physicsShape";
import { PhysicsBody } from "@/utils/three/havok/physicsBody";

class Atom {
    readonly coreScene: CoreScene;
    readonly skybox: Skybox;
    readonly defaultMaterial: MeshStandardMaterial;

    isPhysicsGenerated: boolean = false;
    isLoadingLODs: boolean = false;
    isAtomFinishLoading: boolean = false;
    numberOfObjects: number;
    objects: Array<AtomObject>;
    objectsBodies: Array<PhysicsBody> = [];
    objectPhysicsShape: Map<string, PhysicsShape> = new Map();


    private readonly _uniqueAtomObjects: Map<string, AtomObject>;
    private _lastLodCheckTime: number;
    private _loadStep: number;


    constructor(coreScene: CoreScene) {
        this.coreScene = coreScene;
        this.isPhysicsGenerated = false;
        this.isAtomFinishLoading = false;
        this.isLoadingLODs = false;
        this.numberOfObjects = 0;
        this.objects = [];
        this._lastLodCheckTime = 0;
        this._loadStep = -1;
        this._uniqueAtomObjects = new Map();

        this.skybox = new Skybox(this);
        this.defaultMaterial = this._createDefaultMaterial();
    }

    get scene() {
        return this.coreScene.scene;
    }
    get havokPhysics() {
        return this.coreScene.havokPhysics;
    }

    private _createDefaultMaterial(): MeshStandardMaterial {
        const material = new MeshStandardMaterial({
            color: 0xFF_FF_FF,
            roughness: 0.75,
            metalness: 0.6,
        });
        material.name = "defaultMaterial";
        return material;
    }

    // This is now called from the CoreScene's render loop
    updateLODs(camera: Camera) {
        if (!this.isAtomFinishLoading) return;

        const time = performance.now();
        if (time - this._lastLodCheckTime < 1000 / 15) return; // 15 FPS check
        this._lastLodCheckTime = time;

        const cameraPosition = new Vector3();
        camera.getWorldPosition(cameraPosition);

        for (const object of this.objects) {
            const root = object.currentLODRoot;
            if (!root) continue;

            const distanceToCamera = root.position.distanceTo(cameraPosition);
            object.handleLODSwitchDistance(distanceToCamera);
        }
    }

    async load(executeWhenReady?: () => void) {
        await this.skybox.load();
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

        // load no-texture version for faster load time
        await this.loadStudioObjectModels(uniqueObjects, repeatedObjects, "notexture")

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

        this.loadCollisions(this.objects);

        executeWhenReady?.();

        const loadSpaceLOD = async (quality: ObjectQualityWithNoTexture) => {
            await this.loadStudioObjectModels(
                uniqueObjects,
                repeatedObjects,
                quality
            );

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

            this._loadStep++;
        };

        (async () => {
            this.isLoadingLODs = true;

            // eslint-disable-next-line unicorn/prefer-ternary
            if (isMobile()) {
                // only load low quality version on mobile
                await loadSpaceLOD(OBJECT_LOD_LEVELS[2]);
            } else {
                // load high quality LOD on other devices
                // await loadSpaceLOD(OBJECT_LOD_LEVELS[1]);
                await loadSpaceLOD(OBJECT_LOD_LEVELS[4]);

                // load all qualities except lowest
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

        const roots: Array<Object3D> = [];
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
                this.objects.push(atomObject);

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
                    if (!atomObject.originalGltf) throw new Error("Container is not loaded");
                } catch (error) {
                    if (clientSettings.DEBUG)
                        console.error("Failed to load 3D object:", error);
                    return;
                }

                const root = atomObject.originalGltf.scene;

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
                        atomObject.originalGltf
                    );
                    this.objects.push(clonedAtomObject);
                    try {
                        await clonedAtomObject.load(
                            // quality === "notexture" ? "low" : quality
                            quality,
                            // quality === "notexture"
                        );
                        if (!clonedAtomObject.originalGltf)
                            throw new Error("Container is not loaded");
                    } catch (error) {
                        if (clientSettings.DEBUG)
                            console.error("Failed to load 3D object:", error);
                        return;
                    }

                    const root = clonedAtomObject.originalGltf.scene;

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
        );
    }

    async loadCollisions(objects: Array<AtomObject>) {
        if (!this.havokPhysics || this.isPhysicsGenerated) return;
        const start = performance.now();

        for (const object of objects) {
            if (object.currentLODRoot) {
                this.generateCollision(object.currentLODRoot);
            }
        }

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
    }

    generateCollision(root: Group, useCachedShape: boolean = true) {
        if (!this.havokPhysics) return;

        const metadata = root.userData as StudioMeshMetaData;
        // if (metadata.type === 'images') return;

        console.log('Creating physics body for:', metadata.name);

        let shapeType = 6;
        switch (metadata.subType) {
            case "picture_frame": {
                shapeType = 4;
        //         this.havokPhysics.createTrimesh(root, {
        //             mass: 0, restitution: 0
        //         });
                break;
            }
        //     default: {
        //         this.havokPhysics.createConvexHull(root, {
        //             mass: 0, restitution: 0
        //         });
        //         break;
        //     }
        }

        let shape;

        if (useCachedShape) {
            const cacheShapeParams =
                metadata.id + "_" + v4();

            shape = this.objectPhysicsShape.get(cacheShapeParams);
            if (!shape) {
                const bb = new Box3().setFromObject(root);
                shape = new PhysicsShape(
                    {
                        type: shapeType,
                        parameters: {
                            mesh: root,
                            includeChildMeshes: true,
                            rotation: root.getWorldQuaternion(new Quaternion()),
                            center: bb.getCenter(new Vector3()), // to correctly position the shape
                        },
                    },
                    this.havokPhysics.havokPlugin
                );
                shape.material = { friction: 0.6, restitution: 0 };
                shape.filterMembershipMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
                this.objectPhysicsShape.set(cacheShapeParams, shape);

                // console.log('Generated physics shape for:', cacheShapeParams, shape);
                // } else {
                //     console.log(
                //         'Has physics shape from',
                //         root.metadata.name, metadata.scale.map(num => num).join('_'),
                //         ':',
                //         this.objectPhysicsShape.get(cacheShapeParams)
                //     );
            }
        } else {
            const bb = new Box3().setFromObject(root);
            shape = new PhysicsShape(
                {
                    type: shapeType,
                    parameters: {
                        mesh: root,
                        includeChildMeshes: true,
                        rotation: root.getWorldQuaternion(new Quaternion()),
                        center: bb.getCenter(new Vector3()), // to correctly position the shape
                    },
                },
                this.havokPhysics.havokPlugin
            );
            shape.material = { friction: 0.6, restitution: 0 };
            shape.filterMembershipMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
        }

        const body = new PhysicsBody(root, 0, true, this.havokPhysics.havokPlugin);
        body.setMassProperties({ mass: 0 });
        body.shape = shape;

        // for debugging
        // this.physicsViewer.showBody(body);
    }

    dispose(disposeSkybox: boolean = true) {
        if (disposeSkybox) this.skybox.dispose();
        this.defaultMaterial.dispose();

        // Dispose of all atom objects
        for (const object of this.objects) {
            object.dispose();
        }
        this.objects = [];
        this._uniqueAtomObjects.clear();

        // Remove physics bodies from the world
        if (this.havokPhysics) {
            for (const body of this.objectsBodies) {
                this.havokPhysics.removeBody(body);
            }
        }
        this.objectsBodies = [];

        this.isPhysicsGenerated = false;
        this.isAtomFinishLoading = false;
    }
}

export default Atom;
