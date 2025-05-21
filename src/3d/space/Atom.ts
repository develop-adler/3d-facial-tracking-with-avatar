import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { Scene } from "@babylonjs/core/scene";

import type CoreScene from "@/3d/core/CoreScene";
import eventBus from "@/eventBus";
import type { Asset } from "@/models/common";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";
import { PHYSICS_SHAPE_FILTER_GROUPS, TOAST_TOP_OPTIONS } from "constant";

import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { toast } from "react-toastify";

class Atom {
    readonly coreScene: CoreScene;
    readonly scene: Scene;
    skybox: Mesh;

    spaceContainer?: AssetContainer;
    isEnvMapReady: boolean = false; // set to true when env map is ready
    // set to true when physics bodies of all objects are generated
    private _isPhysicsGenerated: boolean;
    isAllLODSLoaded: boolean;
    objectPhysicsShape: Map<string, PhysicsShape> = new Map();
    spacePhysicsBodies: Array<PhysicsBody> = [];

    constructor(coreScene: CoreScene) {
        this.coreScene = coreScene;
        this.scene = coreScene.scene;
        this._isPhysicsGenerated = false;
        this.isAllLODSLoaded = false;
        this.skybox = this._createSkyboxMesh();
    }

    get isPhysicsGenerated() {
        return this._isPhysicsGenerated;
    }

    async load() {
        // need to load env map first otherwise materials will be black
        await this.loadHDRSkybox();
        await this.loadSpace();
    }

    private _createSkyboxMesh() {
        const skybox = CreateBox("skybox", { size: 1000 }, this.scene);
        skybox.isPickable = false;
        skybox.infiniteDistance = true;
        skybox.ignoreCameraMaxZ = true;
        skybox.alwaysSelectAsActiveMesh = true;
        skybox.doNotSyncBoundingInfo = true;
        skybox.freezeWorldMatrix();
        skybox.convertToUnIndexedMesh();

        // hide skybox by default
        skybox.setEnabled(useLiveKitStore.getState().skyboxEnabled);

        return skybox;
    }

    async loadHDRSkybox(
        assetId: string = useLiveKitStore.getState().currentSkybox,
        intensity: number = useLiveKitStore.getState().skyboxIntensity,
        showSkybox: boolean = useLiveKitStore.getState().skyboxEnabled,
        isChangeSkybox: boolean = false
    ) {
        this.skybox.setEnabled(showSkybox);

        let asset: Asset;
        try {
            asset = await this.coreScene.coreEngine.loadAsset(assetId, "skyboxs");
        } catch (error) {
            if (clientSettings.DEBUG) console.error("Failed to load skybox:", error);
            toast("Failed to load skybox", TOAST_TOP_OPTIONS);
            return;
        }

        const resourceLow = await this.coreScene.coreEngine.getAssetFilePath(
            assetId + "_low",
            "/static/" + asset.path + "/resource_low.env"
        );

        // Skybox material
        let hdrSkyboxMaterial = this.skybox.material as StandardMaterial | null;

        if (!hdrSkyboxMaterial) {
            hdrSkyboxMaterial = new StandardMaterial("hdrSkyBoxMaterial", this.scene);
            hdrSkyboxMaterial.backFaceCulling = false;
            // hdrSkyboxMaterial.microSurface = 1.0;
            hdrSkyboxMaterial.disableLighting = true;
            hdrSkyboxMaterial.twoSidedLighting = true;

            this.skybox.material = hdrSkyboxMaterial;
        }

        const sceneEnvMapTexture = CubeTexture.CreateFromPrefilteredData(
            resourceLow.url,
            this.scene,
            ".env",
            false
        );
        const reflectionTexture = sceneEnvMapTexture.clone();

        if (isChangeSkybox) {
            // wait for textures to finish loading
            await Promise.all([
                new Promise<void>((resolve) => {
                    sceneEnvMapTexture.onLoadObservable.addOnce(() => {
                        resolve();
                    });
                }),
                new Promise<void>((resolve) => {
                    reflectionTexture.onLoadObservable.addOnce(() => {
                        resolve();
                    });
                }),
            ]);

            for (const mesh of this.scene.meshes) {
                mesh.material?.unfreeze();
            }

            this.scene.blockMaterialDirtyMechanism = true;

            this.scene.environmentTexture?.dispose();
            this.scene.environmentTexture = sceneEnvMapTexture;

            // update skybox material
            const skyboxMaterial = this.skybox.material as PBRMaterial;
            skyboxMaterial.reflectionTexture?.dispose();
            skyboxMaterial.reflectionTexture = reflectionTexture;
            skyboxMaterial.reflectionTexture.coordinatesMode = 5; // SKYBOX_MODE
            skyboxMaterial.markDirty(true);

            this.scene.blockMaterialDirtyMechanism = false;
        } else {
            this.scene.environmentTexture?.dispose();
            this.scene.environmentTexture = sceneEnvMapTexture;
            this.scene.environmentIntensity = intensity;

            hdrSkyboxMaterial.reflectionTexture?.dispose();
            hdrSkyboxMaterial.reflectionTexture = reflectionTexture;
            hdrSkyboxMaterial.reflectionTexture.coordinatesMode = 5;
        }

        this.scene.onAfterRenderObservable.addOnce(() => {
            for (const mesh of this.scene.meshes) {
                mesh.material?.freeze();
            }
        });

        const loadHighLODSkybox = async () => {
            const resource = await this.coreScene.coreEngine.getAssetFilePath(
                assetId,
                "/static/" + asset.path + "/resource.env"
            );
            const cubeTexture = CubeTexture.CreateFromPrefilteredData(
                resource.url,
                this.scene,
                ".env",
                false
            );
            cubeTexture.coordinatesMode = 5;
            if (cubeTexture.isReady()) {
                hdrSkyboxMaterial.reflectionTexture?.dispose();
                hdrSkyboxMaterial.reflectionTexture = cubeTexture;
                hdrSkyboxMaterial.freeze();
            } else {
                cubeTexture.onLoadObservable.addOnce((texture) => {
                    hdrSkyboxMaterial.reflectionTexture?.dispose();
                    hdrSkyboxMaterial.reflectionTexture = texture;
                    hdrSkyboxMaterial.freeze();
                });
            }
        };

        loadHighLODSkybox();

        useLiveKitStore.setState({
            currentSkybox: assetId,
        });

        return new Promise<void>((resolve) => {
            if (sceneEnvMapTexture.isReady()) {
                this.isEnvMapReady = true;
                eventBus.emit(`space:envMapReady:${this.coreScene.room.name}`, this);
                resolve();
            } else {
                sceneEnvMapTexture.onLoadObservable.addOnce(() => {
                    this.isEnvMapReady = true;
                    eventBus.emit(`space:envMapReady:${this.coreScene.room.name}`, this);
                    resolve();
                });
            }
        });
    }

    async loadSpace() {
        const container = await loadAssetContainerAsync(
            "/static/space/modern_atom.glb",
            this.scene,
            {
                onProgress: (progress) => {
                    if (clientSettings.DEBUG) {
                        console.log(
                            "%c[ATOM DEBUG] %cLoading space:",
                            "color: orange",
                            "color: white",
                            Math.floor((progress.loaded / progress.total) * 100)
                        );
                    }
                },
            }
        );
        container.meshes[0].name = "modern_atom";
        this.spaceContainer = container;
        container.addAllToScene();
        this.loadCollisions(container);
    }

    /** Load physics collisions for all studio objects in the scene */
    async loadCollisions(container: AssetContainer) {
        if (this._isPhysicsGenerated === true) return;

        const start = performance.now();

        this.generateCollision(container.meshes[0] as Mesh);

        this.scene.onAfterPhysicsObservable.addOnce(() => {
            this._isPhysicsGenerated = true;
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
        physicsShapeType: PhysicsShapeType = 6,
        useCachedShape: boolean = true
    ) {
        let shape;

        if (useCachedShape) {
            const cacheShapeParams = "modern_atom";

            shape = this.objectPhysicsShape.get(cacheShapeParams);
            if (!shape) {
                const bbMinMax = root.getHierarchyBoundingVectors(true);
                const bbCenter = bbMinMax.min.add(bbMinMax.max).scale(0.5);
                shape = new PhysicsShape(
                    {
                        type: physicsShapeType,
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
                    type: physicsShapeType,
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

        this.spacePhysicsBodies.push(body);

        // for debugging
        // this.physicsViewer.showBody(body);
    }

    toggleSkybox(force: boolean = false) {
        if (this.skybox) {
            this.skybox.setEnabled(force ? true : !this.skybox.isEnabled());
        }
    }

    setSkyboxIntensity(intensity: number) {
        for (const mesh of this.scene.meshes) {
            for (const child of mesh.getChildMeshes()) {
                child.material?.unfreeze();
            }
        }

        this.scene.environmentIntensity = intensity;

        this.scene.onAfterRenderObservable.addOnce(() => {
            for (const mesh of this.scene.meshes) {
                for (const child of mesh.getChildMeshes()) {
                    child.material?.freeze();
                }
            }
        });
    }

    dispose(disposeSkybox: boolean = true) {
        if (disposeSkybox) this.skybox?.dispose(false, true);
        for (const shape of this.objectPhysicsShape.values()) {
            shape.dispose();
        }
        for (const body of this.spacePhysicsBodies) {
            body.dispose();
        }
        this.objectPhysicsShape.clear();
        this._isPhysicsGenerated = false;
        this.isAllLODSLoaded = false;
        this.isEnvMapReady = false;
        this.spaceContainer?.dispose();
    }
}

export default Atom;
