// Three.js imports
import { Quaternion, Vector3 } from "three";

// LiveKit and other library imports (remain the same)
import {
    LocalParticipant,
    RoomEvent,
    type Participant,
    type RemoteParticipant,
    type Room,
    type RpcInvocationData,
} from "livekit-client";
import { toast } from "react-toastify";

// Your converted application module imports
import Avatar from "@/3dthree/avatar/Avatar";
import AvatarController from "@/3dthree/avatar/AvatarController";
import AvatarFaceView from "@/3dthree/avatar/AvatarFaceView";
import type CoreScene from "@/3dthree/core/CoreScene";
import eventBus from "@/eventBus";
import type {
    AvatarChangeAttributesData,
    ConfirmRequest,
    SyncState,
    UserRequest,
} from "@/models/multiplayer";
import type { AvatarGender, ObjectTransform } from "@/models/3d";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";
import { TOAST_TOP_OPTIONS } from "constant";

// /**
//  * Extracts morph target influences from a Three.js mesh.
//  * @param mesh - The SkinnedMesh containing the morph targets.
//  * @returns A record mapping morph target names to their influence values.
//  */
// const extractMorphTargetInfluences = (
//     mesh?: SkinnedMesh
// ): Record<string, number> => {
//     if (
//         !mesh ||
//         !mesh.morphTargetInfluences ||
//         !mesh.morphTargetDictionary
//     ) {
//         return {};
//     }

//     const result: Record<string, number> = {};
//     const influences = mesh.morphTargetInfluences;
//     const dictionary = mesh.morphTargetDictionary;

//     for (const [name, index] of Object.entries(dictionary)) {
//         if (influences[index] !== undefined) {
//             result[name] = influences[index];
//         }
//     }

//     return result;
// };

class MultiplayerManager {
    readonly coreScene: CoreScene;
    readonly room: Room;
    readonly localAvatar: Avatar;
    /** Key: identity (string), value: Avatar */
    readonly remoteAvatars: Map<string, Avatar>;
    readonly avatarController: AvatarController;

    // The render loop observer is replaced with a handler for our event bus
    private _syncMultiplayerUpdatesRemove?: () => void;
    private _syncAvatarCallbackRemove?: () => void;
    private _avatarControllerUpdateCallbackRemove?: () => void;
    private _avatarFaceViewUpdateCallbackRemove?: () => void;

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
            coreScene.camera,
            coreScene.controls,
            coreScene.scene
        );
        this.remoteAvatars = new Map();

        this._initRoomEvents();
        this._loadRoomUsers();

        // // start the avatar controller
        // this._avatarControllerUpdateCallbackRemove?.();
        // this._avatarControllerUpdateCallbackRemove =
        //     this.coreScene.addBeforeRenderCallback(delta => {
        //         this.avatarController.update(delta);
        //     });

        this._syncMultiplayerUpdatesRemove?.();
        this._syncMultiplayerUpdatesRemove =
            this.coreScene.addBeforeRenderCallback(delta => {
                this.coreScene.havokPhysics?.update(delta);

                // Update controls for smooth damping effect
                if (this.coreScene.controls.enableDamping) {
                    this.coreScene.controls.update();
                }
            })

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
        this._syncAvatarCallbackRemove = this.coreScene.addBeforeRenderCallback(
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
            this._changeRemoteParticipantAvatarListener(attributeData, participant);
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
        if (this.localAvatar.isReady) {
            this.avatarController.start();
        } else {
            eventBus.once("avatar:ready", () => {
                this.avatarController.start();
            });
        }
        if (this.coreScene.isPhysicsEnabled) {
            this.initSelfAvatar();
        } else {
            eventBus.once(`space:scenePhysicsEnabled:${this.room.name}`, () =>
                this.initSelfAvatar()
            );
        }

        for (const participant of this.room.remoteParticipants.values()) {
            this._loadRemoteParticipantAvatar(participant, false);
        }

        // Update audio positions, assuming the new Avatar class provides these methods
        const cameraPosition = new Vector3();
        this.coreScene.camera.getWorldPosition(cameraPosition);

        useAvatarStore.getState().setRemoteAvatarAudioPositions(
            [...this.remoteAvatars.values()].map((avatar) => ({
                identity: avatar.participant.identity,
                position: avatar.getPosition(true).toArray() as ObjectTransform,
                cameraPosition: cameraPosition.toArray() as ObjectTransform,
                cameraRotation:
                    this.coreScene.camera.rotation.toArray() as ObjectTransform,
            }))
        );
    }

    private initSelfAvatar() {
        if (this.localAvatar.gltf) {
            this.localAvatar.showAvatarInfo();
            this.localAvatar.loadAnimations();
            // for debugging
            // this.avatarView ??= new AvatarFaceView(this.coreScene, this.localAvatar, document.querySelector("#pipCanvas") as HTMLCanvasElement);
        } else {
            this.localAvatar.loadRPMAvatar().then(() => {
                this.localAvatar.showAvatarInfo();
                this.localAvatar.loadAnimations();
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
        avatar.loadRPMAvatar(participant.attributes.avatarId).then(() => {
            avatar.loadPhysicsBodies();
            avatar.showAvatarInfo();
            avatar.loadAnimations();
            if (!this.avatarView) {
                this.avatarView = new AvatarFaceView(
                    this.coreScene,
                    avatar,
                    document.querySelector("#pipCanvas") as HTMLCanvasElement
                );
                this._avatarFaceViewUpdateCallbackRemove =
                    this.coreScene.addBeforeRenderCallback((deltaTime: number) => {
                        this.avatarView?.update(deltaTime);
                    });
            }
        });
        this.remoteAvatars.set(participant.identity, avatar);

        if (isEvent) {
            const cameraPosition = new Vector3();
            this.coreScene.camera.getWorldPosition(cameraPosition);
            useAvatarStore.getState().setRemoteAvatarAudioPositions(
                [...this.remoteAvatars.values()].map((avatar) => ({
                    identity: avatar.participant.identity,
                    position: avatar.getPosition(true).toArray() as ObjectTransform,
                    cameraPosition: cameraPosition.toArray() as ObjectTransform,
                    cameraRotation:
                        avatar.coreScene.camera.rotation.toArray() as ObjectTransform,
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
                avatar.loadRPMAvatar(attribute.avatarId, attribute.gender).then(() => {
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
            toast.update(
                "Your request to build space together was accepted",
                TOAST_TOP_OPTIONS
            );
            useLiveKitStore.getState().setIsBuildSpaceMode(true);
        } else {
            toast.update(
                "Your request to build space together was declined",
                TOAST_TOP_OPTIONS
            );
        }
        return "ok" as string;
    }
    private _syncRemoteAvatars(payload: Uint8Array) {
        const decoder = new TextDecoder();
        const syncData = JSON.parse(decoder.decode(payload));
        if (syncData.identity === this.room.localParticipant.identity) {
            return;
        }
        this._syncAvatarState(syncData);
    }

    private _getSelfAvatarState(): SyncState {
        return {
            identity: this.room.localParticipant.identity,
            position: this.localAvatar.getPosition(true).toArray(),
            rotation: this.localAvatar.getRotationQuaternion(true).toArray(),
            // lookTarget: this.localAvatar.lookTarget?.toArray(),
            animation: this.localAvatar.playingAnimationAction?.getClip().name ?? "",
            isAnimationLooping: this.localAvatar.isPlayingAnimationLooping,
            isCrouching: this.localAvatar.isCrouching,
            isMoving: this.localAvatar.isMoving,
            isGrounded: this.localAvatar.isGrounded,
            morphTargets: this.localAvatar.getMorphTargets(),
        };
    }

    private async _syncAvatarState(syncData: SyncState) {
        const {
            identity,
            position,
            rotation,
            animation,
            isAnimationLooping,
            // isCrouching,
            isMoving,
            isGrounded,
            // lookTarget,
            morphTargets,
        } = syncData;

        const avatar = this.remoteAvatars.get(identity);
        if (avatar) {
            avatar.isMoving = isMoving;
            avatar.isGrounded = isGrounded;
            avatar.setPosition(new Vector3().fromArray(position));
            avatar.setRotationQuaternion(new Quaternion().fromArray(rotation));
            avatar.playAnimation(animation, isAnimationLooping);
            // avatar.toggleCrouchCapsuleBody(isCrouching);

            for (const [name, weight] of Object.entries(morphTargets)) {
                avatar.setMorphTarget(name, weight);
            }
            // if (lookTarget) avatar.update();
        }

        // Update audio positions
        const cameraPosition = new Vector3();
        this.coreScene.camera.getWorldPosition(cameraPosition);
        useAvatarStore.getState().setRemoteAvatarAudioPositions(
            [...this.remoteAvatars.values()].map((av) => ({
                identity: av.participant.identity,
                position: av.getPosition(true).toArray() as ObjectTransform,
                cameraPosition: cameraPosition.toArray() as ObjectTransform,
                cameraRotation:
                    this.coreScene.camera.rotation.toArray() as ObjectTransform,
            }))
        );
    }

    /**
     * Teleports the local player to a valid position near a remote avatar.
     * This has been completely rewritten to use the Rapier physics engine.
     */
    teleportToRemoteAvatar(remoteAvatar?: Avatar): void {
        const avatar = remoteAvatar ?? this.remoteAvatars.values().next().value;
        if (!avatar) {
            toast("No user to teleport to", TOAST_TOP_OPTIONS);
            return;
        }

        const physicsWorld = this.coreScene.physicsWorld;
        const rapier = this.coreScene.rapier;
        const localAvatarShape = this.localAvatar.getColliderShape(); // Assumes Avatar class provides this

        if (!physicsWorld || !rapier || !localAvatarShape) {
            console.error(
                "Cannot teleport: Physics not ready or avatar shape not found."
            );
            return;
        }

        const checkValidPosition = (
            targetPos: Vector3,
            lookAtDir: Vector3
        ): boolean => {
            // 1. Check for obstacles at the target destination.
            const obstacleHit = physicsWorld.castShape(
                targetPos, // shapePos
                new Quaternion(), // shapeRot
                new Vector3(0, 0, 0), // shapeVel (zero vector for an overlap check)
                localAvatarShape, // shape
                1, // maxToi (not relevant for overlap)
                true // stopAtPenetration
            );

            if (obstacleHit) {
                // You might want to check the collider's user data to see if it's another player
                // and allow it, but for now, any hit is a failure.
                return false;
            }

            // 2. Cast down from above to find the ground.
            const groundCastStart = targetPos.clone().add(new Vector3(0, 2, 0));
            const groundCastDir = new Vector3(0, -1, 0);
            const groundHit = physicsWorld.castShape(
                groundCastStart,
                new Quaternion(),
                groundCastDir,
                localAvatarShape,
                3, // max distance to check for ground
                true
            );

            if (groundHit) {
                const hitPoint = groundCastStart.add(
                    groundCastDir.multiplyScalar(groundHit.toi)
                );
                const finalPos = hitPoint.add(new Vector3(0, 0.1, 0)); // Small offset from ground

                this.localAvatar.setPosition(finalPos);
                this.localAvatar.lookAt(finalPos.clone().add(lookAtDir));
                return true;
            }

            return false;
        };

        const otherPlayerPos = avatar.getPosition(true);
        const otherPlayerFwd = avatar.getForward(true);
        const otherPlayerRight = avatar.getRight(true);

        const directions = [
            { dir: otherPlayerFwd, face: otherPlayerFwd.clone().negate() },
            { dir: otherPlayerRight, face: otherPlayerRight.clone().negate() },
            { dir: otherPlayerRight.clone().negate(), face: otherPlayerRight },
            { dir: otherPlayerFwd.clone().negate(), face: otherPlayerFwd },
        ];

        const found = directions.some(({ dir, face }) =>
            checkValidPosition(
                otherPlayerPos.clone().add(dir.multiplyScalar(0.75)),
                face
            )
        );

        if (!found) {
            toast(
                "Could not find a valid position to teleport to",
                TOAST_TOP_OPTIONS
            );
        }
    }

    clearAllRemoteAvatars() {
        for (const avatar of this.remoteAvatars.values()) avatar.dispose();
        this.remoteAvatars.clear();
    }

    dispose() {
        this._syncAvatarCallbackRemove?.();
        this._syncAvatarCallbackRemove = undefined;

        this._avatarControllerUpdateCallbackRemove?.();
        this._avatarControllerUpdateCallbackRemove = undefined;

        this._avatarFaceViewUpdateCallbackRemove?.();
        this._avatarFaceViewUpdateCallbackRemove = undefined;

        this._syncMultiplayerUpdatesRemove?.();
        this._syncMultiplayerUpdatesRemove = undefined;

        // LiveKit listeners need to be unbound one by one
        this.room.removeAllListeners(RoomEvent.ParticipantConnected);
        this.room.removeAllListeners(RoomEvent.ParticipantDisconnected);
        this.room.removeAllListeners(RoomEvent.ParticipantNameChanged);
        this.room.removeAllListeners(RoomEvent.ParticipantAttributesChanged);
        this.room.removeAllListeners(RoomEvent.DataReceived);

        eventBus.removeAllListenersWithEvent("multiplayer:requestBuildSpace");
        eventBus.removeAllListenersWithEvent("multiplayer:confirmBuildSpace");
        this.room.unregisterRpcMethod("participantRequestBuildSpace");
        this.room.unregisterRpcMethod("participantConfirmBuildSpace");

        this.avatarView?.dispose();
        this.avatarView = undefined;

        this.clearAllRemoteAvatars();

        this.localAvatar.resetAvatarForVideoChat();
        this.localAvatar.disposeAvatarInfo();
        this.localAvatar.stopAllAnimations();
        // this.localAvatar.disposePhysicsBodies(); TODO
        this.avatarController.dispose();

        // Reset local avatar position and rotation
        this.localAvatar.setPosition(new Vector3(0, 0, 0));
        this.localAvatar.setRotationQuaternion(new Quaternion());

        if (clientSettings.DEBUG) {
            console.log("MultiplayerManager disposed for room:", this.room.name);
        }
    }
}

export default MultiplayerManager;
