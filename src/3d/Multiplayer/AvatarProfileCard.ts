import { HtmlMesh } from "@babylonjs/addons/htmlMesh";
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Participant } from 'livekit-client';

import type Avatar from '@/3d/Multiplayer/Avatar';
import eventBus from '@/eventBus';
import { isMobile } from '@/utils/browserUtils';

import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';

const PROFILE_CARD_SIZE = {
    pc: { width: 0.64, height: 0.436 }, // 100%
    mobile: { width: 0.96, height: 0.654 }, // 150%
};

class AvatarProfileCard {
    readonly avatar: Avatar;
    readonly participant: Participant;
    readonly htmlMesh: typeof HtmlMesh;
    htmlElement: Nullable<HTMLElement> = null;
    readonly sceneRenderObserver: Observer<Scene>;
    isDisplayed: boolean = false;
    tooCloseToCamera: boolean = false;
    windowEventListenerCallback?: (forUser: Participant) => void;

    constructor(avatar: Avatar, participant: Participant) {
        this.avatar = avatar;
        this.participant = participant;
        this.htmlMesh = this._init();

        // hide the profile card when the mesh is too close to camera
        this.sceneRenderObserver = avatar.scene.onBeforeRenderObservable.add(scene => {
            if (!scene.activeCamera || !this.isDisplayed) return;

            const distance = scene.activeCamera.globalPosition
                .subtract(this.htmlMesh.absolutePosition)
                .length();

            if (distance < 1) {
                this.hide(true);
                this.tooCloseToCamera = true;
            } else {
                this.show(false);
                this.tooCloseToCamera = false;
            }
        });

        // update the profile card on 3D side when the participant's profile is updated on 2D side
        this.windowEventListenerCallback = (forUser: Participant) => {
            if (forUser.sid === this.participant.sid) {
                // set timeout to wait for icon images to properly load
                setTimeout(() => {
                    this.htmlElement?.remove();
                    this.htmlElement = this.attachToElement();
                }, 100);
            }
        };
        eventBus.onWithEvent('multiplayer:avatarProfileCardUpdate', this.windowEventListenerCallback);
    }
    private _init(): typeof HtmlMesh {
        const htmlMesh = new HtmlMesh(this.avatar.scene, 'htmlMesh_' + this.participant.sid, {
            isCanvasOverlay: true,
        });
        htmlMesh.billboardMode = 7;
        htmlMesh.position.y = this.avatar.height * 1.125;
        htmlMesh.parent = this.avatar.root;
        htmlMesh.setEnabled(false);

        // hide the black mesh with material due to having scene environment map
        const material = new StandardMaterial('htmlMeshMaterial_' + this.participant.sid, this.avatar.scene);
        material.alpha = 0;
        htmlMesh.material = material;

        return htmlMesh;
    }
    attachToElement(display: boolean = true): Nullable<HTMLElement> {
        // retrieve the React component and set HTML content of html mesh
        const div = document.getElementById(`multiplay_profile_${this.participant.sid}`);
        let clonedElem: Nullable<HTMLElement> = null;

        if (!div) {
            eventBus.emitWithEvent('multiplayer:avatarProfileCardSync', this.participant);
            return null;
        }

        // clone the React component to prevent React from crashing when
        // removing or doing anything with it from Javascript side
        clonedElem = div.cloneNode(true) as HTMLElement;
        clonedElem.id = `multiplay_profile_${this.participant.sid}_clone`;
        clonedElem.style.display = display ? 'flex' : 'none';
        clonedElem.style.userSelect = 'none';

        // go through child elems and check if there's any that matches the class name
        // if so, add onclick event listener to it (because cloning elems removes event listeners for some reason...)
        // NOTE: this is a janky solution, need to find a better way to do this in the future...
        let followIcon, unfollowText, dmIcon, closeIcon;
        for (const child of clonedElem.getElementsByTagName('*')) {
            if (child.className.startsWith('multiplay_profile_follow_icon')) {
                followIcon = child;
            } else if (child.className.startsWith('multiplay_profile_unfollow_text')) {
                unfollowText = child;
            } else if (child.className.startsWith('multiplay_profile_dm_icon')) {
                dmIcon = child;
            } else if (child.className.startsWith('multiplay_profile_close_icon')) {
                closeIcon = child;
            }
        }

        if ((!followIcon && !unfollowText) || !dmIcon || !closeIcon) return null;

        // add onclick event listener, use observer to trigger update on 2D side
        followIcon?.addEventListener('click', () => {
            eventBus.emitWithEvent('multiplayer:avatarProfileCardFollowClicked', this.participant);
        });
        unfollowText?.addEventListener('click', () => {
            eventBus.emitWithEvent('multiplayer:avatarProfileCardUnFollowClicked', this.participant);
        });
        dmIcon?.addEventListener('click', () => {
            eventBus.emitWithEvent('multiplayer:avatarProfileCardDMClicked', this.participant);
            this.hide();
        });
        closeIcon?.addEventListener('click', () => {
            this.hide();
        });

        let size = PROFILE_CARD_SIZE.pc;
        if (isMobile()) size = PROFILE_CARD_SIZE.mobile;
        this.htmlMesh.setContent(clonedElem, size.width, size.height);

        return clonedElem;
    }
    show(attachElement: boolean = true, force: boolean = true): void {
        if (this.isDisplayed && !force) return;

        if (attachElement) {
            this.htmlElement?.remove();
            this.htmlElement = this.attachToElement();
            eventBus.emitWithEvent('multiplayer:avatarProfileCardShow', this.participant);
        }
        this.htmlMesh.setEnabled(true);
        this.avatar.profile?.username?.setEnabled(false);
        this.isDisplayed = true;
    }
    hide(isStillDisplay: boolean = false): void {
        if (!this.isDisplayed) return;

        this.htmlMesh.setEnabled(false);
        this.avatar.profile?.username?.setEnabled(true);
        if (!isStillDisplay) this.isDisplayed = false;
    }
    dispose(): void {
        if (this.windowEventListenerCallback) {
            eventBus.offWithEvent(
                'multiplayer:avatarProfileCardUpdate',
                this.windowEventListenerCallback
            );
        }
        this.sceneRenderObserver.remove();
        this.htmlElement?.remove();
        this.htmlElement = null;
        this.htmlMesh.material?.dispose();
        this.htmlMesh.dispose();
    }
}

export default AvatarProfileCard;
