import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { Scene } from "@babylonjs/core/scene";

import type CoreScene from "@/3d/core/CoreScene";
import eventBus from "@/eventBus";

import { clientSettings } from "clientSettings";
import { PHYSICS_SHAPE_FILTER_GROUPS } from "constant";

import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

class Atom {
    readonly coreScene: CoreScene;
    readonly scene: Scene;
    skybox?: Mesh;

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
    }

    get isPhysicsGenerated() {
        return this._isPhysicsGenerated;
    }

    async load() {
        // need to load env map first otherwise materials will be black
        await this.loadHDRSkybox();
        await this.loadSpace();
    }

    async loadHDRSkybox(intensity: number = 1, showSkybox: boolean = true) {
        if (!this.skybox) {
            this.skybox = CreateBox("skybox", { size: 1000 }, this.scene);
            this.skybox.isPickable = false;
            this.skybox.infiniteDistance = true;
            this.skybox.ignoreCameraMaxZ = true;
            this.skybox.alwaysSelectAsActiveMesh = true;
            this.skybox.doNotSyncBoundingInfo = true;
            this.skybox.freezeWorldMatrix();
            this.skybox.convertToUnIndexedMesh();
        }
        this.skybox.setEnabled(showSkybox);

        // Skybox material
        let hdrSkyboxMaterial = this.skybox.material as StandardMaterial | null;

        if (!hdrSkyboxMaterial) {
            hdrSkyboxMaterial = new StandardMaterial(
                "hdrSkyBoxMaterial",
                this.scene
            );
            hdrSkyboxMaterial.backFaceCulling = false;
            // hdrSkyboxMaterial.microSurface = 1.0;
            hdrSkyboxMaterial.disableLighting = true;
            hdrSkyboxMaterial.twoSidedLighting = true;

            this.skybox.material = hdrSkyboxMaterial;
        }

        this.scene.environmentTexture?.dispose();
        const sceneEnvMapTexture = CubeTexture.CreateFromPrefilteredData(
            "/static/skybox/resource_low.env",
            this.scene,
            ".env",
            false
        );
        this.scene.environmentIntensity = intensity;
        this.scene.environmentTexture = sceneEnvMapTexture;

        hdrSkyboxMaterial.reflectionTexture?.dispose();
        hdrSkyboxMaterial.reflectionTexture = sceneEnvMapTexture.clone();
        hdrSkyboxMaterial.reflectionTexture.coordinatesMode = 5;

        const loadHighLODSkybox = async () => {
            const cubeTexture = CubeTexture.CreateFromPrefilteredData(
                "/static/skybox/resource.env",
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

        return new Promise<void>((resolve) => {
            if (sceneEnvMapTexture.isReady()) {
                this.isEnvMapReady = true;
                eventBus.emit(
                    `space:envMapReady:${this.coreScene.room.name}`,
                    this
                );
                resolve();
            } else {
                sceneEnvMapTexture.onLoadObservable.addOnce(() => {
                    this.isEnvMapReady = true;
                    eventBus.emit(
                        `space:envMapReady:${this.coreScene.room.name}`,
                        this
                    );
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
            eventBus.emit(
                `space:physicsReady:${this.coreScene.room.name}`,
                this
            );
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
