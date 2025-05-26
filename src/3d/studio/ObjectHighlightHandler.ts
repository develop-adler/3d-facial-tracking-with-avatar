
import "@babylonjs/core/Layers/effectLayerSceneComponent"; // for HighlightLayer
import "@babylonjs/core/Shaders/pass.fragment"; // for HighlightLayer
import "@babylonjs/core/Shaders/glowBlurPostProcess.fragment"; // for HighlightLayer

import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { Color3 } from "@babylonjs/core/Maths/math.color";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

class ObjectHighlightHandler {
    readonly spaceBuilder: SpaceBuilder;
    readonly highlightLayer: HighlightLayer;

    static readonly SELECT_LOCKED_COLOR = new Color3(1, 0.4, 0);
    static readonly SELECT_UNLOCKED_COLOR = Color3.Green();

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;

        this.highlightLayer = this._createHighlightLayer(this.camera);
    }

    get scene(): Scene {
        return this.spaceBuilder.scene;
    }
    get camera(): ArcRotateCamera {
        return this.spaceBuilder.camera;
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

    showObjectOutline(
        mesh: AbstractMesh | Mesh | null,
        color: Color3 = ObjectHighlightHandler.SELECT_UNLOCKED_COLOR
    ): void {
        if (!mesh) return;

        const children = mesh.getChildMeshes();
        if (children.length > 0) {
            for (const child of children) {
                if (child.getClassName() === "Mesh") {
                    this.highlightLayer.removeExcludedMesh(child as Mesh);
                    this.highlightLayer.addMesh(child as Mesh, color);
                }
            }
        } else {
            this.highlightLayer.removeExcludedMesh(mesh as Mesh);
            this.highlightLayer.addMesh(mesh as Mesh, color);
        }

        // add all other objects to excluded list to prevent being
        // highlighted when object is in front of another bigger object
        for (const obj of this.spaceBuilder.currentObjects) {
            if (obj !== mesh) {
                const children = obj.getChildMeshes();
                if (children.length > 0) {
                    for (const child of children) {
                        if (child.getClassName() === "Mesh") {
                            this.highlightLayer.addExcludedMesh(child as Mesh);
                        }
                    }
                } else {
                    this.highlightLayer.addExcludedMesh(obj as Mesh);
                }
            }
        }
    }

    showObjectOutlineForGroup(
        meshes: Array<AbstractMesh | Mesh>
    ): void {
        for (const mesh of meshes) {
            const children = mesh.getChildMeshes();
            if (children.length > 0) {
                for (const child of children) {
                    this.highlightLayer.removeExcludedMesh(child as Mesh);
                    if (this.spaceBuilder.lockedObjects.includes(mesh.uniqueId)) {
                        this.highlightLayer.addMesh(
                            child as Mesh,
                            ObjectHighlightHandler.SELECT_LOCKED_COLOR
                        );
                    } else {
                        this.highlightLayer.addMesh(
                            child as Mesh,
                            ObjectHighlightHandler.SELECT_UNLOCKED_COLOR
                        );
                    }
                }
            } else {
                this.highlightLayer.removeExcludedMesh(mesh as Mesh);
                if (this.spaceBuilder.lockedObjects.includes(mesh.uniqueId)) {
                    this.highlightLayer.addMesh(
                        mesh as Mesh,
                        ObjectHighlightHandler.SELECT_LOCKED_COLOR
                    );
                } else {
                    this.highlightLayer.addMesh(
                        mesh as Mesh,
                        ObjectHighlightHandler.SELECT_UNLOCKED_COLOR
                    );
                }
            }
        }

        // add all other objects to excluded list to prevent being
        // highlighted when object is in front of another bigger object
        for (const obj of this.spaceBuilder.currentObjects.filter(
            (obj) => !meshes.includes(obj)
        )) {
            const children = obj.getChildMeshes();
            if (children.length > 0) {
                for (const child of children) {
                    this.highlightLayer.addExcludedMesh(child as Mesh);
                }
            } else {
                this.highlightLayer.addExcludedMesh(obj as Mesh);
            }
        }
    }

    hideGroupObjectOutline(
        meshes: Array<AbstractMesh | Mesh>
    ): void {
        for (const mesh of meshes) {
            const children = mesh.getChildMeshes();
            if (children.length > 0) {
                for (const child of children) {
                    this.highlightLayer.removeMesh(child as Mesh);
                }
            } else {
                this.highlightLayer.removeMesh(mesh as Mesh);
            }
        }
    }

    hideObjectOutline(mesh: AbstractMesh | Mesh | null): void {
        if (!mesh) return;

        const children = mesh.getChildMeshes();
        if (children.length > 0) {
            for (const child of children) {
                this.highlightLayer.removeMesh(child as Mesh);
            }
        } else {
            this.highlightLayer.removeMesh(mesh as Mesh);
        }
    }

    dispose(): void {
        this.highlightLayer.dispose();
    }
}

export default ObjectHighlightHandler;
