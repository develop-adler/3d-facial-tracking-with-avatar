import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import type Avatar from "@/3d/avatar/Avatar";

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

class AvatarVoiceBubble {
    readonly avatar: Avatar;
    readonly scene: Scene;
    readonly rootNode: TransformNode;
    readonly bubble: Mesh;

    constructor(avatar: Avatar) {
        this.avatar = avatar;
        this.scene = avatar.scene;

        this.rootNode = new TransformNode(
            "voiceBubbleTNode_" + this.avatar.participant.sid,
            this.scene
        );
        this.rootNode.billboardMode = 7
        this.rootNode.position.y = this.avatar.height * 1.155;
        this.rootNode.parent = this.avatar.root;
        this.bubble = this._createBubble();
    }

    private _createBubble(): Mesh {
        const mesh = CreateDisc(
            `avatarVoiceBubble_${this.avatar.participant.sid}`,
            {
                radius: 0.07,
                tessellation: 32,
            },
            this.scene
        );

        mesh.receiveShadows = false;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;

        const material = new StandardMaterial(
            `avatarVoiceBubbleMaterial_${this.avatar.participant.sid}`,
            this.scene
        );
        const bubbleTexture = new Texture('/static/avatar/micVoiceBubble.ktx2', this.scene);
        material.diffuseTexture = bubbleTexture;
        material.disableLighting = true;
        material.emissiveColor = Color3.White();
        material.freeze();
        // material.backFaceCulling = false;
        mesh.material = material;

        mesh.parent = this.rootNode;

        // hide by default
        mesh.setEnabled(false);

        return mesh;
    }

    setVisible(visible: boolean): void {
        this.bubble.setEnabled(visible);
    }

    dispose(): void {
        this.bubble.dispose();
        this.rootNode.dispose();
    }
}

export default AvatarVoiceBubble;
