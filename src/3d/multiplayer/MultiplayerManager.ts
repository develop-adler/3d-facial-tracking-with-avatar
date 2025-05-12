import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    LocalParticipant,
    RoomEvent,
    type Participant,
    type RemoteParticipant,
    type Room,
} from "livekit-client";

import Avatar from "@/3d/avatar/Avatar";
import { type AvatarChangeAttributesData, type SyncState } from "@/models/multiplayer";
import AvatarController from "@/3d/avatar/AvatarController";
import type CoreScene from "@/3d/core/CoreScene";
import eventBus from "@/eventBus";
import type { AvatarGender } from "@/models/3d";
import { useAvatarStore } from "@/stores/useAvatarStore";

import { clientSettings } from "clientSettings";

import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Scene } from "@babylonjs/core/scene";

const extractMorphTargetInfluences = (
    manager?: MorphTargetManager | null
): Record<string, number> => {
    if (!manager) return {};

    const result: Record<string, number> = {};

    for (let i = 0; i < manager.numTargets; i++) {
        const target = manager.getTarget(i);
        if (target?.name) {
            result[target.name] = target.influence;
        }
    }

    return result;
};

class MultiplayerManager {
    readonly coreScene: CoreScene;
    readonly room: Room;
    readonly localAvatar: Avatar;
    readonly remoteAvatars: Map<Participant, Avatar>;
    readonly avatarController: AvatarController;
    syncAvatarObserver?: Observer<Scene>;

    constructor(room: Room, coreScene: CoreScene) {
        this.room = room;
        this.coreScene = coreScene;

        this.localAvatar =
            useAvatarStore.getState().avatar ??
            new Avatar(coreScene, this.room.localParticipant, "male", true);
        if (!useAvatarStore.getState().avatar) {
            useAvatarStore.getState().setAvatar(this.localAvatar);
        }

        this.avatarController = new AvatarController(
            this.localAvatar,
            this.coreScene.camera,
            coreScene.scene
        );
        this.remoteAvatars = new Map<Participant, Avatar>();

        this._initRoomEvents();
        this._loadRoomUsers();

        if (clientSettings.DEBUG)
            console.log("MultiplayerManager initialized", this.room.name);
    }

    private _initRoomEvents() {
        this.room.on(
            RoomEvent.ParticipantConnected,
            this._loadRemoteParticipantAvatar.bind(this)
        );
        this.room.on(
            RoomEvent.ParticipantDisconnected,
            this._removeRemoteParticipantAvatar.bind(this)
        );
        this.room.on(
            RoomEvent.ParticipantNameChanged,
            this._updateRemoteParticipantName.bind(this)
        );

        const encoder = new TextEncoder();

        // send our avatar state to all participants in the room
        this.syncAvatarObserver = this.coreScene.scene.onBeforeRenderObservable.add(
            async () => {
                // publish data takes in a Uint8Array, so we need to convert it
                const data = encoder.encode(JSON.stringify(this._getSelfAvatarState()));
                try {
                    this.room.localParticipant.publishData(data, {
                        reliable: true,
                        destinationIdentities: [],
                    });
                } catch {
                    // empty
                }
            }
        );

        // receive attribute changes from other participants
        this.room.on(
            RoomEvent.ParticipantAttributesChanged,
            (changedAttribute, participant) => {
                if (participant instanceof LocalParticipant) return;

                console.log(
                    "remote participant attributes changed",
                    changedAttribute,
                    participant
                );
                if ("avatarId" in changedAttribute || "gender" in changedAttribute) {
                    const attributeData = {
                        avatarId: changedAttribute.avatarId,
                        gender: changedAttribute.gender as AvatarGender,
                    };
                    this._changeRemoteParticipantAvatarListener(attributeData, participant);
                }
            }
        );

        // receive sync state data packets from other participants
        this.room.on(RoomEvent.DataReceived, this._syncRemoteAvatars.bind(this));
    }

    private _loadRoomUsers() {
        if (this.coreScene.isPhysicsEnabled) {
            this.initSelfAvatar();
        } else {
            eventBus.once(`space:scenePhysicsEnabled:${this.room.name}`, () =>
                this.initSelfAvatar()
            );
        }

        // load all other users in the room
        for (const participant of this.room.remoteParticipants.values()) {
            this._loadRemoteParticipantAvatar(participant, false);
        }

        useAvatarStore.getState().setRemoteAvatarAudioPositions(
            [...this.remoteAvatars.values()].map((avatar) => ({
                identity: avatar.participant.identity,
                position: avatar.getPosition(true).asArray(),
                // rotation: avatar.getRotationQuaternion(true).asArray(),
                // forward: avatar.root.forward.asArray(),
                cameraPosition: avatar.coreScene.camera.globalPosition.asArray(),
                cameraRotation: avatar.coreScene.camera.rotation.asArray(),
            }))
        );
    }

    private initSelfAvatar() {
        // if not already loaded, load the avatar
        if (this.localAvatar.container) {
            this.localAvatar.showAvatarInfo();
            this.localAvatar.loadAnimations();
        } else {
            this.localAvatar.loadAvatar().then(() => {
                this.localAvatar.showAvatarInfo();
                this.localAvatar.loadAnimations();
            });
        }

        // eslint-disable-next-line unicorn/consistent-function-scoping
        const setup = () => {
            this.localAvatar.loadPhysicsBodies();
            if (this.localAvatar.container) {
                this.avatarController.start();
            } else {
                eventBus.once(
                    `avatar:modelLoaded:${this.localAvatar.participant.identity}`,
                    () => {
                        this.avatarController.start();
                    }
                );
            }
        };

        if (this.coreScene.atom.isPhysicsGenerated) {
            setup();
        } else {
            eventBus.once(`space:physicsReady:${this.room.name}`, () => {
                setup();
            });
        }
    }

    private _loadRemoteParticipantAvatar(
        participant: RemoteParticipant,
        isEvent: boolean = true
    ) {
        if (participant.identity === this.room.localParticipant.identity) {
            return;
        }
        const avatar = new Avatar(this.coreScene, participant, "male", false);
        avatar.loadAvatar().then(() => {
            avatar.loadPhysicsBodies();
            avatar.showAvatarInfo();
            avatar.loadAnimations();
        });
        this.remoteAvatars.set(participant, avatar);

        if (isEvent) {
            useAvatarStore.getState().setRemoteAvatarAudioPositions(
                [...this.remoteAvatars.values()].map((avatar) => ({
                    identity: avatar.participant.identity,
                    position: avatar.getPosition(true).asArray(),
                    // rotation: avatar.getRotationQuaternion(true).asArray(),
                    // forward: avatar.root.forward.asArray(),
                    cameraPosition: avatar.coreScene.camera.globalPosition.asArray(),
                    cameraRotation: avatar.coreScene.camera.rotation.asArray(),
                }))
            );
        }
    }

    private _removeRemoteParticipantAvatar(participant: Participant) {
        if (participant.identity === this.room.localParticipant.identity) {
            return;
        }
        const avatar = this.remoteAvatars.get(participant);
        if (avatar) {
            avatar.dispose();
            this.remoteAvatars.delete(participant);
        }
    }

    private _updateRemoteParticipantName(name: string, participant: Participant) {
        this.remoteAvatars.get(participant)?.updateName(name);
    }

    private async _changeRemoteParticipantAvatarListener(attribute: AvatarChangeAttributesData, remoteParticipant: RemoteParticipant) {
        for (const [participant, avatar] of this.remoteAvatars) {
            if (participant.sid === remoteParticipant.sid) {
                avatar.loadAvatar(attribute.avatarId, attribute.gender).then(() => {
                    avatar.loadAnimations();
                });
                break;
            }
        }
    }

    private _syncRemoteAvatars(payload: Uint8Array<ArrayBufferLike>) {
        const decoder = new TextDecoder();
        const syncData = JSON.parse(decoder.decode(payload));
        if (syncData.id === this.room.localParticipant.identity) {
            return;
        }
        this._syncAvatarState(syncData);
    }

    private _getSelfAvatarState(): SyncState {
        const isLoading = this.localAvatar.isLoadingAvatar;

        return {
            identity: this.room.localParticipant.identity,
            position: this.localAvatar.getPosition(true).asArray(),
            rotation: this.localAvatar.getRotationQuaternion(true).asArray(),
            lookTarget: this.localAvatar.currentBoneLookControllerTarget?.asArray(),
            animation:
                this.localAvatar.playingAnimation?.name ??
                (this.localAvatar.gender === "male" ? "Male" : "Female") +
                "Idle_" +
                this.localAvatar.participant.identity,
            isAnimationLooping: this.localAvatar.isPlayingAnimationLooping,
            isCrouching: this.localAvatar.isCrouching,
            isMoving: this.localAvatar.isMoving,
            isGrounded: this.localAvatar.isGrounded,
            morphTargets: isLoading
                ? {}
                : extractMorphTargetInfluences(this.localAvatar.morphTargetManager),
        };
    }

    private async _syncAvatarState(syncData: SyncState) {
        const {
            identity,
            position,
            rotation,
            animation,
            isAnimationLooping,
            isCrouching,
            isMoving,
            isGrounded,
            lookTarget,
            morphTargets,
        } = syncData;

        for (const [participant, avatar] of this.remoteAvatars) {
            if (participant.identity === identity) {
                avatar.isMoving = isMoving;
                avatar.isGrounded = isGrounded;
                avatar.setPosition(Vector3.FromArray(position));
                avatar.setRotationQuaternion(Quaternion.FromArray(rotation));
                avatar.playAnimation(animation, isAnimationLooping);
                avatar.toggleCrouchCapsuleBody(isCrouching);
                if (avatar.morphTargetManager) {
                    for (const [name, weight] of Object.entries(morphTargets)) {
                        const target = avatar.morphTargetManager.getTargetByName(name);
                        if (target) target.influence = weight;
                    }
                }
                if (lookTarget) avatar.update(Vector3.FromArray(lookTarget));

                break;
            }
        }
        // update the avatar position for audio
        useAvatarStore.getState().setRemoteAvatarAudioPositions(
            [...this.remoteAvatars.values()].map((avatar) => ({
                identity: avatar.participant.identity,
                position: avatar.getPosition(true).asArray(),
                // rotation: avatar.getRotationQuaternion(true).asArray(),
                // forward: avatar.root.forward.asArray(),
                cameraPosition: avatar.coreScene.camera.globalPosition.asArray(),
                cameraRotation: avatar.coreScene.camera.rotation.asArray(),
            }))
        );
    }

    clearAllListeners() {
        this.syncAvatarObserver?.remove();
        this.syncAvatarObserver = undefined;

        this.room.off(RoomEvent.DataReceived, this._syncRemoteAvatars);
        this.room.off(
            RoomEvent.ParticipantConnected,
            this._loadRemoteParticipantAvatar
        );
        this.room.off(
            RoomEvent.ParticipantDisconnected,
            this._removeRemoteParticipantAvatar
        );
        this.room.off(
            RoomEvent.ParticipantNameChanged,
            this._updateRemoteParticipantName
        );
        this.room.unregisterRpcMethod("participantRequestJoinSpace");
    }

    clearAllRemoteAvatars() {
        for (const avatar of this.remoteAvatars.values()) avatar.dispose();
        this.remoteAvatars.clear();
    }

    dispose() {
        this.clearAllListeners();
        this.clearAllRemoteAvatars();

        this.localAvatar.disposeAvatarInfo();
        this.localAvatar.stopAllAnimations();
        this.localAvatar.disposePhysicsBodies();
        this.avatarController.dispose();

        // reset local avatar position and rotation
        this.localAvatar.setPosition(Vector3.Zero());
        this.localAvatar.setRotationQuaternion(Quaternion.Identity());

        if (clientSettings.DEBUG)
            console.log("MultiplayerManager disposed", this.room.name);
    }
}

export default MultiplayerManager;
