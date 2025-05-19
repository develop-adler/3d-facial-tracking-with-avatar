import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

class ObjectPlacementHandler {
    readonly spaceBuilder: SpaceBuilder;
    readonly scene: Scene;
    readonly camera: ArcRotateCamera;

    readonly placementObjectPlaceholder: Mesh;
    readonly ghostPreviewtMaterial: StandardMaterial;

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;
        this.scene = spaceBuilder.scene;
        this.camera = spaceBuilder.camera;

        this.placementObjectPlaceholder = this._createPlacementObjectPlaceholder();
        this.ghostPreviewtMaterial = this._createGhostPreviewMaterial();
        this.placementObjectPlaceholder.material = this.ghostPreviewtMaterial;
    }

    private _createPlacementObjectPlaceholder(): Mesh {
        const placeholder = CreateBox("ghostPreviewBox", { size: 1 }, this.scene);
        placeholder.isPickable = false;
        placeholder.renderingGroupId = 1;
        placeholder.setEnabled(false);
        return placeholder;
    }

    private _createGhostPreviewMaterial(): StandardMaterial {
        // ghostMaterial (shared or per-instance)
        const ghostMaterial = new StandardMaterial("ghostPreviewMat", this.scene);
        ghostMaterial.alpha = 0.4;
        ghostMaterial.diffuseColor = new Color3(0.7, 0.9, 1); // soft bluish
        ghostMaterial.emissiveColor = new Color3(0.2, 0.3, 0.5);
        ghostMaterial.backFaceCulling = false;
        ghostMaterial.roughness = 1;
        ghostMaterial.disableLighting = true;
        return ghostMaterial;
    }

    dispose(): void {
        this.placementObjectPlaceholder.dispose(false, true);
        this.ghostPreviewtMaterial.dispose();
    }
}

export default ObjectPlacementHandler;
