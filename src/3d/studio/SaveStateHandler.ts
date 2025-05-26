import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { v4 } from "uuid";


import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import type { StudioSavedStates, StudioSavedStateType } from "@/models/studio";
import { useStudioStore } from "@/stores/useStudioStore";

import { clientSettings } from "clientSettings";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

class SaveStateHandler {
    readonly spaceBuilder: SpaceBuilder;

    savedStates: StudioSavedStates = [];
    currentStateIndex: number = 0;
    lastStateIndex: number = -1;

    static readonly MAX_UNDO_REDO_COUNT = 50;

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;
    }
    get scene(): Scene {
        return this.spaceBuilder.scene;
    }

    /** Save state for undo/redo */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveState(type: StudioSavedStateType, data: any) {
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

        if (
            Object.hasOwn(data, "mesh") &&
            data.mesh instanceof TransformNode &&
            data.mesh.metadata?.subType
        ) {
            this.savedStates[this.currentStateIndex].name =
                data.mesh.metadata.subType;
        } else if (Object.hasOwn(data, "meshes")) {
            this.savedStates[this.currentStateIndex].name = "group";
        } else if (data.name) {
            this.savedStates[this.currentStateIndex].name = data.name;
        }

        useStudioStore.getState().saveStateAndIncrementChange(this.savedStates, this.currentStateIndex);

        // truncate all after current index
        if (this.currentStateIndex < this.savedStates.length - 1) {
            this.savedStates.splice(this.currentStateIndex + 1);
        }

        if (this.savedStates.length < SaveStateHandler.MAX_UNDO_REDO_COUNT) {
            this.lastStateIndex = this.currentStateIndex++;
        }

        switch (type) {
            case "select": {
                useStudioStore.getState().setSelectedObject(data.mesh);
                break;
            }
            case "deselect": {
                useStudioStore.getState().setSelectedObject();
                break;
            }
            case "delete": {
                useStudioStore.getState().setSelectedObject();
                break;
            }
        }

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
                    this.spaceBuilder.gizmoHandler.detachGizmoFromMesh(step.data.mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(step.data.meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren());
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }

                // check the previous step to this and if it's 'select' type, select the mesh
                const lastLastStep = lastStep - 1;
                if (lastLastStep >= 0 && lastLastStep < this.savedStates.length) {
                    const stepPrior = this.savedStates[lastStep - 1];
                    if (stepPrior.type === "select") {
                        if (stepPrior.data.mesh) {
                            this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                            this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(stepPrior.data.mesh);
                        } else if (stepPrior.data.meshes) {
                            this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                            this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(stepPrior.data.meshes);
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
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(step.data.mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(step.data.meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren());
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "add": {
                if (step.data.mesh) {
                    this.spaceBuilder.objectHighlightHandler.hideObjectOutline(step.data.mesh);
                    this.spaceBuilder.removeFromScene(step.data.mesh);
                    this.spaceBuilder.currentObjects.splice(
                        this.spaceBuilder.currentObjects.indexOf(step.data.mesh),
                        1
                    );
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.gizmoHandler.detachMeshFromGizmo();
                }
                break;
            }
            case "delete": {
                if (step.data.mesh) {
                    this.spaceBuilder.addMeshToScene(step.data.mesh);
                    this.spaceBuilder.currentObjects.push(step.data.mesh);
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(step.data.mesh);
                } else if (step.data.meshes) {
                    for (const mesh of (step.data.meshes as Array<AbstractMesh>)) {
                        this.spaceBuilder.addMeshToScene(mesh);
                        this.spaceBuilder.currentObjects.push(mesh);
                        mesh.setParent(this.spaceBuilder.objectSelectHandler.selectedMeshGroup);
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
                    const mesh = step.data.mesh;
                    mesh.setAbsolutePosition(
                        Vector3.FromArray(step.data.old.absolutePosition)
                    );
                    mesh.rotation = Quaternion.FromArray(
                        step.data.old.absoluteRotationQuaternion
                    ).toEulerAngles();
                    mesh.scaling.copyFrom(
                        Vector3.FromArray(step.data.old.absoluteScaling)
                    );

                    this.spaceBuilder.updateObjectTransformUI(mesh);
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(mesh);
                } else if (step.data.meshes) {
                    for (const mesh of (step.data.meshes as Array<AbstractMesh>)) {
                        mesh.setAbsolutePosition(
                            Vector3.FromArray(step.data.old[mesh.uniqueId].absolutePosition)
                        );
                        mesh.rotation = Quaternion.FromArray(
                            step.data.old[mesh.uniqueId].absoluteRotationQuaternion
                        ).toEulerAngles();
                        mesh.scaling.copyFrom(
                            Vector3.FromArray(step.data.old[mesh.uniqueId].absoluteScaling)
                        );
                    }
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(step.data.meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren());
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "lock": {
                if (step.data.mesh) this.spaceBuilder.objectSelectHandler.toggleObjectLock(step.data.mesh, false, true);
                else if (step.data.meshes)
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(step.data.meshes, false, true);
                break;
            }
            case "unlock": {
                if (step.data.mesh) this.spaceBuilder.objectSelectHandler.toggleObjectLock(step.data.mesh, true, false);
                else if (step.data.meshes)
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(step.data.meshes, true, false);
                break;
            }
            case "duplicate": {
                if (step.data.mesh) {
                    //   if (step.data.mesh === this.userSpawnPlane) break;
                    this.spaceBuilder.objectHighlightHandler.hideObjectOutline(step.data.mesh);
                    this.spaceBuilder.removeFromScene(step.data.mesh);
                    this.spaceBuilder.currentObjects.splice(
                        this.spaceBuilder.currentObjects.indexOf(step.data.mesh),
                        1
                    );
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(step.data.priorSelectedMesh);
                } else if (step.data.meshes) {
                    for (const child of (step.data.meshes as Array<AbstractMesh>)) {
                        this.spaceBuilder.removeFromScene(child);
                        this.spaceBuilder.currentObjects.splice(this.spaceBuilder.currentObjects.indexOf(child), 1);
                    }
                    for (const mesh of (step.data.priorSelectedMeshes as Array<AbstractMesh>)) {
                        mesh.setParent(this.spaceBuilder.objectSelectHandler.selectedMeshGroup);
                    }

                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                break;
            }
            case "changeSkybox": {
                this.spaceBuilder.changeHDRSkybox(step.data.old, true);
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
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(step.data.mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.objectSelectHandler.setSelectedGroupObjects(step.data.meshes);
                    this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren());
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "deselect": {
                if (step.data.mesh) {
                    this.spaceBuilder.gizmoHandler.detachGizmoFromMesh(step.data.mesh);
                } else if (step.data.meshes) {
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                }
                break;
            }
            case "add": {
                if (step.data.mesh) {
                    this.spaceBuilder.addMeshToScene(step.data.mesh);
                    this.spaceBuilder.currentObjects.push(step.data.mesh);
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(step.data.mesh);
                }
                break;
            }
            case "delete": {
                if (step.data.mesh) {
                    this.spaceBuilder.objectHighlightHandler.hideObjectOutline(step.data.mesh);
                    this.spaceBuilder.removeFromScene(step.data.mesh);
                    this.spaceBuilder.currentObjects.splice(
                        this.spaceBuilder.currentObjects.indexOf(step.data.mesh),
                        1
                    );
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.gizmoHandler.detachMeshFromGizmo();
                } else if (step.data.meshes) {
                    for (const child of (step.data.meshes as Array<AbstractMesh>)) {
                        this.spaceBuilder.removeFromScene(child);
                        this.spaceBuilder.currentObjects.splice(this.spaceBuilder.currentObjects.indexOf(child), 1);
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
                    const mesh = step.data.mesh;
                    mesh.setAbsolutePosition(
                        Vector3.FromArray(step.data.new.absolutePosition)
                    );
                    mesh.rotation = Quaternion.FromArray(
                        step.data.new.absoluteRotationQuaternion
                    ).toEulerAngles();
                    mesh.scaling.copyFrom(
                        Vector3.FromArray(step.data.new.absoluteScaling)
                    );
                    this.spaceBuilder.updateObjectTransformUI(mesh);
                } else if (step.data.meshes) {
                    for (const child of (step.data.meshes as Array<AbstractMesh>)) {
                        child.setAbsolutePosition(
                            Vector3.FromArray(step.data.new[child.uniqueId].absolutePosition)
                        );
                        child.rotation = Quaternion.FromArray(
                            step.data.new[child.uniqueId].absoluteRotationQuaternion
                        ).toEulerAngles();
                        child.scaling.copyFrom(
                            Vector3.FromArray(step.data.new[child.uniqueId].absoluteScaling)
                        );
                    }
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                break;
            }
            case "lock": {
                if (step.data.mesh) this.spaceBuilder.objectSelectHandler.toggleObjectLock(step.data.mesh, true, false);
                else if (step.data.meshes)
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(step.data.meshes, true, false);
                break;
            }
            case "unlock": {
                if (step.data.mesh) this.spaceBuilder.objectSelectHandler.toggleObjectLock(step.data.mesh, false, true);
                else if (step.data.meshes)
                    this.spaceBuilder.objectSelectHandler.toggleMultiObjectsLock(step.data.meshes, false, true);
                break;
            }
            case "duplicate": {
                if (step.data.mesh) {
                    //   if (step.data.mesh === this.userSpawnPlane) break;
                    if (this.spaceBuilder.gizmoHandler.gizmoManager.attachedMesh) {
                        this.spaceBuilder.objectHighlightHandler.hideObjectOutline(step.data.priorSelectedMesh);
                    }
                    this.spaceBuilder.addMeshToScene(step.data.mesh);
                    this.spaceBuilder.currentObjects.push(step.data.mesh);
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.gizmoManager.attachToMesh(step.data.mesh);
                } else if (step.data.meshes) {
                    for (const mesh of (step.data.priorSelectedMeshes as Array<AbstractMesh>)) {
                        // eslint-disable-next-line unicorn/no-null
                        mesh.setParent(null);
                    }

                    for (const child of (step.data.meshes as Array<AbstractMesh>)) {
                        this.spaceBuilder.addMeshToScene(child);
                        this.spaceBuilder.currentObjects.push(child);
                        child.setParent(this.spaceBuilder.objectSelectHandler.selectedMeshGroup);
                    }
                    this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                    this.spaceBuilder.objectSelectHandler.unselectAllObjects();
                    this.spaceBuilder.gizmoHandler.attachGizmoToGroupNode();
                }
                this.spaceBuilder.objectSelectHandler.setGPUPickerPickList();
                break;
            }
            case "changeSkybox": {
                this.spaceBuilder.changeHDRSkybox(step.data.new, true);
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
                                (this.spaceBuilder.keyboardHandler.keyDown.control || this.spaceBuilder.keyboardHandler.keyDown.meta) &&
                                this.spaceBuilder.keyboardHandler.keyDown.shift
                            ) {
                                this.redo();
                            } else if (this.spaceBuilder.keyboardHandler.keyDown.control || this.spaceBuilder.keyboardHandler.keyDown.meta) {
                                this.undo();
                            }
                            break;
                        }
                        case "KeyY": {
                            if (this.spaceBuilder.keyboardHandler.keyDown.control || this.spaceBuilder.keyboardHandler.keyDown.meta) {
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
        this.savedStates = [];
        this.currentStateIndex = 0;
        this.lastStateIndex = -1;
        // this.onSaveStateObservable.clear();
        useStudioStore.getState().resetTotalChanges();
    }

}

export default SaveStateHandler;