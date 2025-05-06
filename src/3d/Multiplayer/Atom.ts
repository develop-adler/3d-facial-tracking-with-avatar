import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import { Scene } from "@babylonjs/core/scene";

import type MultiplayerScene from "@/3d/Multiplayer/MultiplayerScene";
import eventBus from "@/eventBus";

import { clientSettings } from "clientSettings";
import { PHYSICS_SHAPE_FILTER_GROUPS } from "constant";

import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

class Atom {
    readonly multiplayerScene: MultiplayerScene;
    readonly scene: Scene;
    skybox?: Mesh;

    spaceContainer?: AssetContainer;
    // will be set to true when physics of all objects is generated
    private _isPhysicsGenerated: boolean;
    isAllLODSLoaded: boolean;
    objectPhysicsShape: Map<string, PhysicsShape> = new Map();

    constructor(multiplayerScene: MultiplayerScene) {
        this.multiplayerScene = multiplayerScene;
        this.scene = multiplayerScene.scene;
        this._isPhysicsGenerated = false;
        this.isAllLODSLoaded = false;

        // need to load env map first otherwise materials will be black
        this.loadHDRSkybox().then(async () => {
            this.loadSpace();
        });
    }

    get isPhysicsGenerated() {
        return this._isPhysicsGenerated;
    }

    async loadHDRSkybox() {
        const skybox = CreateBox("skybox", { size: 1000 }, this.scene);
        skybox.isPickable = false;
        skybox.infiniteDistance = true;
        skybox.ignoreCameraMaxZ = true;
        skybox.alwaysSelectAsActiveMesh = true;
        skybox.doNotSyncBoundingInfo = true;
        skybox.freezeWorldMatrix();
        skybox.convertToUnIndexedMesh();

        // Skybox material
        const hdrSkyboxMaterial = new StandardMaterial(
            "hdrSkyBoxMaterial",
            this.scene
        );
        hdrSkyboxMaterial.backFaceCulling = false;
        // hdrSkyboxMaterial.microSurface = 1.0;
        hdrSkyboxMaterial.disableLighting = true;
        hdrSkyboxMaterial.twoSidedLighting = true;
        skybox.material = hdrSkyboxMaterial;

        this.skybox = skybox;

        const loadSkybox = (url: string) => {
            const sceneEnvMapTexture = CubeTexture.CreateFromPrefilteredData(
                url,
                this.scene,
                ".env",
                false
            );
            this.scene.environmentIntensity = 1;
            this.scene.environmentTexture = sceneEnvMapTexture;

            hdrSkyboxMaterial.reflectionTexture = sceneEnvMapTexture.clone();
            hdrSkyboxMaterial.reflectionTexture.coordinatesMode = 5;
            return sceneEnvMapTexture;
        };

        const sceneEnvMapTexture = loadSkybox("/static/skybox/resource_low.env");

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
                eventBus.emit(
                    `space:envMapReady:${this.multiplayerScene.room.name}`,
                    this
                );
                resolve();
            } else {
                sceneEnvMapTexture.onLoadObservable.addOnce(() => {
                    eventBus.emit(
                        `space:envMapReady:${this.multiplayerScene.room.name}`,
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
                `space:physicsReady:${this.multiplayerScene.room.name}`,
                this
            );
            this.multiplayerScene.coreEngine.spaceLoadingData.space_physics_ready =
                performance.now() -
                this.multiplayerScene.coreEngine.spaceLoadingData.space_initialized;

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

        // for debugging
        // this.physicsViewer.showBody(body);
    }

    dispose() {
        this.spaceContainer?.dispose();
    }
}

export default Atom;
