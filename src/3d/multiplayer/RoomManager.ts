import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    RoomEvent,
    type Participant,
    type Room,
    type RpcInvocationData,
} from "livekit-client";

import Avatar from "@/3d/avatar/Avatar";
import { AvatarChange, type SyncState } from "@/models/multiplayer";
import AvatarController from "@/3d/avatar/AvatarController";
import type CoreScene from "@/3d/core/CoreScene";
import eventBus from "@/eventBus";
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

class RoomManager {
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

        this._setupRoomEvents();
        this._loadRoomUsers();

        if (clientSettings.DEBUG)
            console.log("RoomManager initialized", this.room.name);
    }

    private _setupRoomEvents() {
        this.room.on(
            "participantConnected",
            this._loadRemoteParticipantAvatar.bind(this)
        );
        this.room.on(
            "participantDisconnected",
            this._removeRemoteParticipantAvatar.bind(this)
        );
        this.room.on(
            "participantNameChanged",
            this._updateRemoteParticipantName.bind(this)
        );

        // register RPC method to sync when user changes avatar
        try {
            // unregister the method if it already exists to prevent error
            this.room.unregisterRpcMethod("participantChangeAvatar");
            this.room.registerRpcMethod(
                "participantChangeAvatar",
                this._changeRemoteParticipantAvatar.bind(this)
            );
        } catch {
            // empty
        }
        eventBus.on("avatar:changeAvatar", this._changeAvatarEventBus.bind(this));

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

        // Receive sync state data from other participants
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
        participant: Participant,
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

    private _changeAvatarEventBus({ identity, avatarId, gender }: AvatarChange) {
        for (const participant of this.remoteAvatars.keys()) {
            try {
                this.room.localParticipant.performRpc({
                    destinationIdentity: participant.identity,
                    method: "participantChangeAvatar",
                    payload: JSON.stringify({
                        identity,
                        avatarId,
                        gender,
                    }),
                });
            } catch (error) {
                console.log("Error performing change avatar RPC", error);
            }
        }
    }

    private async _changeRemoteParticipantAvatar(data: RpcInvocationData) {
        const { avatarId, gender } = JSON.parse(data.payload) as AvatarChange;
        for (const [participant, avatar] of this.remoteAvatars) {
            if (participant.identity === data.callerIdentity) {
                avatar.loadAvatar(avatarId, gender).then(() => {
                    avatar.loadAnimations();
                });
                break;
            }
        }
        return "ok" as string;
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
                (this.localAvatar.gender === "male" ? "Male" : "Female") + "Idle_" + this.localAvatar.participant.identity,
            isAnimationLooping: this.localAvatar.isPlayingAnimationLooping,
            isCrouching: this.localAvatar.isCrouching,
            isMoving: this.localAvatar.isMoving,
            isGrounded: this.localAvatar.isGrounded,
            morphTargets: isLoading ? {} : extractMorphTargetInfluences(
                this.localAvatar.morphTargetManager
            ),
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

    dispose() {
        this.syncAvatarObserver?.remove();
        this.syncAvatarObserver = undefined;

        this.localAvatar.disposeAvatarInfo();
        this.localAvatar.stopAllAnimations();
        this.localAvatar.disposePhysicsBodies();
        this.avatarController.dispose();

        // reset local avatar position and rotation
        this.localAvatar.setPosition(Vector3.Zero());
        this.localAvatar.setRotationQuaternion(Quaternion.Identity());

        for (const avatar of this.remoteAvatars.values()) avatar.dispose();
        this.remoteAvatars.clear();

        this.room.off(RoomEvent.DataReceived, this._syncRemoteAvatars);
        this.room.off("participantConnected", this._loadRemoteParticipantAvatar);
        this.room.off(
            "participantDisconnected",
            this._removeRemoteParticipantAvatar
        );
        this.room.off("participantNameChanged", this._updateRemoteParticipantName);
        this.room.unregisterRpcMethod("participantChangeAvatar");
        eventBus.off("avatar:changeAvatar", this._changeAvatarEventBus);

        if (clientSettings.DEBUG)
            console.log("RoomManager disposed", this.room.name);
    }
}

export default RoomManager;
