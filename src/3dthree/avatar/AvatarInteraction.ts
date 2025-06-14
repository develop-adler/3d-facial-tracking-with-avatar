import { type AnimationAction, type AnimationClip } from "three";
import type Avatar from "@/3dthree/avatar/Avatar";
import type { AvatarInteractionType } from "@/models/3d";
// import { clientSettings } from "clientSettings";

class AvatarInteraction {
  avatar: Avatar;
  name: string;
  type: AvatarInteractionType;

  continuousPhase?: 0 | 1 | 2;
  toIdleAnimation?: AnimationClip;

  private _storedAnimAction?: AnimationAction;

  constructor(avatar: Avatar, name: string, type: AvatarInteractionType) {
    this.avatar = avatar;
    this.name = name;
    this.type = type;
  }

  play(onAnimationEndCallback?: () => void): void {
    const mixer = this.avatar.animationMixer;
    if (!mixer) {
      onAnimationEndCallback?.();
      return;
    }

    this._storedAnimAction = this.avatar.playingAnimationAction;

    const onFinished = (event: any) => {
      // Ensure the finished event is for the action we started
      if (event.action === mixer.clipAction(animationClip)) {
        if (this._storedAnimAction) {
          this.avatar.playAnimation(this._storedAnimAction.getClip().name, true);
          this._storedAnimAction = undefined;
        }
        onAnimationEndCallback?.();
        mixer.removeEventListener("finished", onFinished);
      }
    };

    let animationClip: AnimationClip | undefined;

    switch (this.type) {
      case "continuous": {
        const gender = this.avatar.gender.charAt(0).toUpperCase() + this.avatar.gender.slice(1);
        const nameWithoutGender = this.name.replace(gender, "");

        const idleToLoopClip = this.avatar.animations[`IdleTo${nameWithoutGender}`];
        const loopClip = this.avatar.animations[`${nameWithoutGender}Loop`];
        const loopToEndClip = this.avatar.animations[`${nameWithoutGender}ToIdle`];

        if (!idleToLoopClip || !loopClip || !loopToEndClip) {
          console.warn(`Missing continuous animation parts for ${this.name}`);
          onAnimationEndCallback?.();
          return;
        }

        this.toIdleAnimation = loopToEndClip;

        const idleToAction = mixer.clipAction(idleToLoopClip);
        const loopAction = mixer.clipAction(loopClip);

        const onIdleToLoopFinished = () => {
          this.avatar.playAnimation(loopClip.name, true);
          this.continuousPhase = 1;
          mixer.removeEventListener("finished", onIdleToLoopFinished);
        };

        mixer.addEventListener("finished", onIdleToLoopFinished);
        this.avatar.playAnimation(idleToLoopClip.name, false);
        this.continuousPhase = 0;
        break;
      }
      default: {
        animationClip = this.avatar.animations[this.name];
        if (!animationClip) {
          console.warn(`No animation found for interaction ${this.name}`);
          onAnimationEndCallback?.();
          return;
        }

        const isLoop = this.type === "loop";
        if (!isLoop) {
          mixer.addEventListener("finished", onFinished);
        }
        this.avatar.playAnimation(animationClip.name, isLoop);
        break;
      }
    }
  }

  endContinuousInteraction(onAnimationEndCallback?: () => void): void {
    if (!this.toIdleAnimation || !this.continuousPhase || this.continuousPhase < 1) return;

    const mixer = this.avatar.animationMixer;
    if (!mixer) {
      onAnimationEndCallback?.();
      return;
    }

    const onFinished = () => {
      if (this._storedAnimAction) {
        this.avatar.playAnimation(this._storedAnimAction.getClip().name, true);
        this._storedAnimAction = undefined;
      }
      onAnimationEndCallback?.();
      mixer.removeEventListener("finished", onFinished);
    };

    mixer.addEventListener("finished", onFinished);
    this.avatar.playAnimation(this.toIdleAnimation.name, false);
    this.continuousPhase = undefined;
  }

  dispose(): void {
    this.avatar.animationMixer?.removeEventListener("finished", () => {}); // Clear all listeners
    this.avatar.setNotControlledByUser();
  }
}

export default AvatarInteraction;
