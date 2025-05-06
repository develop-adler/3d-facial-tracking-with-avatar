import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';

import type Avatar from '@/3d/Multiplayer/Avatar';
import type { AvatarInteractionType } from '@/apis/entities';
// import { useGlobalModalStoreImmediate } from '@/stores/useGlobalModalStore';

import { clientSettings } from 'clientSettings';

import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Nullable } from '@babylonjs/core/types';

class AvatarInteraction {
    avatar: Avatar;
    name: string;
    type: AvatarInteractionType;

    // for consensual multi-user interactions
    waitingForOther: boolean = false;
    otherUserDetectionMesh: Nullable<Mesh> = null;

    continuousPhase: Nullable<0 | 1 | 2> = null;
    toIdleAnimation: Nullable<AnimationGroup> = null;

    private _storedAnimToResume: Nullable<AnimationGroup> = null;

    constructor(avatar: Avatar, name: string, type: AvatarInteractionType) {
        this.avatar = avatar;
        this.name = name;
        this.type = type;
    }

    play(onAnimationEndCallback?: () => void): void {
        let hasAnim = false;
        switch (this.type) {
            case 'multi':
                for (const [key, value] of Object.entries(this.avatar.animations)) {
                    if (key.toLowerCase().includes(this.name.toLowerCase())) {
                        // value.onAnimationGroupEndObservable.addOnce(() => {
                        //     if (this._storedAnimToResume) {
                        //         this.avatar.playAnimation(this._storedAnimToResume.name, true);
                        //         this._storedAnimToResume = null;
                        //     }
                        //     onAnimationEndCallback?.();
                        // });

                        this._storedAnimToResume = this.avatar.playingAnimation;
                        this.avatar.playAnimation(value.name, true);

                        // Creates an box that protrudes forward from
                        // the avatar's position to detect the other avatar's presence
                        this.otherUserDetectionMesh = CreateBox(
                            'avatarInteractionBox',
                            {
                                width: 0.8,
                                height: 0.1,
                                depth: 1.2,
                            },
                            this.avatar.scene
                        );

                        this.otherUserDetectionMesh.position.y += 0.05;
                        this.otherUserDetectionMesh.position.z += 0.7;
                        this.otherUserDetectionMesh.parent = this.avatar.root;

                        this.otherUserDetectionMesh.freezeWorldMatrix();
                        this.otherUserDetectionMesh.doNotSyncBoundingInfo = true;

                        hasAnim = true;
                        break;
                    }
                }
                break;
            case 'continuous': {
                for (const [key] of Object.entries(this.avatar.animations)) {
                    if (key.toLowerCase().includes(this.name.toLowerCase())) {
                        // 3-phase animation with a loop in the middle

                        // gender with first character capitalized
                        const gender = this.avatar.gender.charAt(0).toUpperCase() + this.avatar.gender.slice(1);
                        const nameWithoutGender = this.name.replace(gender, '');

                        const idleToLoop = this.avatar.animations[`${gender}IdleTo${nameWithoutGender}`];
                        const loop = this.avatar.animations[`${gender}${nameWithoutGender}Loop`];
                        const loopToEnd = this.avatar.animations[`${gender}${nameWithoutGender}ToIdle`];

                        // check if all animations exist
                        if (!idleToLoop || !loop || !loopToEnd) break;

                        this._storedAnimToResume = this.avatar.playingAnimation;
                        this.toIdleAnimation = loopToEnd;

                        // play idle to loop first, play loop when idle to loop ends
                        idleToLoop.onAnimationGroupEndObservable.addOnce(() => {
                            loop.onAnimationGroupEndObservable.addOnce(() => {
                                if (this.avatar.capsuleBody) {
                                    this.avatar.capsuleBody.disableSync = false;
                                }
                                if (this._storedAnimToResume) {
                                    this.avatar.playAnimation(this._storedAnimToResume.name, true);
                                    this._storedAnimToResume = null;
                                }
                            });
                            // loop.onAnimationGroupPlayObservable.addOnce(() => {
                            //     useGlobalModalStoreImmediate.getState().setOpenAvatarInteractionModal(true, 'stop');
                            // });
                            if (this.avatar.capsuleBody) {
                                this.avatar.capsuleBody.disableSync = true;
                            }
                            this.avatar.playAnimation(loop.name, true);
                            this.continuousPhase = 1;
                        });
                        this.avatar.playAnimation(idleToLoop.name, false);
                        this.continuousPhase = 0;

                        hasAnim = true;
                        break;
                    }
                }
                break;
            }
            default:
                for (const [key, value] of Object.entries(this.avatar.animations)) {
                    if (key.toLowerCase().includes(this.name.toLowerCase())) {
                        value.onAnimationGroupEndObservable.addOnce(() => {
                            if (this._storedAnimToResume) {
                                this.avatar.playAnimation(this._storedAnimToResume.name, true);
                                this._storedAnimToResume = null;
                            }
                            onAnimationEndCallback?.();
                        });

                        this._storedAnimToResume = this.avatar.playingAnimation;
                        switch (this.type) {
                            case 'single':
                            case 'hitting':
                            case 'gethit':
                                this.avatar.playAnimation(value.name, false);
                                break;
                            case 'loop':
                                this.avatar.playAnimation(value.name, true);
                                break;
                        }

                        hasAnim = true;
                        break;
                    }
                }
                break;
        }

        if (!hasAnim) {
            if (clientSettings.DEBUG) console.warn(`No animation found for interaction ${this.name}`);
            onAnimationEndCallback?.();
        }
    }

    endContinuousInteraction(onAnimationEndCallback?: () => void): void {
        if (!this.continuousPhase || this.continuousPhase < 1) return;

        if (this.toIdleAnimation) {
            this.continuousPhase = null;
            this.toIdleAnimation.onAnimationGroupEndObservable.addOnce(() => {
                if (this._storedAnimToResume) {
                    this.avatar.playAnimation(this._storedAnimToResume.name, true);
                    this._storedAnimToResume = null;
                }
                onAnimationEndCallback?.();
            });
            this.avatar.playAnimation(this.toIdleAnimation, false);
        }
    }

    dispose(): void {
        Object.values(this.avatar.animations).forEach(anim => {
            anim.onAnimationGroupEndObservable.clear();
        });
        this.otherUserDetectionMesh?.dispose(false, true);
        this._storedAnimToResume = null;
        if (this.avatar.capsuleBody) {
            this.avatar.capsuleBody.disableSync = false;
        }
        this.avatar.setNotControlledByUser();
    }
}

export default AvatarInteraction;
