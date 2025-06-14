import {
  Group,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  type Scene,
} from "three";
import type Avatar from "@/3dthree/avatar/Avatar";

class AvatarVoiceBubble {
  readonly avatar: Avatar;
  readonly scene: Scene;
  readonly rootNode: Group;
  readonly bubble: Sprite; // Using a Sprite for automatic billboarding

  constructor(avatar: Avatar) {
    this.avatar = avatar;
    this.scene = avatar.scene;

    this.rootNode = new Group();
    this.rootNode.name = "voiceBubbleTNode_" + this.avatar.participant.identity;
    this.rootNode.position.y = this.avatar.height * 1.155;
    this.rootNode.parent = this.avatar.root;

    this.bubble = this._createBubble();
  }

  private _createBubble(): Sprite {
    const texture = new TextureLoader().load("/static/avatar/micVoiceBubble.png"); // Use PNG for transparency
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Render on top
    });

    const sprite = new Sprite(material);
    sprite.name = `avatarVoiceBubble_${this.avatar.participant.identity}`;
    sprite.scale.set(0.14, 0.14, 1); // Adjust scale as needed
    sprite.center.set(0.5, 0.5);

    this.rootNode.add(sprite);

    // Hide by default
    sprite.visible = false;

    return sprite;
  }

  setVisible(visible: boolean): void {
    this.bubble.visible = visible;
  }

  dispose(): void {
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    // The sprite's geometry is shared and doesn't need disposal.
    this.rootNode.removeFromParent();
  }
}

export default AvatarVoiceBubble;
