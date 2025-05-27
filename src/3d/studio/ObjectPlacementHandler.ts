import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Observer } from "@babylonjs/core/Misc/observable";
import { toast } from "react-toastify";

import type Resource from "@/3d/assets/Resource";
import type Avatar from "@/3d/avatar/Avatar";
import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import eventBus from "@/eventBus";
import type { Asset } from "@/models/common";
import { PlaceObjectRPC } from "@/models/multiplayer";
import { useStudioStore } from "@/stores/useStudioStore";

import { clientSettings } from "clientSettings";
import { PHYSICS_SHAPE_FILTER_GROUPS, TOAST_TOP_OPTIONS } from "constant";

import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";

const calculateBoundingInfo = (
    rootNode: AbstractMesh,
    refreshBoundingInfo: boolean = false
) => {
    let min = Vector3.Zero();
    let max = Vector3.Zero();
    for (const child of rootNode.getChildMeshes()) {
        if (refreshBoundingInfo) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (child as any).refreshBoundingInfo(true);
        }
        const boundingBox = child.getBoundingInfo().boundingBox;
        if (min === null) {
            min = new Vector3();
            min.copyFrom(boundingBox.minimumWorld);
        }

        if (max === null) {
            max = new Vector3();
            max.copyFrom(boundingBox.maximumWorld);
        }
        min = Vector3.Minimize(min, boundingBox.minimumWorld);
        max = Vector3.Maximize(max, boundingBox.maximumWorld);
    }
    // const size = max.subtract(min);

    // const boundingInfo = new BoundingInfo(min, max);
    // const bbCenterWorld = boundingInfo.boundingBox.centerWorld;

    // const m = MeshBuilder.CreateBox("bounds", { size: 1 }, scene);
    // m.scaling.copyFrom(size);
    // m.position.copyFrom(bbCenterWorld);
    // m.visibility = 0.1;

    return new BoundingInfo(min, max);
};

class ObjectPlacementHandler {
    readonly spaceBuilder: SpaceBuilder;
    readonly avatar: Avatar;

    readonly placementObjectSceneObserver: Observer<Scene>;
    readonly placementObjectPlaceholder: Mesh | InstancedMesh;
    readonly ghostPreviewMaterial: StandardMaterial;

    isPlacingObject: boolean = false;
    placementObjectAsset?: Asset;
    placementObjectContainer?: AssetContainer;

    private _isSelf: boolean;

    constructor(spaceBuilder: SpaceBuilder, avatar: Avatar) {
        this.spaceBuilder = spaceBuilder;
        this.avatar = avatar;

        this.ghostPreviewMaterial = this._createGhostPreviewMaterial();
        this.placementObjectPlaceholder = this._createPlacementObjectPlaceholder(); // must be created after material is created

        this._isSelf =
            this.avatar.participant.identity ===
            this.spaceBuilder.multiplayerManager.room.localParticipant.identity;

        // check at 45FPS
        let elapsedTime = 0;
        const fps = 45;
        const interval = 1 / fps;
        this.placementObjectSceneObserver = this.scene.onBeforeRenderObservable.add(
            (scene) => {
                elapsedTime += scene.getEngine().getDeltaTime() / 1000;

                if (elapsedTime <= interval) return;
                elapsedTime = elapsedTime % interval;

                this._updatePlacementObjectPosition();
            }
        );
    }
    get scene() {
        return this.spaceBuilder.scene;
    }

    private _createPlacementObjectPlaceholder(): Mesh | InstancedMesh {
        const existing = this.scene.getMeshByName("ghostPreviewBox");
        if (existing) {
            const instance = (existing as Mesh).createInstance("ghostPreviewBoxInstance");
            instance.setEnabled(false);
            return instance;
        }
        const placeholder = CreateBox("ghostPreviewBox", { size: 1 }, this.scene);
        placeholder.isPickable = false;
        placeholder.renderingGroupId = 1;
        placeholder.setEnabled(false);
        placeholder.material = this.ghostPreviewMaterial;
        return placeholder;
    }

    private _createGhostPreviewMaterial(): StandardMaterial {
        const existingMaterial = this.scene.getMaterialByName(
            "ghostPreviewMaterial"
        );
        if (existingMaterial) {
            return existingMaterial as StandardMaterial;
        }
        const ghostMaterial = new StandardMaterial(
            "ghostPreviewMaterial",
            this.scene
        );
        ghostMaterial.alpha = 0.4;
        ghostMaterial.diffuseColor = new Color3(0.7, 0.9, 1); // soft bluish
        ghostMaterial.emissiveColor = new Color3(0.2, 0.3, 0.5);
        ghostMaterial.backFaceCulling = false;
        ghostMaterial.roughness = 1;
        ghostMaterial.disableLighting = true;
        return ghostMaterial;
    }

    async loadGhostPreviewObject(asset: Asset) {
        this.placementObjectContainer?.dispose();
        this.placementObjectContainer = undefined;

        this.isPlacingObject = true;

        if (this._isSelf) {
            useStudioStore.getState().setIsPlacingObject(true);
            eventBus.emitWithEvent<PlaceObjectRPC>("participant:placingObject", {
                identity:
                    this.spaceBuilder.multiplayerManager.room.localParticipant.identity,
                origin: "self",
                asset,
            });
        }

        const { id, path } = asset;

        let resource: Resource | undefined;
        try {
            resource = await this.spaceBuilder.coreScene.coreEngine.getAssetFilePath(
                `${id}_low`,
                `/static/${path}/model_low.glb`
            );
        } catch {
            // empty
        }

        if (!resource) {
            toast("Failed to load asset", TOAST_TOP_OPTIONS);
            return;
        }

        let rootNode: AbstractMesh | undefined;
        try {
            const container = await loadAssetContainerAsync(
                resource.url,
                this.scene,
                {
                    pluginExtension: ".glb",
                    pluginOptions: {
                        gltf: {
                            skipMaterials: true,
                            useSRGBBuffers: false,
                            compileMaterials: false,
                            animationStartMode: 0, // NONE
                            loadSkins: false,
                            loadNodeAnimations: false,
                            loadMorphTargets: false,
                        },
                    },
                }
            );
            container.addAllToScene();

            rootNode = container.meshes[0];
            for (const mesh of rootNode.getChildMeshes()) {
                mesh.isPickable = false;
                mesh.alwaysSelectAsActiveMesh = true;
                // mesh.layerMask = (1 << 1) | (1 << 2) | (1 << 3);
                mesh.renderingGroupId = 1;
                if (mesh instanceof Mesh || mesh instanceof AbstractMesh) {
                    mesh.material = this.ghostPreviewMaterial;
                }
            }
            this.placementObjectAsset = asset;
            this.placementObjectContainer = container;
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Error loading studio model:", error);
            return;
        }

        // get bounding info of object
        const boundingInfo = calculateBoundingInfo(rootNode);

        // if pivot of object is not at center, adjust position
        if (
            rootNode.getAbsolutePivotPoint() !==
            boundingInfo.boundingSphere.centerWorld
        ) {
            rootNode.setPivotPoint(boundingInfo.boundingSphere.centerWorld, 1);
        }
    }

    private _updatePlacementObjectPosition() {
        if (!this.isPlacingObject || !this.placementObjectContainer) return;

        const physicsEngine = this.scene.getPhysicsEngine();

        if (!physicsEngine) return;

        const rootNode = this.placementObjectContainer.meshes[0];

        const forward = this.avatar.root.forward.normalize();
        const startPosition = this.avatar.getPosition(true).add(forward);
        const rayOrigin = startPosition.add(new Vector3(0, 1, 0)); // in front & slightly above
        const rayDirection = Vector3.Down();
        const rayLength = 3; // length of the ray

        const result = physicsEngine.raycast(
            rayOrigin,
            rayOrigin.add(rayDirection.scale(rayLength)),
            {
                collideWith: PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT,
            }
        );

        if (result.hasHit) {
            const hitPoint = result.hitPointWorld;

            // for debugging
            // const mesh = this.scene.getMeshByName("hitSphere");
            // if (mesh) {
            //     (mesh as Mesh)
            //         .createInstance("hitSphereInstance")
            //         .setAbsolutePosition(hitPoint);
            // } else {
            //     const hitSphere = CreateBox("hitSphere", { size: 0.06 }, this.scene);
            //     hitSphere.isPickable = false;
            //     hitSphere.renderingGroupId = 1;
            //     hitSphere.setAbsolutePosition(hitPoint);
            // }

            rootNode.setAbsolutePosition(hitPoint);
        } else {
            rootNode.setAbsolutePosition(startPosition);
        }
    }

    placeObject() {
        if (!this.placementObjectAsset || !this.placementObjectContainer) {
            toast(
                "An error occurred while placing object, please try again",
                TOAST_TOP_OPTIONS
            );
            return;
        }

        this.isPlacingObject = false;
        if (this._isSelf) {
            useStudioStore.getState().setIsPlacingObject(false);
            eventBus.emitWithEvent<PlaceObjectRPC>("participant:placeObject", {
                identity:
                    this.spaceBuilder.multiplayerManager.room.localParticipant.identity,
                origin: "self",
                asset: this.placementObjectAsset,
            });
        }

        const placementPosition =
            this.placementObjectContainer.meshes[0].getAbsolutePosition();

        this.placementObjectContainer.dispose();
        this.placementObjectContainer = undefined;
        this.placementObjectPlaceholder.setEnabled(false);

        this.spaceBuilder.addObject(
            this.placementObjectAsset,
            "low",
            undefined,
            placementPosition?.asArray()
        );
        this.placementObjectAsset = undefined;
    }

    dispose(): void {
        this.isPlacingObject = false;
        this.placementObjectContainer?.dispose();
        this.placementObjectContainer = undefined;
        this.placementObjectSceneObserver.remove();
        this.placementObjectPlaceholder.dispose(false, true);
        this.ghostPreviewMaterial.dispose();
    }
}

export default ObjectPlacementHandler;
