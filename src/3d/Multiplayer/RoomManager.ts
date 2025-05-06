import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Participant, Room, RpcInvocationData } from "livekit-client";

import Avatar from "@/3d/Multiplayer/Avatar";
import type { SyncState } from "@/3d/Multiplayer/MultiplayerEvents";
import AvatarController from "@/3d/Multiplayer/AvatarController";
import type MultiplayerScene from "@/3d/Multiplayer/MultiplayerScene";
import eventBus from "@/eventBus";

import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Scene } from "@babylonjs/core/scene";

class RoomManager {
    readonly multiplayerScene: MultiplayerScene;
    readonly room: Room;
    readonly localAvatar: Avatar;
    readonly avatarController: AvatarController;
    syncAvatarObserver?: Observer<Scene>;

    /** This map holds participant as key and avatar as value */
    readonly remoteAvatars: Map<Participant, Avatar>;

    constructor(room: Room, multiplayerScene: MultiplayerScene) {
        this.room = room;
        this.multiplayerScene = multiplayerScene;
        this.localAvatar = new Avatar(
            multiplayerScene.scene,
            this.room.localParticipant,
            `https://models.readyplayer.me/67fe6f7713b3fb7e8aa0328c.glb?
                useDracoMeshCompression=true
                &useQuantizeMeshOptCompression=true
                &meshLod=1
                &textureSizeLimit=1024
                &textureAtlas=1024
                &textureFormat=webp
            `.replace(/\s+/g, ""),
            "male",
            true
        );
        this.avatarController = new AvatarController(
            this.localAvatar,
            this.multiplayerScene.camera,
            multiplayerScene.scene
        );
        this.remoteAvatars = new Map<Participant, Avatar>();

        this._setupRoomEvents();
        this._loadRoomUsers();
    }

    private _loadRoomUsers() {
        // load all other users in the room
        this.room.remoteParticipants.values().forEach((participant) => {
            this._loadRemoteParticipantAvatar(participant);
        });

        const initAvatar = () => {
            this.localAvatar.loadAvatar();

            if (this.multiplayerScene.atom.isPhysicsGenerated) {
                this.localAvatar?.loadPhysicsBodies();
                this.multiplayerScene.setCameraToAvatar();
                this.avatarController?.start();
            } else {
                eventBus.once(`space:physicsReady:${this.room.name}`, () => {
                    this.localAvatar?.loadPhysicsBodies();
                    this.multiplayerScene.setCameraToAvatar();
                    this.avatarController?.start();
                });
            }
        };

        if (this.multiplayerScene.isPhysicsEnabled) {
            initAvatar();
        } else {
            eventBus.once(`space:scenePhysicsEnabled:${this.room.name}`, () =>
                initAvatar()
            );
        }
    }

    private _setupRoomEvents() {
        this.room.on("participantConnected", (participant) => {
            if (participant.sid === this.room.localParticipant.sid) {
                return;
            }
            this._loadRemoteParticipantAvatar(participant);
        });
        this.room.on("participantDisconnected", (participant) => {
            if (participant.sid === this.room.localParticipant.sid) {
                return;
            }
            this._removeRemoteParticipantAvatar(participant);
        });
        this.room.on("participantNameChanged", (name, participant) => {
            this.remoteAvatars.get(participant)?.updateName(name);
        });

        // Register new RPC functions that will update each other's avatars in the 3D space
        this.room.registerRpcMethod(
            "syncAvatar",
            async (data: RpcInvocationData) => {
                const {
                    id,
                    position,
                    rotation,
                    animation,
                    isAnimationLooping,
                    isCrouching,
                    isMoving,
                    isGrounded,
                    lookTarget,
                    morphTargets,
                } = JSON.parse(data.payload) as SyncState;

                for (const [participant, avatar] of this.remoteAvatars) {
                    if (participant.sid === id) {
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
                    }
                }

                return "ok";
            }
        );

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

        this.syncAvatarObserver =
            this.multiplayerScene.scene.onBeforeRenderObservable.add(async () => {
                // send RPC function to all participants to sync our avatar on their side
                // try {
                //     const selfPosition = this.localAvatar.getPosition(true);
                //     const selfRotation = this.localAvatar.getRotationQuaternion(true);

                //     const response = await this.room.localParticipant.performRpc({
                //         destinationIdentity: "*",
                //         method: "syncAvatar",
                //         payload: JSON.stringify({
                //             id: this.room.localParticipant.sid,
                //             position: selfPosition.asArray(),
                //             rotation: selfRotation.asArray(),
                //             lookTarget:
                //                 this.localAvatar.currentBoneLookControllerTarget?.asArray() ??
                //                 null,
                //             animation:
                //                 this.localAvatar.playingAnimation?.name ??
                //                 (this.localAvatar.gender === "male" ? "Male" : "Female") +
                //                 "Idle",
                //             isAnimationLooping: this.localAvatar.isPlayingAnimationLooping,
                //             isCrouching: this.localAvatar.isCrouching,
                //             isMoving: this.localAvatar.isMoving,
                //             isGrounded: this.localAvatar.isGrounded,
                //             morphTargets: extractMorphTargetInfluences(
                //                 this.localAvatar.morphTargetManager
                //             ),
                //         }),
                //     });
                //     console.log("RPC response:", response);
                // } catch (error) {
                //     console.error("RPC call failed:", error);
                // }
                this.remoteAvatars.keys().forEach(async (participant) => {
                    const selfPosition = this.localAvatar.getPosition(true);
                    const selfRotation = this.localAvatar.getRotationQuaternion(true);

                    this.room.localParticipant.performRpc({
                        destinationIdentity: participant.identity,
                        method: "syncAvatar",
                        payload: JSON.stringify({
                            id: this.room.localParticipant.sid,
                            position: selfPosition.asArray(),
                            rotation: selfRotation.asArray(),
                            lookTarget:
                                this.localAvatar.currentBoneLookControllerTarget?.asArray() ??
                                null,
                            animation:
                                this.localAvatar.playingAnimation?.name ??
                                (this.localAvatar.gender === "male" ? "Male" : "Female") +
                                "Idle",
                            isAnimationLooping: this.localAvatar.isPlayingAnimationLooping,
                            isCrouching: this.localAvatar.isCrouching,
                            isMoving: this.localAvatar.isMoving,
                            isGrounded: this.localAvatar.isGrounded,
                            morphTargets: extractMorphTargetInfluences(
                                this.localAvatar.morphTargetManager
                            ),
                        }),
                    });
                });
            });
    }

    private _loadRemoteParticipantAvatar(participant: Participant) {
        const avatar = new Avatar(
            this.multiplayerScene.scene,
            participant,
            "https://models.readyplayer.me/67fe6f7713b3fb7e8aa0328c.glb?morphTargets=browDownLeft,browDownRight,browInnerUp,browOuterUpLeft,browOuterUpRight,cheekPuff,cheekSquintLeft,cheekSquintRight,eyeBlinkLeft,eyeBlinkRight,eyeLookDownLeft,eyeLookDownRight,eyeLookInLeft,eyeLookInRight,eyeLookOutLeft,eyeLookOutRight,eyeLookUpLeft,eyeLookUpRight,eyeSquintLeft,eyeSquintRight,eyeWideLeft,eyeWideRight,jawForward,jawLeft,jawOpen,jawRight,mouthClose,mouthDimpleLeft,mouthDimpleRight,mouthFrownLeft,mouthFrownRight,mouthFunnel,mouthLeft,mouthRight,mouthLowerDownLeft,mouthLowerDownRight,mouthPressLeft,mouthPressRight,mouthPucker,mouthRollLower,mouthRollUpper,mouthShrugLower,mouthShrugUpper,mouthSmileLeft,mouthSmileRight,mouthStretchLeft,mouthStretchRight,mouthUpperUpLeft,mouthUpperUpRight,noseSneerLeft,noseSneerRight&useDracoMeshCompression=true&useQuantizeMeshOptCompression=true&textureAtlas=1024&textureFormat=webp",
            "male",
            false
        );
        avatar.loadAvatar();
        this.remoteAvatars.set(participant, avatar);
    }

    private _removeRemoteParticipantAvatar(participant: Participant) {
        const avatar = this.remoteAvatars.get(participant);
        if (avatar) {
            avatar.dispose();
            this.remoteAvatars.delete(participant);
        }
    }

    dispose() { }
}

export default RoomManager;
