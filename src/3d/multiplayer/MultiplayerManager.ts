import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult";
import {
    LocalParticipant,
    RoomEvent,
    type Participant,
    type RemoteParticipant,
    type Room,
    type RpcInvocationData,
} from "livekit-client";
import { toast } from "react-toastify";

import Avatar from "@/3d/avatar/Avatar";
import {
    type AvatarChangeAttributesData,
    type ConfirmRequest,
    type SyncState,
    type UserRequest,
} from "@/models/multiplayer";
import AvatarController from "@/3d/avatar/AvatarController";
import AvatarFaceView from "@/3d/avatar/AvatarFaceView";
import type CoreScene from "@/3d/core/CoreScene";
import eventBus from "@/eventBus";
import type { AvatarGender } from "@/models/3d";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";
import { TOAST_TOP_OPTIONS } from "constant";

import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { PhysicsShape } from "@babylonjs/core/Physics/v2/physicsShape";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
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
    /** Key: identity (string), value: Avatar */
    readonly remoteAvatars: Map<string, Avatar>;
    readonly avatarController: AvatarController;
    syncAvatarObserver?: Observer<Scene>;

    avatarView?: AvatarFaceView;

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
        this.remoteAvatars = new Map();

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
                try {
                    // publish data takes in a Uint8Array, so we need to convert it
                    const data = encoder.encode(
                        JSON.stringify(this._getSelfAvatarState())
                    );
                    await this.room.localParticipant.publishData(data, {
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
            this._handleParticipantAttributesChanged.bind(this)
        );

        // receive sync state data packets from other participants
        this.room.on(RoomEvent.DataReceived, this._syncRemoteAvatars.bind(this));

        // ===============================
        // UserRequest build space stuff
        eventBus.onWithEvent<UserRequest>(
            "multiplayer:requestBuildSpace",
            this._requestBuildSpaceEventListener.bind(this)
        );
        try {
            // unregister the method if it already exists to prevent error
            this.room.unregisterRpcMethod("participantRequestBuildSpace");
            this.room.registerRpcMethod(
                "participantRequestBuildSpace",
                this._requestBuildSpaceRPC.bind(this)
            );
        } catch {
            // empty
        }
        eventBus.onWithEvent<ConfirmRequest>(
            "multiplayer:confirmBuildSpace",
            this._confirmBuildSpaceEventListener.bind(this)
        );
        try {
            // unregister the method if it already exists to prevent error
            this.room.unregisterRpcMethod("participantConfirmBuildSpace");
            this.room.registerRpcMethod(
                "participantConfirmBuildSpace",
                this._confirmBuildSpaceRPC.bind(this)
            );
        } catch {
            // empty
        }
        // End of request build space stuff
        // ===============================
    }


    private _handleParticipantAttributesChanged(
        changedAttribute: Record<string, string>,
        participant: RemoteParticipant | LocalParticipant
    ) {
        if (participant instanceof LocalParticipant) return;

        if ("avatarId" in changedAttribute || "gender" in changedAttribute) {
            const attributeData = {
                avatarId: changedAttribute.avatarId,
                gender: changedAttribute.gender as AvatarGender,
            };
            this._changeRemoteParticipantAvatarListener(
                attributeData,
                participant
            );
        }
        if ("isBuildingSpace" in changedAttribute) {
            useLiveKitStore
                .getState()
                .setIsBuildSpaceMode(
                    changedAttribute.isBuildingSpace === "true" ? true : false
                );
        }
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
        if (this.localAvatar.container) {
            this.localAvatar.showAvatarInfo();
            this.localAvatar.loadAnimations();
            this.avatarController.start();
            // for debugging
            // this.avatarView ??= new AvatarFaceView(this.coreScene, this.localAvatar, document.querySelector("#pipCanvas") as HTMLCanvasElement);
        } else {
            this.localAvatar.loadAvatar().then(() => {
                this.localAvatar.showAvatarInfo();
                this.localAvatar.loadAnimations();
                this.avatarController.start();
                // for debugging
                // this.avatarView ??= new AvatarFaceView(this.coreScene, this.localAvatar, document.querySelector("#pipCanvas") as HTMLCanvasElement);
            });
        }

        if (this.coreScene.atom.isPhysicsGenerated) {
            this.localAvatar.loadPhysicsBodies();
        } else {
            eventBus.once(`space:physicsReady:${this.coreScene.room.name}`, () => {
                this.localAvatar.loadPhysicsBodies();
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
        const avatar = new Avatar(
            this.coreScene,
            participant,
            participant.attributes.gender as AvatarGender,
            false
        );
        avatar.loadAvatar(participant.attributes.avatarId).then(() => {
            avatar.loadPhysicsBodies();
            avatar.showAvatarInfo();
            avatar.loadAnimations();
            this.avatarView ??= new AvatarFaceView(
                this.coreScene,
                avatar,
                document.querySelector("#pipCanvas") as HTMLCanvasElement
            );
        });
        this.remoteAvatars.set(participant.identity, avatar);

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
        const avatar = this.remoteAvatars.get(participant.identity);
        if (avatar) {
            avatar.dispose();
            this.remoteAvatars.delete(participant.identity);
        }
    }

    private _updateRemoteParticipantName(name: string, participant: Participant) {
        this.remoteAvatars.get(participant.identity)?.updateName(name);
    }

    private async _changeRemoteParticipantAvatarListener(
        attribute: AvatarChangeAttributesData,
        remoteParticipant: RemoteParticipant
    ) {
        for (const [remoteIdentity, avatar] of this.remoteAvatars) {
            if (remoteIdentity === remoteParticipant.identity) {
                avatar.loadAvatar(attribute.avatarId, attribute.gender).then(() => {
                    avatar.loadAnimations();
                });
                break;
            }
        }
    }

    private async _requestBuildSpaceEventListener(request: UserRequest) {
        if (this.room.remoteParticipants.size === 0 && request.origin === "other") {
            return;
        }

        // for testing only
        if (this.room.remoteParticipants.size === 0 && request.origin === "self") {
            useLiveKitStore.getState().setIsBuildSpaceMode(true);
            return;
        }

        toast("Request sent, waiting for other user respond to request", {
            toastId: "waiting-confirm-toast",
            position: "top-center",
            autoClose: false,
            closeOnClick: true,
            draggable: false,
            pauseOnHover: false,
            isLoading: true,
        });

        for (const [, participant] of this.room.remoteParticipants) {
            try {
                const _response = await this.room.localParticipant.performRpc({
                    destinationIdentity: participant.identity,
                    method: "participantRequestBuildSpace",
                    payload: JSON.stringify({
                        identity: request.identity,
                        origin: request.origin,
                        // spaceId: request.spaceId,
                    }),
                });
            } catch {
                // console.error("RPC call failed:", error);
            }
        }
    }

    private async _requestBuildSpaceRPC(data: RpcInvocationData) {
        const payload = JSON.parse(data.payload) as UserRequest;
        useLiveKitStore.getState().setOpenBuildSpaceModal({
            identity: data.callerIdentity,
            origin: payload.origin,
        });
        return "ok" as string;
    }

    private async _confirmBuildSpaceEventListener(confirmData: ConfirmRequest) {
        for (const [, participant] of this.room.remoteParticipants) {
            try {
                const _response = await this.room.localParticipant.performRpc({
                    destinationIdentity: participant.identity,
                    method: "participantConfirmBuildSpace",
                    payload: JSON.stringify({
                        identity: confirmData.identity,
                        confirm: confirmData.confirm,
                    }),
                });
                // we click confirm button, so we can set multiplayer to true
                // if (confirmData.confirm) {
                //     useLiveKitStore.getState().setIsBuildSpaceMode(true);
                // }
                // currently being handled in participantAttributesChanged event for better syncing
            } catch {
                // console.error("RPC call failed:", error);
            }
        }
    }

    private async _confirmBuildSpaceRPC(data: RpcInvocationData) {
        toast.dismiss("waiting-confirm-toast");

        const payload = JSON.parse(data.payload) as ConfirmRequest;
        // we receive confirm data from other participant, so we can set multiplayer to true
        if (payload.confirm) {
            toast.update("Your request to build space together was accepted", TOAST_TOP_OPTIONS);
            useLiveKitStore.getState().setIsBuildSpaceMode(true);
        } else {
            toast.update("Your request to build space together was declined", TOAST_TOP_OPTIONS);
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

        for (const [remoteIdentity, avatar] of this.remoteAvatars) {
            if (remoteIdentity === identity) {
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

    teleportToRemoteAvatar(remoteAvatar?: Avatar): void {
        const avatar = remoteAvatar ?? this.remoteAvatars.values().next().value;
        if (!avatar) {
            toast("No user to teleport to", TOAST_TOP_OPTIONS);
            return;
        }

        const physicsEngine = this.coreScene.scene.getPhysicsEngine();
        if (!physicsEngine) throw new Error("Scene physics engine not found");

        const hk = physicsEngine.getPhysicsPlugin() as
            | HavokPlugin
            | null
            | undefined;
        if (!hk) throw new Error("Havok physics is undefined");

        const teleportLocalShapeCastResult = new ShapeCastResult();
        const teleportHitWorldShapeCastResult = new ShapeCastResult();

        const checkValidPosition = (
            to: Vector3,
            direction: Vector3,
            from: Vector3
        ): boolean => {
            // check if position has any colliding object
            teleportLocalShapeCastResult.reset();
            teleportHitWorldShapeCastResult.reset();
            hk.shapeCast(
                {
                    shape: this.localAvatar.avatarBodyShapeFullForChecks as PhysicsShape,
                    startPosition: from,
                    endPosition: to,
                    rotation: this.localAvatar.root.absoluteRotationQuaternion,
                    shouldHitTriggers: false,
                },
                teleportLocalShapeCastResult,
                teleportHitWorldShapeCastResult
            );

            // if height of collided body is higher than avatar's torso, return false
            if (
                teleportHitWorldShapeCastResult.hasHit &&
                teleportHitWorldShapeCastResult.body
            ) {
                const bbMinMax =
                    teleportHitWorldShapeCastResult.body.transformNode.getHierarchyBoundingVectors(
                        true
                    );
                if (bbMinMax.max.y - bbMinMax.min.y > avatar.headHeight * 0.5)
                    return false;
            }

            // cast from top to bottom to check if there's any ground to stand on
            teleportLocalShapeCastResult.reset();
            teleportHitWorldShapeCastResult.reset();
            hk.shapeCast(
                {
                    shape: this.localAvatar.avatarBodyShapeFullForChecks as PhysicsShape,
                    startPosition: to.add(Vector3.Up().scaleInPlace(3)),
                    endPosition: to.add(Vector3.Down().scaleInPlace(3)),
                    rotation: this.localAvatar.root.absoluteRotationQuaternion,
                    shouldHitTriggers: false,
                },
                teleportLocalShapeCastResult,
                teleportHitWorldShapeCastResult
            );

            // for debugging
            // const { hitPoint } = teleportHitWorldShapeCastResult;
            // if (!this._hitSphereDebug) {
            //     this._hitSphereDebug = CreateSphere(
            //         'heightHitSphere',
            //         { diameter: 0.05, segments: 8 },
            //         this.coreScene.scene
            //     );
            //     this._hitSphereDebug.setAbsolutePosition(hitPoint);
            // } else {
            //     this._hitSphereDebug
            //         .createInstance('hitSphere_' + this.coreScene.scene.meshes.length)
            //         .setAbsolutePosition(hitPoint);
            // }

            if (teleportHitWorldShapeCastResult.hasHit) {
                const hitPoint = teleportHitWorldShapeCastResult.hitPoint.clone();

                // check if the hit point is actual ground or just an obstacle
                teleportLocalShapeCastResult.reset();
                teleportHitWorldShapeCastResult.reset();
                hk.shapeCast(
                    {
                        shape: this.localAvatar
                            .avatarBodyShapeFullForChecks as PhysicsShape,
                        startPosition: hitPoint.add(Vector3.Up().scaleInPlace(0.5)),
                        endPosition: hitPoint.add(Vector3.Down().scaleInPlace(0.5)),
                        rotation: this.localAvatar.root.absoluteRotationQuaternion,
                        shouldHitTriggers: false,
                        ignoreBody: this.localAvatar.capsuleBody ?? undefined,
                    },
                    teleportLocalShapeCastResult,
                    teleportHitWorldShapeCastResult
                );

                // has ground
                if (teleportHitWorldShapeCastResult.hasHit) {
                    // teleport to other user and face them
                    this.localAvatar.setPosition(
                        hitPoint.add(Vector3.Up().scaleInPlace(0.5))
                    );
                    this.localAvatar.root.setDirection(direction);
                    return true;
                }
                return false;
            }
            return false;
        };

        // Try to teleport in front, right, left, or back of the other player
        const otherPlayerPos = avatar.getPosition(true);
        const directions = [
            { dir: avatar.root.forward, face: avatar.root.forward.negate() },
            { dir: avatar.root.right, face: avatar.root.right.negate() },
            { dir: avatar.root.right.negate(), face: avatar.root.right },
            { dir: avatar.root.forward.negate(), face: avatar.root.forward },
        ];

        const found = directions.some(({ dir, face }) =>
            checkValidPosition(
                otherPlayerPos.add(dir.scale(0.75)),
                face,
                otherPlayerPos
            )
        );

        if (!found) {
            toast(
                "Could not find a valid position to teleport to",
                TOAST_TOP_OPTIONS
            );
            return;
        }
    }

    clearAllRemoteAvatars() {
        for (const avatar of this.remoteAvatars.values()) avatar.dispose();
        this.remoteAvatars.clear();
    }

    clearAllListeners() {
        this.syncAvatarObserver?.remove();
        this.syncAvatarObserver = undefined;

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
        this.room.off(
            RoomEvent.ParticipantAttributesChanged,
            this._handleParticipantAttributesChanged
        );
        this.room.off(
            RoomEvent.DataReceived,
            this._syncRemoteAvatars
        );
        eventBus.removeAllListenersWithEvent("multiplayer:requestBuildSpace");
        eventBus.removeAllListenersWithEvent("multiplayer:confirmBuildSpace");
        this.room.unregisterRpcMethod("participantRequestBuildSpace");
        this.room.unregisterRpcMethod("participantConfirmBuildSpace");
    }

    dispose() {
        this.avatarView?.dispose();
        this.avatarView = undefined;

        this.clearAllListeners();
        this.clearAllRemoteAvatars();

        this.localAvatar.resetAvatarForVideoChat();
        this.localAvatar.disposeAvatarInfo();
        this.localAvatar.stopAllAnimations();
        this.localAvatar.disposePhysicsBodies();
        this.avatarController.dispose();

        // reset local avatar position and rotation
        this.localAvatar.setPosition(Vector3.Zero());
        this.localAvatar.setRotationQuaternion(Quaternion.Identity());

        if (clientSettings.DEBUG) {
            console.log("MultiplayerManager disposed for room:", this.room.name);
        }
    }
}

export default MultiplayerManager;
