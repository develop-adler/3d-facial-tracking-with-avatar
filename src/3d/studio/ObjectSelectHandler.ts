import { GPUPicker } from "@babylonjs/core/Collisions/gpuPicker";
import {
    KeyboardEventTypes,
    type KeyboardInfo,
} from "@babylonjs/core/Events/keyboardEvents";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import ObjectHighlightHandler from "@/3d/studio/ObjectHighlightHandler";
import type { ObjectAbsoluteTransforms } from "@/models/3d";
import { isSafari } from "@/utils/browserUtils";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

class ObjectSelectHandler {
    readonly spaceBuilder: SpaceBuilder;
    readonly scene: Scene;
    readonly selectedMeshGroup: TransformNode;
    readonly onSetSelectedObjectObservable: Observable<
        AbstractMesh | Mesh | null
    > = new Observable();
    readonly keyboardObservable: Observer<KeyboardInfo>;

    gpuPicker?: GPUPicker;
    copiedMesh?: Mesh | AbstractMesh;
    storedMeshTransforms?: ObjectAbsoluteTransforms;
    storedMultiMeshTransforms: Record<string, ObjectAbsoluteTransforms> = {};

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;
        this.scene = spaceBuilder.scene;

        this.selectedMeshGroup = new TransformNode(
            "selectedMeshGroup",
            this.scene,
            true
        );

        // use GPUPicker if browser is not Safari
        if (!isSafari()) {
            this.gpuPicker = new GPUPicker();

            this.scene.skipPointerMovePicking = true;
            this.scene.skipPointerDownPicking = true;
            this.scene.skipPointerUpPicking = true;
        }

        // fix weird bug where first pick with on-demand rendering doesn't work
        this.gpuPicker?.pickAsync(0, 0);

        this.keyboardObservable = this._initKeyboardHandler();
    }

    toggleObjectLock(
        mesh: AbstractMesh | Mesh,
        forceLock?: boolean,
        forceUnlock?: boolean
    ) {
        if (
            this.spaceBuilder.isEditSpawnAreaMode ||
            mesh.metadata?.isError === true
        )
            return;

        if (forceLock === true) {
            // lock object
            for (const child of mesh.getChildMeshes()) {
                child.doNotSyncBoundingInfo = true;
                child.freezeWorldMatrix();
            }
            this.spaceBuilder.lockedObjects.push(mesh.uniqueId);
        } else if (forceUnlock === true) {
            if (mesh.metadata?.isError === true) return;
            for (const child of mesh.getChildMeshes()) {
                child.doNotSyncBoundingInfo = false;
                child.unfreezeWorldMatrix();
            }
            this.spaceBuilder.lockedObjects.splice(
                this.spaceBuilder.lockedObjects.indexOf(mesh.uniqueId),
                1
            );
        } else if (forceLock === undefined && forceUnlock === undefined) {
            // if object is locked, unlock it
            if (this.spaceBuilder.lockedObjects.includes(mesh.uniqueId)) {
                if (mesh.metadata?.isError === true) return;
                for (const child of mesh.getChildMeshes()) {
                    child.doNotSyncBoundingInfo = false;
                    child.unfreezeWorldMatrix();
                }
                this.spaceBuilder.lockedObjects.splice(
                    this.spaceBuilder.lockedObjects.indexOf(mesh.uniqueId),
                    1
                );

                this.spaceBuilder.saveStateHandler.saveState("unlock", {
                    mesh: mesh,
                });
            } else {
                // lock object
                for (const child of mesh.getChildMeshes()) {
                    child.doNotSyncBoundingInfo = true;
                    child.freezeWorldMatrix();
                }
                this.spaceBuilder.lockedObjects.push(mesh.uniqueId);

                this.spaceBuilder.saveStateHandler.saveState("lock", {
                    mesh: mesh,
                });
            }
        }

        // this.onSetObjectLockObservable.notifyObservers([
        //     ...this.spaceBuilder.lockedObjects,
        // ]);

        this.handleObjectLockState(mesh);

        // this.renderScene();
    }

    toggleMultiObjectsLock(
        meshes: Array<AbstractMesh | Mesh>,
        forceLock?: boolean,
        forceUnlock?: boolean
    ) {
        if (this.spaceBuilder.isEditSpawnAreaMode) return;

        if (forceLock === true) {
            // lock object
            for (const mesh of meshes) {
                if (mesh.metadata?.isError === true) continue;
                for (const child of mesh.getChildMeshes()) {
                    child.doNotSyncBoundingInfo = true;
                    child.freezeWorldMatrix();
                }
                this.spaceBuilder.lockedObjects.push(mesh.uniqueId);
            }

            this.spaceBuilder.gizmoHandler.gizmoManager.positionGizmoEnabled = false;
            this.spaceBuilder.gizmoHandler.gizmoManager.rotationGizmoEnabled = false;
            this.spaceBuilder.gizmoHandler.gizmoManager.scaleGizmoEnabled = false;
        } else if (forceUnlock === true) {
            // unlock object
            for (const mesh of meshes) {
                if (mesh.metadata?.isError === true) continue;
                for (const child of mesh.getChildMeshes()) {
                    child.doNotSyncBoundingInfo = false;
                    child.unfreezeWorldMatrix();
                }
            }

            // remove from locked objects
            const uniqueIds = new Set(meshes.map((mesh) => mesh.uniqueId));
            this.spaceBuilder.lockedObjects = this.spaceBuilder.lockedObjects.filter(
                (id) => !uniqueIds.has(id)
            );

            this.spaceBuilder.gizmoHandler.setGizmoType();
        } else if (forceLock === undefined && forceUnlock === undefined) {
            // check if all meshes are locked
            const areAllLocked = meshes.every((mesh) =>
                this.spaceBuilder.lockedObjects.includes(mesh.uniqueId)
            );

            // if all are locked, unlock all, otherwise, lock all
            if (areAllLocked) {
                // unlock
                for (const mesh of meshes) {
                    if (mesh.metadata?.isError === true) continue;
                    for (const child of mesh.getChildMeshes()) {
                        child.doNotSyncBoundingInfo = false;
                        child.unfreezeWorldMatrix();
                    }
                }

                // remove from locked objects
                const uniqueIds = new Set(meshes.map((mesh) => mesh.uniqueId));
                this.spaceBuilder.lockedObjects =
                    this.spaceBuilder.lockedObjects.filter((id) => !uniqueIds.has(id));

                this.spaceBuilder.gizmoHandler.setGizmoType();

                this.spaceBuilder.saveStateHandler.saveState("lock", {
                    meshes,
                });
            } else {
                // lock
                for (const mesh of meshes) {
                    // lock object
                    for (const child of mesh.getChildMeshes()) {
                        child.doNotSyncBoundingInfo = true;
                        child.freezeWorldMatrix();
                    }
                    this.spaceBuilder.lockedObjects.push(mesh.uniqueId);

                    this.spaceBuilder.gizmoHandler.gizmoManager.positionGizmoEnabled =
                        false;
                    this.spaceBuilder.gizmoHandler.gizmoManager.rotationGizmoEnabled =
                        false;
                    this.spaceBuilder.gizmoHandler.gizmoManager.scaleGizmoEnabled = false;
                }

                this.spaceBuilder.saveStateHandler.saveState("lock", {
                    meshes,
                });
            }
        }

        this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(meshes);
        // this.onSetObjectLockObservable.notifyObservers([
        //     ...this.spaceBuilder.lockedObjects,
        // ]);
        // this.renderScene();
    }

    toggleLock(): void {
        if (!this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh) return;

        if (
            this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh ===
            this.selectedMeshGroup
        ) {
            this.toggleMultiObjectsLock(this.selectedMeshGroup.getChildren());
        } else {
            this.toggleObjectLock(
                this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh
            );
        }
    }

    handleObjectLockState(mesh: AbstractMesh | Mesh): void {
        if (this.spaceBuilder.lockedObjects.includes(mesh.uniqueId)) {
            this.spaceBuilder.gizmoHandler.gizmoManager.positionGizmoEnabled = false;
            this.spaceBuilder.gizmoHandler.gizmoManager.rotationGizmoEnabled = false;
            this.spaceBuilder.gizmoHandler.gizmoManager.scaleGizmoEnabled = false;

            // show orange outline for object
            this.spaceBuilder.objectHighlightHandler.showObjectOutline(
                mesh,
                ObjectHighlightHandler.SELECT_LOCKED_COLOR
            );
        } else {
            this.spaceBuilder.gizmoHandler.setGizmoType();

            // show green outline for object
            this.spaceBuilder.objectHighlightHandler.showObjectOutline(
                mesh,
                ObjectHighlightHandler.SELECT_UNLOCKED_COLOR
            );
        }
    }

    unselectAllObjects(saveState: boolean = false) {
        if (!this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh) return;

        const attachedMesh =
            this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh;

        if (attachedMesh === this.selectedMeshGroup) {
            const children = [...this.selectedMeshGroup.getChildren()];
            if (saveState) {
                this.spaceBuilder.saveStateHandler.saveState("deselect", {
                    meshes: children,
                });
            }
            this.setSelectedGroupObjects([]);
            this.spaceBuilder.gizmoHandler.detachMeshFromGizmo();
            this.spaceBuilder.objectHighlightHandler.hideGroupObjectOutline(
                children as AbstractMesh[]
            );
        } else {
            this.spaceBuilder.gizmoHandler.detachGizmoFromMesh(attachedMesh);
            if (saveState) {
                this.spaceBuilder.saveStateHandler.saveState("deselect", {
                    mesh: attachedMesh,
                });
            }
        }

        this.spaceBuilder.objectHighlightHandler.highlightLayer.removeAllMeshes();
    }

    setSelectedGroupObjects(meshes: Array<AbstractMesh | Mesh | Node>) {
        for (const child of this.selectedMeshGroup.getChildren()) {
            // eslint-disable-next-line unicorn/no-null
            (child as AbstractMesh).setParent(null);
        }

        // reset transforms for group node
        this.selectedMeshGroup.setAbsolutePosition(Vector3.Zero());
        // eslint-disable-next-line unicorn/no-null
        this.selectedMeshGroup.rotationQuaternion = null;
        this.selectedMeshGroup.rotation = Vector3.Zero();
        this.selectedMeshGroup.scaling = Vector3.One();

        if (meshes.length === 0) return;

        for (const mesh of meshes) {
            (mesh as AbstractMesh).setParent(this.selectedMeshGroup);
        }
    }

    setGPUPickerPickList(
        meshList?: Array<Mesh | AbstractMesh>
    ): Array<Mesh | AbstractMesh> {
        const importedList = this.spaceBuilder.currentObjects.flatMap((root) =>
            root.getChildMeshes()
        );
        const userImagesList = this.spaceBuilder.currentObjects.filter(
            (root) => root.metadata.type === "images"
        );
        const list = [...importedList, ...userImagesList];
        if (meshList) list.push(...meshList);
        this.gpuPicker?.setPickingList(list);
        return list;
    }

    private _initKeyboardHandler() {
        return this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN: {
                    switch (kbInfo.event.code) {
                        case "KeyC": {
                            if (
                                this.spaceBuilder.keyboardHandler.keyDown.control ||
                                this.spaceBuilder.keyboardHandler.keyDown.meta
                            ) {
                                this.spaceBuilder.copyObjects();
                            }
                            break;
                        }
                        case "KeyV": {
                            if (
                                this.spaceBuilder.keyboardHandler.keyDown.control ||
                                this.spaceBuilder.keyboardHandler.keyDown.meta
                            ) {
                                this.spaceBuilder.pasteObjects();
                            }
                            break;
                        }
                        case "KeyL": {
                            if (
                                this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh &&
                                this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh !==
                                this.selectedMeshGroup
                            ) {
                                this.toggleObjectLock(
                                    this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh
                                );
                            } else if (
                                this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh ===
                                this.selectedMeshGroup
                            ) {
                                this.toggleMultiObjectsLock(
                                    this.selectedMeshGroup.getChildren()
                                );
                            }
                            break;
                        }
                    }
                    break;
                }
            }
        });
    }
    dispose(): void {
        this.keyboardObservable.remove();
        this.gpuPicker?.dispose();
        this.storedMeshTransforms = undefined;
        this.storedMultiMeshTransforms = {};
        this.copiedMesh = undefined;
        for (const child of this.selectedMeshGroup.getChildren()) {
            // eslint-disable-next-line unicorn/no-null
            child.parent = null;
        }
        this.selectedMeshGroup.dispose();
    }
}

export default ObjectSelectHandler;
