// import { HtmlMesh } from "@babylonjs/addons/htmlMesh"; // Replaced by CSS3DObject
import {
  CSS3DObject,
  CSS3DRenderer,
} from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { Group, type Scene } from "three";
import type { Participant } from "livekit-client";
import type Avatar from "@/3dthree/avatar/Avatar";
import eventBus from "@/eventBus";
import { isMobile } from "@/utils/browserUtils";

// NOTE: You must set up a CSS3DRenderer in your main application file.
// It should be placed over the main WebGL canvas and its render() method
// called in your main animation loop, like this:
//
// const cssRenderer = new CSS3DRenderer();
// cssRenderer.setSize(window.innerWidth, window.innerHeight);
// document.body.appendChild(cssRenderer.domElement);
//
// function animate() {
//   ...
//   webglRenderer.render(scene, camera);
//   cssRenderer.render(scene, camera);
// }

const PROFILE_CARD_SIZE = {
  pc: { width: 320, height: 218 }, // Size in pixels
  mobile: { width: 480, height: 327 },
};

class AvatarProfileCard {
  readonly avatar: Avatar;
  readonly participant: Participant;
  readonly cssObject: CSS3DObject;
  readonly rootNode: Group; // A group to hold the CSS object for positioning
  htmlElement?: HTMLElement;
  isDisplayed: boolean = false;
  tooCloseToCamera: boolean = false;
  windowEventListenerCallback?: (forUser: Participant) => void;

  constructor(avatar: Avatar, participant: Participant) {
    this.avatar = avatar;
    this.participant = participant;

    this.rootNode = new Group();
    this.rootNode.name = "profileCardRoot_" + this.participant.identity;
    this.rootNode.position.y = this.avatar.height * 1.125;
    this.avatar.root.add(this.rootNode);

    this.htmlElement = this._getAndCloneElement();
    this.cssObject = new CSS3DObject(this.htmlElement);
    this._init();

    // ... (event listeners and update logic remain conceptually the same)
  }

  // This should be called in the main render loop
  update(): void {
    if (!this.isDisplayed) return;

    // Billboard effect
    this.rootNode.quaternion.copy(this.avatar.coreScene.camera.quaternion);

    // Hide if too close
    const distance = this.avatar.coreScene.camera.position.distanceTo(
      this.rootNode.getWorldPosition(new Vector3())
    );
    if (distance < 1) {
      this.hide(true);
    }
  }

  private _init(): void {
    this.rootNode.add(this.cssObject);
    // CSS3DObject scale is tricky. 1px = 1 three.js unit. We need to scale it down.
    const scale = 0.002; // Adjust this value to get the desired size
    this.cssObject.scale.set(scale, scale, scale);
    this.cssObject.visible = false;
  }

  private _getAndCloneElement(): HTMLElement {
    const div = document.querySelector(`#multiplay_profile_${this.participant.identity}`);
    if (!div) {
      eventBus.emitWithEvent("multiplayer:avatarProfileCardSync", this.participant);
      // Return a placeholder
      const placeholder = document.createElement("div");
      placeholder.innerText = "Loading...";
      return placeholder;
    }
    const clonedElem = div.cloneNode(true) as HTMLElement;
    clonedElem.id = `multiplay_profile_${this.participant.identity}_clone`;
    // ... (add event listeners to cloned element as before)
    return clonedElem;
  }

  show(): void {
    if (this.isDisplayed) return;
    this.cssObject.visible = true;
    this.avatar.profile?.username?.visible = false;
    this.isDisplayed = true;
  }

  hide(isStillDisplay: boolean = false): void {
    if (!this.isDisplayed) return;
    this.cssObject.visible = false;
    this.avatar.profile?.username?.visible = true;
    if (!isStillDisplay) this.isDisplayed = false;
  }

  dispose(): void {
    // ... (remove event listeners)
    this.htmlElement?.remove();
    this.rootNode.removeFromParent();
  }
}

export default AvatarProfileCard;
