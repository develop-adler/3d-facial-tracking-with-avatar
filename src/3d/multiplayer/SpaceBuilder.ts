import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer";
import { GridMaterial } from "@babylonjs/materials";
import { toast } from "react-toastify";

import type Resource from "@/3d/assets/Resource";
import type Avatar from "@/3d/avatar/Avatar";
import type CoreScene from "@/3d/core/CoreScene";
import type MultiplayerManager from "@/3d/multiplayer/MultiplayerManager";
import GizmoHandler from "@/3d/studio/GizmoHandler";
import KeyboardHandler from "@/3d/studio/KeyboardHandler";
import MultiplayerEventHandler from "@/3d/studio/MultiplayerEventHandler";
import ObjectHighlightHandler from "@/3d/studio/ObjectHighlightHandler";
import ObjectPlacementHandler from "@/3d/studio/ObjectPlacementHandler";
import ObjectSelectHandler from "@/3d/studio/ObjectSelectHandler";
import SaveStateHandler from "@/3d/studio/SaveStateHandler";
import type { ObjectAbsoluteTransforms, ObjectTransform } from "@/models/3d";
import type { Asset } from "@/models/common";
import type { StudioMeshMetaData } from "@/models/studio";
import eventBus from "@/eventBus";
import { isFirefox, isMobile, isSafari } from "@/utils/browserUtils";

import { clientSettings } from "clientSettings";
import { STUDIO_OBJECT_TYPE_DICTIONARY, TOAST_TOP_OPTIONS } from "constant";

import type {
    AssetContainer,
    InstantiatedEntries,
} from "@babylonjs/core/assetContainer";
import {
    KeyboardEventTypes,
    type KeyboardInfo,
} from "@babylonjs/core/Events/keyboardEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

class SpaceBuilder {
    readonly multiplayerManager: MultiplayerManager;

    readonly floorGrid: Mesh;
    readonly utilityLayer: UtilityLayerRenderer;

    readonly multiplayerEventHandler: MultiplayerEventHandler;
    readonly gizmoHandler: GizmoHandler;
    readonly objectSelectHandler: ObjectSelectHandler;
    readonly saveStateHandler: SaveStateHandler;
    readonly objectHighlightHandler: ObjectHighlightHandler;
    readonly keyboardHandler: KeyboardHandler;
    readonly objectPlacementHandler: ObjectPlacementHandler;

    readonly keyboardObservable: Observer<KeyboardInfo>;

    placementHandlers: Array<ObjectPlacementHandler> = [];
    currentSkyboxData?: Asset;
    currentObjects: Array<AbstractMesh | Mesh>;
    lockedObjects: Array<number>;
    allObjectContainers: Array<AssetContainer | InstantiatedEntries>;
    errorObjectContainers: Array<AssetContainer>;
    copiedMesh?: Mesh | AbstractMesh;

    isPreviewMode: boolean;
    isThumbnailCaptureMode: boolean;
    isEditSpawnAreaMode: boolean;

    constructor(multiplayerManager: MultiplayerManager) {
        this.multiplayerManager = multiplayerManager;

        this.placementHandlers = [];
        this.currentObjects = [];
        this.lockedObjects = [];
        this.allObjectContainers = [];
        this.errorObjectContainers = [];
        this.isPreviewMode = false;
        this.isThumbnailCaptureMode = false;
        this.isEditSpawnAreaMode = false;

        this.floorGrid = this._createFloorGrid();
        this.utilityLayer = this._createUtilityLayer(this.scene, this.camera);

        this.multiplayerEventHandler = new MultiplayerEventHandler(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.saveStateHandler = new SaveStateHandler(
            this,
            this.multiplayerManager.room.localParticipant
        );
        this.objectHighlightHandler = new ObjectHighlightHandler(this);
        this.objectPlacementHandler = new ObjectPlacementHandler(this, this.avatar);
        this.objectSelectHandler = new ObjectSelectHandler(this);
        this.gizmoHandler = new GizmoHandler(this); // must be created after ObjectSelectHandler

        this.keyboardObservable = this._initKeyboardHandler();

        // this.multiplayerManager.avatarController.switchToFirstPersonMode(1);
    }

    get coreScene(): CoreScene {
        return this.multiplayerManager.coreScene;
    }
    get scene(): Scene {
        return this.multiplayerManager.coreScene.scene;
    }
    get camera(): ArcRotateCamera {
        return this.multiplayerManager.coreScene.camera;
    }
    get avatar(): Avatar {
        return this.multiplayerManager.localAvatar;
    }

    private _createFloorGrid(): Mesh {
        const ground = CreateGround(
            "ground",
            { width: 10_000, height: 10_000 },
            this.scene
        );
        ground.isPickable = false;
        ground.doNotSyncBoundingInfo = true;
        ground.freezeWorldMatrix();
        ground.alwaysSelectAsActiveMesh = true;
        ground.layerMask = 1 << 1; // visible on layer 2

        const gridMaterial = new GridMaterial("gridMaterial", this.scene);
        gridMaterial.majorUnitFrequency = 5; // Space between major lines
        gridMaterial.minorUnitVisibility = 0.45; // Visibility of minor lines
        gridMaterial.gridRatio = 1; // Scale of grid units
        gridMaterial.backFaceCulling = false; // Render both sides
        gridMaterial.mainColor = new Color3(1, 1, 1); // Color of main lines
        gridMaterial.lineColor = new Color3(0.75, 0.75, 0.75); // Color of minor lines
        gridMaterial.opacity = 0.8; // set transparency
        gridMaterial.fogEnabled = true; // fade edges
        gridMaterial.freeze();

        ground.material = gridMaterial;
        return ground;
    }

    private _createHighlightLayer(camera: ArcRotateCamera): HighlightLayer {
        const hl = new HighlightLayer("highlightLayer", this.scene, {
            camera,
            // isStroke: true, // commented because it looks ugly
            blurHorizontalSize: 0.6,
            blurVerticalSize: 0.6,
        });
        return hl;
    }

    private _createUtilityLayer(
        scene: Scene,
        camera: ArcRotateCamera
    ): UtilityLayerRenderer {
        const utilLayer = new UtilityLayerRenderer(scene);
        utilLayer.utilityLayerScene.autoClearDepthAndStencil = true;
        utilLayer.setRenderCamera(camera);
        return utilLayer;
    }

    updateObjectTransformUI(mesh: AbstractMesh | Mesh) {
        eventBus.emit("updateObjectTransformUI", {
            location: mesh.position.asArray(),
            rotation: mesh.rotation.asArray(),
            scale: mesh.scaling.asArray(),
        });
        // this.renderScene();
    }

    async changeHDRSkybox(skyboxId: string, doNotSaveState: boolean = false) {
        const asset = await this.coreScene.coreEngine.loadAsset(
            skyboxId,
            "skyboxs"
        );
        if (!asset) {
            if (clientSettings.DEBUG)
                console.error("Error loading skybox asset", skyboxId);
            return;
        }

        this.currentSkyboxData = asset;

        const filePath = `${asset.path}/resource.env`;
        const resource = await this.coreScene.coreEngine.getAssetFilePath(
            asset.id,
            filePath
        );

        if (!resource) return;

        const envMapTexture = CubeTexture.CreateFromPrefilteredData(
            resource.url,
            this.scene,
            ".env",
            false
        );
        envMapTexture.optimizeUVAllocation = true;

        const skyboxReflectionTexture = envMapTexture.clone();
        skyboxReflectionTexture.optimizeUVAllocation = true;

        // wait for textures to finish loading
        await Promise.all([
            new Promise<void>((resolve) => {
                envMapTexture.onLoadObservable.addOnce(() => {
                    resolve();
                });
            }),
            new Promise<void>((resolve) => {
                skyboxReflectionTexture.onLoadObservable.addOnce(() => {
                    resolve();
                });
            }),
        ]);

        for (const mesh of this.scene.meshes) {
            mesh.material?.unfreeze();
        }

        this.scene.blockMaterialDirtyMechanism = true;

        this.scene.environmentTexture?.dispose();
        this.scene.environmentTexture = envMapTexture;

        // update skybox material
        const skyboxMaterial = this.coreScene.atom.skybox.mesh.material as PBRMaterial;
        skyboxMaterial.reflectionTexture?.dispose();
        skyboxMaterial.reflectionTexture = skyboxReflectionTexture;
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
        skyboxMaterial.markDirty(true);

        this.scene.blockMaterialDirtyMechanism = false;

        // this.renderScene();

        this.scene.onAfterRenderObservable.addOnce(() => {
            for (const mesh of this.scene.meshes) {
                mesh.material?.freeze();
            }
            // this.renderScene();
        });

        if (doNotSaveState === false) {
            this.saveStateHandler.saveState("changeSkybox", {
                old: this.currentSkyboxData.id,
                new: skyboxId,
                name: asset.title,
            });
        }
    }

    async addObject(
        asset: Asset,
        quality: "high" | "low" = "high",
        doNotSaveState: boolean = false,
        position?: ObjectTransform,
        rotation?: ObjectTransform,
        scale?: ObjectTransform,
        imageName?: string,
        noClone: boolean = false
    ) {
        const { id, path, type, title, subType } = asset;

        if (doNotSaveState === false && clientSettings.DEBUG) {
            if (clientSettings.DEBUG) console.log("Adding object:", asset);
        }

        const existingObject = this.currentObjects.find(
            (root) => root.metadata.id === id
        );

        let root;
        // if object already exists in the scene, clone it instead of importing again,
        // don't clone picture frames
        if (existingObject && subType !== "picture_frame" && !noClone) {
            const newObject = existingObject.clone(
                id + "_" + this.currentObjects.length,
                // eslint-disable-next-line unicorn/no-null
                null,
                false
            )!;
            if (position) {
                newObject.setAbsolutePosition(Vector3.FromArray(position));
            } else {
                if (subType === "ceiling") {
                    const bb = newObject.getHierarchyBoundingVectors();
                    newObject.position.set(0, Math.abs(bb.max.y - bb.min.y), 0);
                } else {
                    newObject.position.setAll(0);
                }
            }
            newObject.rotation = rotation
                ? Vector3.FromArray(rotation)
                : Vector3.Zero();
            newObject.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

            // fix image aspect ratio
            // if (type === "images") {
            //     if (
            //         newObject.material &&
            //         newObject.material instanceof PBRMaterial &&
            //         newObject.material.albedoTexture
            //     ) {
            //         const texture = newObject.material.albedoTexture as Texture;
            //         const sizes = texture.getSize();
            //         const aspectRatio = sizes.width / sizes.height;
            //         newObject.scaling.x = aspectRatio * newObject.scaling.y;
            //     }
            // }

            root = newObject;

            if (imageName)
                this.setImageForAddedStudioObject(
                    root,
                    root.getChildren()[0] as AbstractMesh,
                    imageName,
                    true
                );
        } else {
            let resource: Resource | undefined;
            try {
                resource = await this.coreScene.coreEngine.getAssetFilePath(
                    `${id}_${quality}`,
                    `${path}/model_${quality}.glb`
                );
            } catch {
                // empty
            }

            if (!resource) {
                try {
                    resource = await this.coreScene.coreEngine.getAssetFilePath(
                        `${id}_low`,
                        `${path}/model_low.glb`
                    );
                } catch {
                    // empty
                }
            }

            if (!resource) {
                this.loadErrorModel(asset, position, rotation);
                return;
            }

            // if (type === "images") {
            //     try {
            //         root = await this.addFlatImageObject(
            //             asset,
            //             quality,
            //             position,
            //             rotation,
            //             scale,
            //             doNotSaveState
            //         );
            //     } catch (error) {
            //         if (clientSettings.DEBUG)
            //             console.error("Error importing image object:", error);
            //         this.loadErrorModel(asset, position, rotation);
            //     }
            // } else {
            const rootNode = new TransformNode(id + "_rootNode", this.scene);

            try {
                const container = await LoadAssetContainerAsync(
                    resource.url,
                    this.scene,
                    {
                        pluginExtension: ".glb",
                    }
                );
                this.allObjectContainers.push(container);
                container.addAllToScene();

                root = rootNode;

                container.meshes[0].parent = rootNode;
                for (const mesh of container.meshes.slice(1)) {
                    mesh.isPickable = true; // for drag-n-drop ray picking
                    mesh.material?.freeze();
                    mesh.alwaysSelectAsActiveMesh = true;
                    mesh.layerMask = (1 << 1) | (1 << 2) | (1 << 3); // visible on both layers 0 and 1
                    mesh.renderingGroupId = 1;
                }

                const subTypeToUse = subType ?? "none";

                // update root mesh metadata to let application know
                // what object type it is to update correct gizmo axis
                root.metadata = {
                    id,
                    name: title,
                    type,
                    subType: subTypeToUse,
                    type3D: STUDIO_OBJECT_TYPE_DICTIONARY[subTypeToUse] ?? "ground",
                } as StudioMeshMetaData;

                if (position) {
                    root.position = Vector3.FromArray(position);
                } else {
                    if (subType === "ceiling") {
                        const bb = root.getHierarchyBoundingVectors();
                        root.position.set(0, Math.abs(bb.max.y - bb.min.y), 0);
                    } else {
                        root.position.setAll(0);
                    }
                }
                // eslint-disable-next-line unicorn/no-null
                root.rotationQuaternion = null;
                root.rotation = rotation ? Vector3.FromArray(rotation) : Vector3.Zero();
                root.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

                if (imageName)
                    this.setImageForAddedStudioObject(
                        root,
                        container.meshes[0],
                        imageName
                    );
            } catch (error) {
                if (clientSettings.DEBUG)
                    console.error("Error loading studio model:", error);
                this.loadErrorModel(asset, position, rotation);
            }
            // }
        }

        if (!root) return;

        // add to list of added objects
        this.currentObjects.push(root as Mesh);

        this.objectSelectHandler.setGPUPickerPickList();
        this.coreScene.atom.generateCollision(root as Mesh);

        // this.renderScene();

        // add to savedStep for undo/redo
        if (doNotSaveState === false) {
            this.saveStateHandler.saveState("add", {
                mesh: root.uniqueId,
            });

            this.gizmoHandler.gizmoManager.attachToMesh(root as Mesh);
            this.saveStateHandler.saveState("select", {
                mesh: root.uniqueId,
            });
        }
    }

    copyObjects() {
        if (!this.gizmoHandler.gizmoManager.attachedMesh) return;
        // if (this.gizmoHandler.gizmoManager.attachedMesh === this.userSpawnPlane)
        //     return;
        this.copiedMesh = this.gizmoHandler.gizmoManager.attachedMesh;
    }

    pasteObjects() {
        if (!this.copiedMesh) {
            toast("Nothing to paste, copy an object first.", TOAST_TOP_OPTIONS);
            return;
        }
        this.duplicateObjects(this.copiedMesh);
    }

    duplicateObjects(mesh?: AbstractMesh | Mesh) {
        // if (this.gizmoHandler.gizmoManager.attachedMesh === this.userSpawnPlane) return;

        const meshToClone = mesh ?? this.gizmoHandler.gizmoManager.attachedMesh;
        if (
            !meshToClone
            //  || meshToClone === this.userSpawnPlane
        )
            return;

        switch (true) {
            // if is a group node, clone all children
            case meshToClone === this.objectSelectHandler.selectedMeshGroup: {
                const children = meshToClone.getChildren();
                const clones: Array<AbstractMesh> = [];
                for (const child of children as Array<AbstractMesh>) {
                    const clone = child.clone(
                        child.name + "_" + this.currentObjects.length,
                        // eslint-disable-next-line unicorn/no-null
                        null,
                        false
                    )!;
                    clone.metadata = child.metadata;

                    clones.push(clone);
                    this.currentObjects.push(clone);
                }

                // remove old children from group node and set new children
                // eslint-disable-next-line unicorn/no-null
                for (const child of children) (child as AbstractMesh).setParent(null);
                for (const clone of clones)
                    clone.setParent(this.objectSelectHandler.selectedMeshGroup);

                this.gizmoHandler.attachGizmoToGroupNode();
                this.objectSelectHandler.setGPUPickerPickList();

                // show outline for all objects in group
                this.objectHighlightHandler.showObjectOutlineForGroup(
                    this.objectSelectHandler.selectedMeshGroup.getChildren()
                );

                this.saveStateHandler.saveState("duplicate", {
                    meshes: clones.map((clone) => clone.uniqueId),
                    priorSelectedMeshes: children.map((child) => child.uniqueId),
                });

                // this.onObjectDuplicateObservable.notifyObservers(clones);

                break;
            }
            // if is picture frame and don't have image content, don't clone
            case meshToClone.metadata.subType === "picture_frame" &&
                !meshToClone.metadata.imageContent: {
                    (async () => {
                        const asset = await this.coreScene.coreEngine.loadAsset(
                            meshToClone.metadata.id,
                            meshToClone.metadata.type
                        );
                        if (!asset) {
                            if (clientSettings.DEBUG)
                                console.error(
                                    `Failed to load studio painting asset ${meshToClone.metadata.id}`
                                );
                            return;
                        }
                        this.addObject(
                            asset,
                            isMobile() ? "low" : "high",
                            false,
                            meshToClone.position.asArray(),
                            meshToClone.rotation.asArray(),
                            meshToClone.scaling.asArray(),
                            undefined,
                            true
                        );
                    })();

                    break;
                }
            default: {
                const clone = meshToClone.clone(
                    meshToClone.name + "_" + this.currentObjects.length,
                    // eslint-disable-next-line unicorn/no-null
                    null,
                    false
                )!;
                clone.metadata = meshToClone.metadata;

                this.objectHighlightHandler.hideObjectOutline(meshToClone);
                this.gizmoHandler.gizmoManager.attachToMesh(clone);

                this.currentObjects.push(clone);

                this.objectSelectHandler.setGPUPickerPickList();

                this.saveStateHandler.saveState("duplicate", {
                    mesh: clone.uniqueId,
                    priorSelectedMesh: meshToClone.uniqueId,
                });

                break;
            }
        }
    }

    deleteObjects() {
        if (!this.gizmoHandler.gizmoManager.attachedMesh) return;

        if (
            this.gizmoHandler.gizmoManager.attachedMesh ===
            this.objectSelectHandler.selectedMeshGroup
        ) {
            const children =
                this.gizmoHandler.gizmoManager.attachedMesh.getChildren();
            for (const child of children) {
                this.removeFromScene(child as AbstractMesh);
                this.currentObjects.splice(
                    this.currentObjects.indexOf(child as AbstractMesh),
                    1
                );
            }
            this.objectSelectHandler.setGPUPickerPickList();
            this.gizmoHandler.detachMeshFromGizmo();
            this.saveStateHandler.saveState("delete", {
                meshes: children.map((child) => child.uniqueId),
            });
        } else {
            const meshToRemove = this.gizmoHandler.gizmoManager.attachedMesh;
            this.removeFromScene(meshToRemove);
            this.currentObjects.splice(this.currentObjects.indexOf(meshToRemove), 1);
            this.objectSelectHandler.setGPUPickerPickList();
            this.gizmoHandler.detachMeshFromGizmo();

            this.saveStateHandler.saveState("delete", {
                mesh: meshToRemove.uniqueId,
            });
        }
    }

    addMeshToScene(object: AbstractMesh | Mesh | TransformNode) {
        object.setEnabled(true);
        for (const child of object.getChildMeshes()) child.setEnabled(true);
    }

    removeFromScene(object: AbstractMesh | Mesh | TransformNode): void {
        object.setEnabled(false);
        for (const child of object.getChildMeshes()) child.setEnabled(false);
    }

    async addFlatImageObject(
        object: Asset,
        quality: "high" | "low" = "high",
        position?: ObjectTransform,
        rotation?: ObjectTransform,
        scale?: ObjectTransform,
        doNotSaveState: boolean = false
    ): Promise<Mesh | undefined> {
        const { id, path, title, type, subType } = object;

        const imagePath = `${path}/image_${quality}.jpg`;

        // eslint-disable-next-line unicorn/no-null
        let res: Response | null = null;
        try {
            res = await fetch(imagePath);
        } catch {
            // empty
        }

        if (!res) {
            try {
                res = await fetch(`${path}/image.jpg`);
            } catch {
                // empty
            }
        }

        if (!res) {
            try {
                res = await fetch(`${path}/model.jpg`);
            } catch (error) {
                if (clientSettings.DEBUG) console.error("Error fetching image:", error);
            }
        }

        if (!res) return;

        const blob = await res.blob();

        // create image object to get image dimensions
        const image = new Image();
        image.src = URL.createObjectURL(blob);

        const root = CreatePlane(
            imagePath,
            {
                size: 1.3,
                sideOrientation: 2, // Mesh.DOUBLESIDE
            },
            this.scene
        );
        const material = new PBRMaterial(imagePath + "_material", this.scene);

        const texture = new Texture(
            URL.createObjectURL(blob),
            this.scene,
            true, // noMipmapOrOptions
            true, // invertY
            Texture.TRILINEAR_SAMPLINGMODE,
            undefined,
            undefined,
            blob,
            true
        );
        // flip texture horizontally
        texture.uScale = -1;

        material.albedoTexture = texture;
        material.metallic = 0.4;
        material.roughness = 0.85;
        material.albedoTexture.hasAlpha = true;
        material.albedoTexture.optimizeUVAllocation = true;
        material.albedoTexture.onDispose = () => {
            URL.revokeObjectURL(image.src);
        };
        root.material = material;

        // update plane aspect ratio to match image aspect ratio
        image.addEventListener("load", () => {
            if (doNotSaveState === false) {
                const aspectRatio = image.width / image.height;
                root.scaling.x = aspectRatio * root.scaling.y;
            }
            material.markDirty(true);
            // this.renderScene();
        });

        // update root mesh metadata to let application know
        // what object type it is to update correct gizmo axis
        root.metadata = {
            id,
            name: title,
            type,
            subType: subType ?? "image",
            type3D: "decoration",
        } as StudioMeshMetaData;

        if (position) root.position = Vector3.FromArray(position);
        else root.position.setAll(0);

        // eslint-disable-next-line unicorn/no-null
        root.rotationQuaternion = null;
        root.rotation = rotation ? Vector3.FromArray(rotation) : Vector3.Zero();
        root.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

        // root.isPickable = isSafari();
        root.alwaysSelectAsActiveMesh = true;

        // this.renderScene();

        return root;
    }

    async setImageForAddedStudioObject(
        rootNode: TransformNode,
        rootMesh: AbstractMesh | Mesh,
        imageName: string,
        newMaterial: boolean = false
    ): Promise<void> {
        // path is required to load image
        // if (!this.postData?.path) return;

        // const src = `${this.postData.path}/${imageName}.${isSafari() || isFirefox() ? "jpg" : "avif"
        //     }`;
        const src = "";

        try {
            const res = await fetch(src);
            const blob = await res.blob();

            const file = new File([blob], imageName, {
                type: isSafari() || isFirefox() ? "image/jpg" : "image/avif",
            });
            (rootNode.metadata as StudioMeshMetaData).imageContent = { src, file };

            this._addImageTextureToObject(
                rootMesh,
                URL.createObjectURL(blob),
                newMaterial
            );
        } catch (error) {
            if (clientSettings.DEBUG) console.error("Error fetching image:", error);
        }
    }

    private _addImageTextureToObject(
        rootMesh: AbstractMesh,
        src: string,
        newMaterial: boolean = false
    ) {
        for (const child of rootMesh.getChildMeshes()) {
            if (
                !child.material ||
                !(child.material instanceof PBRMaterial) ||
                child.material.id !== "picture"
            )
                continue;

            const texture = new Texture(src, this.scene, true, false);
            texture.optimizeUVAllocation = true;
            texture.isBlocking = false;

            let material: PBRMaterial;
            if (newMaterial) {
                material = new PBRMaterial("picture_" + child.uniqueId, this.scene);
                child.material = material;
            } else {
                material = child.material;
            }

            material.albedoTexture?.dispose();
            material.albedoTexture = texture;
            material.useAlphaFromAlbedoTexture = true; // use alpha channel from texture
            material.markDirty(true);

            texture.onLoadObservable.addOnce(() => {
                // this.renderScene();
            });
        }
    }

    fixImageAspectRatio(): void {
        const object = this.gizmoHandler.gizmoManager.attachedMesh;
        if (!object || object.metadata.type !== "images") return;
        if (
            !object.material ||
            !(object.material instanceof PBRMaterial) ||
            !object.material.albedoTexture
        )
            return;

        const storedMeshTransforms: ObjectAbsoluteTransforms = {
            absolutePosition: object.getAbsolutePosition().asArray(),
            absoluteRotationQuaternion: object.absoluteRotationQuaternion.asArray(),
            absoluteScaling: object.absoluteScaling.asArray(),
        };

        const texture = object.material.albedoTexture as Texture;
        const sizes = texture.getSize();
        const aspectRatio = sizes.width / sizes.height;
        object.scaling.x = aspectRatio * object.scaling.y;

        const newTransforms: ObjectAbsoluteTransforms = {
            absolutePosition: object.getAbsolutePosition().asArray(),
            absoluteRotationQuaternion: object.absoluteRotationQuaternion.asArray(),
            absoluteScaling: object.absoluteScaling.asArray(),
        };

        this.saveStateHandler.saveState("scale", {
            mesh: object.uniqueId,
            old: storedMeshTransforms,
            new: newTransforms,
        });
    }

    async loadErrorModel(
        object: Asset,
        position?: ObjectTransform,
        rotation?: ObjectTransform
    ): Promise<void> {
        const processMeshes = (meshes: AbstractMesh[]) => {
            const root = meshes[0];
            for (const mesh of meshes) {
                if (mesh.material) {
                    const mat = mesh.material as PBRMaterial;
                    mat.disableLighting = true;
                    mat.specularIntensity = 0;
                    mat.emissiveColor = Color3.Red();
                    mat.emissiveIntensity = 1;
                    mat.metallic = 0;
                    mat.roughness = 1;
                    mat.freeze();
                }
                // mesh.isPickable = isSafari();
                mesh.alwaysSelectAsActiveMesh = true;
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
                mesh.layerMask = 1 << 1; // visible on layer 2
            }

            root.metadata = {
                id: object.id,
                name: object.title,
                type: object.type,
                subType: object.subType,
                type3D: STUDIO_OBJECT_TYPE_DICTIONARY[object.subType!] ?? "ground",
                isError: true,
                position,
                rotation,
                scale: [1, 1, 1],
            } as StudioMeshMetaData;

            root.position = position
                ? Vector3.FromArray(position)
                : Vector3.ZeroReadOnly;
            root.rotation = rotation
                ? Vector3.FromArray(rotation)
                : Vector3.ZeroReadOnly;

            this.currentObjects.push(root);

            // lock object to prevent moving
            for (const child of root.getChildMeshes()) {
                child.doNotSyncBoundingInfo = true;
                child.freezeWorldMatrix();
            }
            this.lockedObjects.push(root.uniqueId);

            this.objectSelectHandler.setGPUPickerPickList(meshes);
        };

        const qualityToLoad = isMobile() ? "low" : "high";

        try {
            const container = await LoadAssetContainerAsync(
                `/static/models/missing_asset_${qualityToLoad}.glb`,
                this.scene,
                {
                    pluginExtension: ".glb",
                }
            );
            this.errorObjectContainers.push(container);
            container.addAllToScene();
            processMeshes(container.meshes);
        } catch (error) {
            if (clientSettings.DEBUG)
                console.error("Failed to load error object model:", error);
        }
    }

    // createNewStudioDraft(
    //     spaceDraft: StudioSpaceProperty,
    //     soundList: SoundList | null,
    //     imageFileCallback?: (file: File) => void,
    //     themeScale: number = 1
    // ) {
    //     if (!this.currentSkyboxData) {
    //         if (clientSettings.DEBUG) console.error("No skybox data available");
    //         return;
    //     }
    //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //     const newSpaceData: SpaceJSON =
    //     {
    //         version: 4,
    //         space: {
    //             size: themeScale,
    //             // previewCamera: {
    //             //     fov: this.thumbnailCamera!.fov,
    //             //     position: [
    //             //         this.thumbnailCamera!.position.x,
    //             //         this.thumbnailCamera!.position.y,
    //             //         this.thumbnailCamera!.position.z,
    //             //     ],
    //             //     target: [
    //             //         this.thumbnailCamera!.target.x,
    //             //         this.thumbnailCamera!.target.y,
    //             //         this.thumbnailCamera!.target.z,
    //             //     ],
    //             // },
    //             atom: {
    //                 name: spaceDraft.title!,
    //                 description: spaceDraft.description!,
    //                 // userSpawnInfo: this.theme.userSpawnInfo,
    //                 models: {
    //                     skybox: this.currentSkyboxData.id,
    //                     architectures: [],
    //                     furnitures: [],
    //                     decorations: [],
    //                     entertainments: [],
    //                 },
    //             },
    //         },
    //     };

    //     const checkDuplicate = (o1: StudioObjectProperty, o2: StudioObjectProperty) => {
    //         // if (o1.type === 'images') {
    //         //     return (
    //         //         o1.id === o2.id &&
    //         //         o1.position[0] === o2.position[0] &&
    //         //         o1.position[1] === o2.position[1] &&
    //         //         o1.position[2] === o2.position[2] &&
    //         //         o1.rotation[0] === o2.rotation[0] &&
    //         //         o1.rotation[1] === o2.rotation[1] &&
    //         //         o1.rotation[2] === o2.rotation[2] &&
    //         //         o1.scale[0] === o2.scale[0] &&
    //         //         o1.scale[1] === o2.scale[1]
    //         //     );
    //         // } else {
    //         return (
    //             o1.id === o2.id &&
    //             o1.position[0] === o2.position[0] &&
    //             o1.position[1] === o2.position[1] &&
    //             o1.position[2] === o2.position[2] &&
    //             o1.rotation[0] === o2.rotation[0] &&
    //             o1.rotation[1] === o2.rotation[1] &&
    //             o1.rotation[2] === o2.rotation[2] &&
    //             o1.scale[0] === o2.scale[0] &&
    //             o1.scale[1] === o2.scale[1] &&
    //             o1.scale[2] === o2.scale[2]
    //         );
    //         // }
    //     };

    //     // add objects to apropriate lists, don't add duplicates
    //     for (const object of [...this.currentObjects, ...this.coreScene.atom.currentSceneObjects]) {
    //         const objectMetadata = object.metadata as StudioMeshMetaData;
    //         if (objectMetadata.imageContent) {
    //             imageFileCallback?.(objectMetadata.imageContent.file);
    //         }
    //         // let objectData: StudioDecorationObjectProperty | StudioImageObjectProperty;
    //         // if (objectMetadata.type === 'images') {
    //         //     objectData = {
    //         //         type: objectMetadata.type,
    //         //         id: objectMetadata.id,
    //         //         position: [object.position.x, object.position.y, object.position.z],
    //         //         rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    //         //         scale: [object.scaling.x, object.scaling.y],
    //         //     };
    //         // } else {
    //         const objectData: StudioObjectProperty = {
    //             type: objectMetadata.type,
    //             id: objectMetadata.id,
    //             position: [object.position.x, object.position.y, object.position.z],
    //             rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    //             scale: [object.scaling.x, object.scaling.y, object.scaling.z],
    //         };
    //         // if (objectMetadata.imageContent) {
    //         //     objectData.image = objectMetadata.imageContent.file.name;
    //         // }
    //         // }

    //         const objectModels = newSpaceData.space.atom.models[objectMetadata.type as StudioObjectTypeItems] ?? [];

    //         // filter out duplicates
    //         if (
    //             objectModels.some((obj: StudioObjectProperty) =>
    //                 // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //                 checkDuplicate(obj as any, objectData as any)
    //             )
    //         ) {
    //             continue;
    //         }
    //         objectModels.push(objectData);
    //     }

    //     if (soundList) newSpaceData.space.sounds = soundList;

    //     if (clientSettings.DEBUG) {
    //         console.log('Saved studio draft:', newSpaceData);
    //     }

    //     return newSpaceData;
    // };

    private _initKeyboardHandler() {
        // keyboard events
        return this.scene.onKeyboardObservable.add((kbInfo) => {
            //   if (kbInfo.type === 2) this._startIdleTimeout();
            //   else if (this.isIdle) this.isIdle = false;

            // if (this.isPreviewMode === true) {
            //     if (kbInfo.event.code === "Escape") {
            //         this.setPreviewMode(false);
            //         //   this.onSetPreviewModeObservable.notifyObservers(false);
            //     }
            //     return;
            // }

            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN: {
                    switch (kbInfo.event.code) {
                        case "KeyC": {
                            if (
                                this.keyboardHandler.keyDown.control ||
                                this.keyboardHandler.keyDown.meta
                            ) {
                                this.copyObjects();
                            }
                            break;
                        }
                        case "KeyV": {
                            if (
                                this.keyboardHandler.keyDown.control ||
                                this.keyboardHandler.keyDown.meta
                            ) {
                                this.pasteObjects();
                            }
                            break;
                        }
                    }
                    break;
                }
            }
        });
    }

    dispose() {
        this.scene.blockfreeActiveMeshesAndRenderingGroups = true;

        for (const handler of this.placementHandlers) {
            handler.dispose();
        }
        this.placementHandlers = [];

        this.multiplayerEventHandler.dispose();
        this.keyboardHandler.dispose();
        this.saveStateHandler.dispose();
        this.gizmoHandler.dispose();
        this.objectHighlightHandler.dispose();
        this.objectSelectHandler.dispose();
        this.objectPlacementHandler.dispose();

        this.floorGrid.dispose(false, true);
        this.utilityLayer.dispose();
        this.keyboardObservable.remove();

        this.lockedObjects = [];
        for (const container of this.allObjectContainers) {
            container.dispose();
        }
        this.allObjectContainers = [];
        for (const mesh of this.currentObjects) {
            mesh.dispose(false, true);
        }
        this.currentObjects = [];
        for (const container of this.errorObjectContainers) {
            container.dispose();
        }
        this.errorObjectContainers = [];
        this.copiedMesh?.dispose(false, true);
        this.copiedMesh = undefined;

        // this.multiplayerManager.avatarController.switchToThirdPersonMode(1);
        this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
    }
}

export default SpaceBuilder;
