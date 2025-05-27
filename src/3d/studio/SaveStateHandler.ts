import {
    KeyboardEventTypes,
    type KeyboardInfo,
} from "@babylonjs/core/Events/keyboardEvents";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { v4 } from "uuid";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import eventBus from "@/eventBus";
import type { ObjectAbsoluteTransforms } from "@/models/3d";
import type {
    StudioSavedStates,
    StudioSavedStateType,
    StudioSaveStateData,
} from "@/models/studio";
import { useStudioStore } from "@/stores/useStudioStore";

import { clientSettings } from "clientSettings";

import type { Observer } from "@babylonjs/core/Misc/observable";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

class SaveStateHandler {
    readonly spaceBuilder: SpaceBuilder;

    savedStates: StudioSavedStates = [];
    currentStateIndex: number = 0;
    lastStateIndex: number = -1;
    readonly keyboardObservable: Observer<KeyboardInfo>;

    static readonly MAX_UNDO_REDO_COUNT = 50;

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;
        this.keyboardObservable = this._initKeyboardHandler();
    }
    get scene(): Scene {
        return this.spaceBuilder.scene;
    }

    /** Save state for undo/redo */
    saveState(type: StudioSavedStateType, data: StudioSaveStateData) {
        // if max undo/redo count is reached, remove the oldest state
        if (this.savedStates.length >= SaveStateHandler.MAX_UNDO_REDO_COUNT) {
            this.savedStates.shift();
        }

        // get current date in YYYY-MM-DD HH:MM:SS format
        const currentDate = new Date();
        const date = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1
            }-${currentDate.getDate()} ${currentDate.getHours()}:${currentDate.getMinutes()}:${currentDate.getSeconds()}`;

        // save state
        this.savedStates[this.currentStateIndex] = {
            uid: v4(),
            date,
            type,
            data,
        };

        // truncate all after current index
        if (this.currentStateIndex < this.savedStates.length - 1) {
            this.savedStates.splice(this.currentStateIndex + 1);
        }

        if (this.savedStates.length < SaveStateHandler.MAX_UNDO_REDO_COUNT) {
            this.lastStateIndex = this.currentStateIndex;
        }

        // processing for UI
        if (Object.hasOwn(data, "mesh") && data.mesh) {
            const mesh = this.scene.getMeshByUniqueId(data.mesh);
            if (mesh instanceof TransformNode && mesh.metadata?.subType) {
                this.savedStates[this.currentStateIndex].name = mesh.metadata.subType;
            }
        } else if (Object.hasOwn(data, "meshes")) {
            this.savedStates[this.currentStateIndex].name = "group";
        } else if (data.name) {
            this.savedStates[this.currentStateIndex].name = data.name;
        }

        this.currentStateIndex++;

        useStudioStore
            .getState()
            .saveStateAndIncrementChange(this.savedStates, this.currentStateIndex);
        eventBus.emitWithEvent("studio:saveState", {
            savedStates: this.savedStates,
            currentStateIndex: this.currentStateIndex,
        });

        if (clientSettings.DEBUG) console.log("Saved states:", this.savedStates);

        // this.onSaveStateObservable.notifyObservers({
        //     savedStates: this.savedStates,
        //     currentStateIndex: this.currentStateIndex,
        // });

        // this.renderScene();
    }

    undo() {
        const lastStep = this.currentStateIndex - 1;

        if (lastStep < 0 || lastStep >= this.savedStates.length) return;

        const step = this.savedStates[lastStep];

        if (clientSettings.DEBUG) console.log("undo:", step);

        // revert changes based on step type
        switch (step.type) {
            case "select": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    this.spaceBuilder.gizmoHandler.detachGizmoFromMesh(mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(
                        this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                    );
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }

                // check the previous step to this and if it's 'select' type, select the mesh
                const lastLastStep = lastStep - 1;
                if (lastLastStep >= 0 && lastLastStep < this.savedStates.length) {
                    const stepPrior = this.savedStates[lastStep - 1];
                    if (stepPrior.type === "select") {
                        if (stepPrior.data.mesh) {
                            this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                            const mesh = this.scene.getMeshByUniqueId(stepPrior.data.mesh);
                            if (mesh)
                                this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                        } else if (stepPrior.data.meshes) {
                            this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                            const meshes = stepPrior.data.meshes.map((id) =>
                                this.scene.getMeshByUniqueId(id)
                            ) as Array<AbstractMesh>;
                            this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(
                                meshes
                            );
                            this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(
                                this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                            );
                            this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                        }
                    }
                }
                break;
            }
            case "deselect": {
                if (step.data.mesh) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (mesh)
                        this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(
                        this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                    );
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "add": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.objectHighlightHandler.hideObjectOutline(mesh);
                    this.spaceBuilder.removeFromScene(mesh);

                    this.spaceBuilder.currentObjects.splice(
                        this.spaceBuilder.currentObjects.indexOf(mesh),
                        1
                    );
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.gizmoHandler.detachMeshFromGizmo();
                }
                break;
            }
            case "delete": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.addMeshToScene(mesh);
                    this.spaceBuilder.currentObjects.push(mesh);
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                } else if (step.data.meshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    for (const mesh of meshes) {
                        this.spaceBuilder.addMeshToScene(mesh);
                        this.spaceBuilder.currentObjects.push(mesh);
                        mesh.setParent(
                            this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                        );
                    }
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "move":
            case "rotate":
            case "scale": {
                if (!step.data.old) break;
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh || typeof step.data.old !== "object") break;
                    const oldTransforms = step.data.old as ObjectAbsoluteTransforms;
                    mesh.setAbsolutePosition(
                        Vector3.FromArray(oldTransforms.absolutePosition)
                    );
                    mesh.rotation = Quaternion.FromArray(
                        oldTransforms.absoluteRotationQuaternion
                    ).toEulerAngles();
                    mesh.scaling.copyFrom(
                        Vector3.FromArray(oldTransforms.absoluteScaling)
                    );

                    this.spaceBuilder.updateObjectTransformUI(mesh);
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                } else if (step.data.meshes) {
                    if (typeof step.data.old !== "object") break;
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    const oldTransforms = step.data.old as Record<
                        string,
                        ObjectAbsoluteTransforms
                    >;
                    for (const mesh of meshes) {
                        mesh.setAbsolutePosition(
                            Vector3.FromArray(oldTransforms[mesh.uniqueId].absolutePosition)
                        );
                        mesh.rotation = Quaternion.FromArray(
                            oldTransforms[mesh.uniqueId].absoluteRotationQuaternion
                        ).toEulerAngles();
                        mesh.scaling.copyFrom(
                            Vector3.FromArray(oldTransforms[mesh.uniqueId].absoluteScaling)
                        );
                    }
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(
                        this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                    );
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "lock": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.objectSelectHandler.toggleObjectLock(
                        mesh,
                        false,
                        true
                    );
                } else if (step.data.meshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(
                        meshes,
                        false,
                        true
                    );
                }
                break;
            }
            case "unlock": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.objectSelectHandler.toggleObjectLock(
                        mesh,
                        true,
                        false
                    );
                } else if (step.data.meshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(
                        meshes,
                        true,
                        false
                    );
                }
                break;
            }
            case "duplicate": {
                if (step.data.mesh && step.data.priorSelectedMesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    //   if (mesh === this.userSpawnPlane) break;
                    this.spaceBuilder.objectHighlightHandler.hideObjectOutline(mesh);
                    this.spaceBuilder.removeFromScene(mesh);
                    this.spaceBuilder.currentObjects.splice(
                        this.spaceBuilder.currentObjects.indexOf(mesh),
                        1
                    );
                    const priorSelectedMesh = this.scene.getMeshByUniqueId(
                        step.data.priorSelectedMesh
                    );
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(
                        priorSelectedMesh
                    );
                } else if (step.data.meshes && step.data.priorSelectedMeshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    for (const child of meshes as Array<AbstractMesh>) {
                        this.spaceBuilder.removeFromScene(child);
                        this.spaceBuilder.currentObjects.splice(
                            this.spaceBuilder.currentObjects.indexOf(child),
                            1
                        );
                    }
                    const priorSelectedMeshes = step.data.priorSelectedMeshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    for (const mesh of priorSelectedMeshes as Array<AbstractMesh>) {
                        mesh.setParent(
                            this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                        );
                    }

                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                break;
            }
            case "changeSkybox": {
                this.spaceBuilder.changeHDRSkybox(step.data.old as string, true);
                break;
            }
        }

        this.currentStateIndex--;

        // this.renderScene();
    }

    redo() {
        if (
            this.currentStateIndex < 0 ||
            this.currentStateIndex >= this.savedStates.length
        )
            return;

        const step = this.savedStates[this.currentStateIndex];

        if (clientSettings.DEBUG) console.log("redo:", step);

        // revert changes based on step type
        switch (step.type) {
            case "select": {
                if (step.data.mesh) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(
                        this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                    );
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "deselect": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    this.spaceBuilder.gizmoHandler.detachGizmoFromMesh(mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                }
                break;
            }
            case "add": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.addMeshToScene(mesh);
                    this.spaceBuilder.currentObjects.push(mesh);
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                }
                break;
            }
            case "delete": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (mesh) {
                        this.spaceBuilder.objectHighlightHandler.hideObjectOutline(mesh);
                        this.spaceBuilder.removeFromScene(mesh);
                        this.spaceBuilder.currentObjects.splice(
                            this.spaceBuilder.currentObjects.indexOf(mesh),
                            1
                        );
                    }
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.gizmoHandler.detachMeshFromGizmo();
                } else if (step.data.meshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    for (const child of meshes) {
                        this.spaceBuilder.removeFromScene(child);
                        this.spaceBuilder.currentObjects.splice(
                            this.spaceBuilder.currentObjects.indexOf(child),
                            1
                        );
                    }
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.gizmoHandler.detachMeshFromGizmo();
                }
                break;
            }
            case "move":
            case "rotate":
            case "scale": {
                if (!step.data.new) break;
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh || typeof step.data.old !== "object") break;
                    const newTransforms = step.data.new as ObjectAbsoluteTransforms;
                    mesh.setAbsolutePosition(
                        Vector3.FromArray(newTransforms.absolutePosition)
                    );
                    mesh.rotation = Quaternion.FromArray(
                        newTransforms.absoluteRotationQuaternion
                    ).toEulerAngles();
                    mesh.scaling.copyFrom(
                        Vector3.FromArray(newTransforms.absoluteScaling)
                    );
                    this.spaceBuilder.updateObjectTransformUI(mesh);
                } else if (step.data.meshes) {
                    if (typeof step.data.old !== "object") break;
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    const newTransforms = step.data.new as Record<
                        string,
                        ObjectAbsoluteTransforms
                    >;
                    for (const child of meshes) {
                        child.setAbsolutePosition(
                            Vector3.FromArray(newTransforms[child.uniqueId].absolutePosition)
                        );
                        child.rotation = Quaternion.FromArray(
                            newTransforms[child.uniqueId].absoluteRotationQuaternion
                        ).toEulerAngles();
                        child.scaling.copyFrom(
                            Vector3.FromArray(newTransforms[child.uniqueId].absoluteScaling)
                        );
                    }
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "lock": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.objectSelectHandler.toggleObjectLock(
                        mesh,
                        true,
                        false
                    );
                } else if (step.data.meshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(
                        meshes,
                        true,
                        false
                    );
                }
                break;
            }
            case "unlock": {
                if (step.data.mesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    if (!mesh) break;
                    this.spaceBuilder.objectSelectHandler.toggleObjectLock(
                        mesh,
                        false,
                        true
                    );
                } else if (step.data.meshes) {
                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(
                        meshes,
                        false,
                        true
                    );
                }
                break;
            }
            case "duplicate": {
                if (step.data.mesh && step.data.priorSelectedMesh) {
                    const mesh = this.scene.getMeshByUniqueId(step.data.mesh);
                    const priorSelectedMesh = this.scene.getMeshByUniqueId(
                        step.data.priorSelectedMesh
                    );
                    if (!mesh || !priorSelectedMesh) break;
                    //   if (step.data.mesh === this.userSpawnPlane) break;
                    if (this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh) {
                        this.spaceBuilder.objectHighlightHandler.hideObjectOutline(
                            priorSelectedMesh
                        );
                    }
                    this.spaceBuilder.addMeshToScene(mesh);
                    this.spaceBuilder.currentObjects.push(mesh);
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                } else if (step.data.meshes && step.data.priorSelectedMeshes) {
                    const priorSelectedMeshes = step.data.priorSelectedMeshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    for (const mesh of priorSelectedMeshes) {
                        // eslint-disable-next-line unicorn/no-null
                        mesh.setParent(null);
                    }

                    const meshes = step.data.meshes.map((id) =>
                        this.scene.getMeshByUniqueId(id)
                    ) as Array<AbstractMesh>;
                    for (const child of meshes) {
                        this.spaceBuilder.addMeshToScene(child);
                        this.spaceBuilder.currentObjects.push(child);
                        child.setParent(
                            this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                        );
                    }
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                break;
            }
            case "changeSkybox": {
                this.spaceBuilder.changeHDRSkybox(step.data.new as string, true);
                break;
            }
        }

        this.currentStateIndex++;

        // this.renderScene();
    }

    private _initKeyboardHandler() {
        // keyboard events
        return this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN: {
                    switch (kbInfo.event.code) {
                        case "KeyZ": {
                            if (
                                (this.spaceBuilder.keyboardHandler.keyDown.control ||
                                    this.spaceBuilder.keyboardHandler.keyDown.meta) &&
                                this.spaceBuilder.keyboardHandler.keyDown.shift
                            ) {
                                this.redo();
                            } else if (
                                this.spaceBuilder.keyboardHandler.keyDown.control ||
                                this.spaceBuilder.keyboardHandler.keyDown.meta
                            ) {
                                this.undo();
                            }
                            break;
                        }
                        case "KeyY": {
                            if (
                                this.spaceBuilder.keyboardHandler.keyDown.control ||
                                this.spaceBuilder.keyboardHandler.keyDown.meta
                            ) {
                                this.redo();
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
        this.keyboardObservable.remove();
        this.savedStates = [];
        this.currentStateIndex = 0;
        this.lastStateIndex = -1;
        // this.onSaveStateObservable.clear();
        useStudioStore.getState().resetTotalChanges();
    }
}

export default SaveStateHandler;
