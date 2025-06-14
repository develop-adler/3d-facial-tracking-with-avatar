import { Vector3, type Object3D } from "three";

import type Avatar from "@/3dthree/avatar/Avatar";
import eventBus from "@/eventBus";
import type { AvatarPhysicsShapes } from "@/models/3d";
import type { PhysicsBody } from "@/utils/three/havok/physicsBody";
import type { PhysicsShapeContainer, PhysicsShapeSphere } from "@/utils/three/havok/physicsShape";

import { clientSettings } from "clientSettings";

class AvatarBody {
    readonly avatar: Avatar;
    avatarBodyShapeFull?: PhysicsShapeContainer;
    avatarBodyShapeCrouch?: PhysicsShapeSphere;
    readonly avatarPhysicsShapes: AvatarPhysicsShapes;
    private _capsuleBody?: PhysicsBody;
    private _capsuleBodyNode?: Object3D;
    // private _syncBodiesObservers: Array<Observer<Scene>> = [];
    private _syncBodiesCallbackRemove?: () => void;
    private _hitBoxBodies: Array<PhysicsBody> = [];
    private _physicsBodies: Array<PhysicsBody> = [];

    // for teleportation shape cast checking
    avatarBodyShapeFullForChecks?: PhysicsShapeContainer;

    private _height: number = 0;
    // private _syncCapsuleBodyObserver?: Observer<Scene>;
    private _syncCapsuleBodyCallbackRemove?: () => void;

    constructor(avatar: Avatar) {
        this.avatar = avatar;
    }

    get coreScene() {
        return this.avatar.coreScene;
    }
    get scene() {
        return this.avatar.scene;
    }
    get participant() {
        return this.avatar.participant;
    }
    get skeleton() {
        return this.avatar.skeleton;
    }

    loadPhysicsBodies(): void {
        if (this.coreScene.isPhysicsEnabled) {
            // load hitboxes for skeleton
            if (this.skeleton) this._generateHitBoxes(this.skeleton);

            // capsule body always has to be generated after the physics bodies
            // otherwise the physics bodies' position will not be correct
            this._capsuleBody = this._generateCapsuleBody(this.avatar.root.getWorldPosition(new Vector3()));

            this._createGroundCheckBody();

            if (clientSettings.DEBUG) {
                console.log(
                    `Physics bodies created for ${this.participant.identity}:`,
                    this._physicsBodies.map((body) => body.node.name)
                );
            }
        } else {
            eventBus.onceWithEvent("space:scenePhysicsEnabled", () => {
                // load hitboxes for skeleton
                if (this.skeleton) this._generateHitBoxes(this.skeleton);

                // capsule body always has to be generated after the physics bodies
                // otherwise the physics bodies' position will not be correct
                this._capsuleBody = this._generateCapsuleBody(
                    this.avatar.root.getWorldPosition(new Vector3())
                );

                this._createGroundCheckBody();

                if (clientSettings.DEBUG) {
                    console.log(
                        `Physics bodies created for ${this.participant.identity}:`,
                        this._physicsBodies.map((body) => body.node.name)
                    );
                }
            });
        }
    }

    private _generateCapsuleBody(position?: Vector3): PhysicsBody {
        const avatarPhysicsShapes = this.isSelf
            ? this.avatarPhysicsShapes
            : this.coreScene.remoteAvatarPhysicsShapes;

        avatarPhysicsShapes[this.gender].normal ??= CreateAvatarPhysicsShape(
            this.scene,
            this.gender,
            false,
            !this.isSelf
        );

        avatarPhysicsShapes[this.gender].crouch ??= CreateAvatarPhysicsShape(
            this.scene,
            this.gender,
            true,
            !this.isSelf
        );

        this.avatarBodyShapeFull = avatarPhysicsShapes[this.gender].normal!;
        this.avatarBodyShapeCrouch = avatarPhysicsShapes[this.gender].crouch!;

        if (!this.avatarBodyShapeFullForChecks) {
            this.avatarBodyShapeFullForChecks = CreateAvatarPhysicsShape(
                this.scene,
                this.gender,
                false,
                !this.isSelf
            );
            this.avatarBodyShapeFullForChecks.filterCollideMask =
                PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
        }

        const capsuleHeight =
            this.gender === "male"
                ? AVATAR_PARAMS.CAPSULE_HEIGHT_MALE
                : AVATAR_PARAMS.CAPSULE_HEIGHT_FEMALE;

        if (!this._capsuleBodyNode) {
            this._capsuleBodyNode = new TransformNode(
                "avatarCapsuleBodyNode_" + this.participant.identity,
                this.scene
            );
        }
        this._capsuleBodyNode.setAbsolutePosition(position ?? Vector3.Zero());

        const body = new PhysicsBody(
            this._capsuleBodyNode,
            this.isSelf ? PHYSICS_MOTION_TYPE.DYNAMIC : PHYSICS_MOTION_TYPE.ANIMATED,
            true,
            this.scene
        );
        body.shape = this.avatarBodyShapeFull;

        body.setMassProperties({
            centerOfMass: new Vector3(0, capsuleHeight * 0.5, 0),
            mass: this.gender === "male" ? 65 : 45,
            inertia: Vector3.Zero(),
        });
        body.setCollisionCallbackEnabled(true);
        body.setCollisionEndedCallbackEnabled(true);

        body.getCollisionObservable().add((collisionEvent) => {
            switch (collisionEvent.type) {
                case "COLLISION_STARTED":
                case "COLLISION_CONTINUED": {
                    this._isCapsuleBodyColliding = true;
                    break;
                }
            }
        });
        body.getCollisionEndedObservable().add(() => {
            this._isCapsuleBodyColliding = false;
        });

        this._physicsBodies.push(body);

        this._syncCapsuleBodyObserver?.remove();
        this._syncCapsuleBodyObserver = this.scene.onAfterPhysicsObservable.add(() => {
            if (!this._capsuleBodyNode) return;
            this.avatar.root.setAbsolutePosition(this._capsuleBodyNode.getWorldPosition(new Vector3()));
        });

        eventBus.emit(
            `avatar:capsuleBodyCreated:${this.participant.identity}`,
            body
        );

        this._fallSceneObserver = this.scene.onAfterPhysicsObservable.add(() => {
            // if is falling and capsule body isn't colliding with anything
            // start timeout to check if avatar is falling infinitely in the air
            if (this.isFalling === true && this._isCapsuleBodyColliding === false) {
                if (!this.avatarFallTimeout) {
                    this.avatarFallTimeout = setTimeout(() => {
                        this.avatarFallTimeoutCallback?.(this);
                    }, this.avatarFallTimeoutTimer);
                }
            } else {
                // clear timeout if avatar is not falling or is colliding with something
                if (this.avatarFallTimeout) {
                    clearTimeout(this.avatarFallTimeout);
                    this.avatarFallTimeout = undefined;
                }
            }
        });

        // for physics debugging
        // this.physicsViewer.showBody(body);

        return body;
    }

    setFallTimeoutTimer(timer: number) {
        this.avatarFallTimeoutTimer = timer;
    }

    setFallTimeoutCallback(callback: (avatar: Avatar) => void) {
        this.avatarFallTimeoutCallback = callback;
    }

    private _generateHitBoxes(skeleton: Skeleton): void {
        const createSphereBody = (
            bone?: Bone,
            diameter: number = 0.07,
            positionOffset: Vector3 = Vector3.Zero()
        ) => {
            if (!bone) return;

            const bodyNode = new TransformNode(
                bone.name + "_node_" + this.participant.identity,
                this.scene
            );
            bodyNode.position = bone.getAbsolutePosition(this._rootMesh);

            const sphereShape = new PhysicsShapeSphere(
                positionOffset,
                diameter,
                this.scene
            );
            sphereShape.material = { friction: 0, restitution: 0 };

            // collide with other bodies and allow other bodies to collide with self bodies
            sphereShape.filterMembershipMask =
                PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;
            sphereShape.filterCollideMask =
                PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;

            const body = new PhysicsBody(
                bodyNode,
                PHYSICS_MOTION_TYPE.DYNAMIC,
                false,
                this.scene
            );
            body.shape = sphereShape;
            body.setMassProperties({
                centerOfMass: bodyNode.position,
                mass: 150,
                inertia: Vector3.Zero(),
            });

            // update position of physics bodies every frame
            const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
            if (plugin) {
                this._syncBodiesObservers.push(
                    this.scene.onAfterPhysicsObservable.add(() => {
                        (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
                            body._pluginData.hpBodyId,
                            bone.getAbsolutePosition(this._rootMesh).asArray()
                        );
                    })
                );
            }

            this._hitBoxBodies.push(body);
            this._physicsBodies.push(body);
        };

        const createBoxBody = (
            bone: Bone | undefined,
            boxSize: Vector3,
            offset: Vector3 = Vector3.Zero()
        ) => {
            if (!bone) return;

            const bodyNode = new TransformNode(
                bone.name + "_node_" + this.participant.identity,
                this.scene
            );
            bodyNode.position = bone.getAbsolutePosition(this._rootMesh);

            const boxShape = new PhysicsShapeBox(
                offset,
                Quaternion.Identity(),
                boxSize,
                this.scene
            );
            boxShape.material = { friction: 0, restitution: 0 };

            boxShape.filterMembershipMask =
                PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;
            boxShape.filterCollideMask =
                PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;

            const body = new PhysicsBody(
                bodyNode,
                PHYSICS_MOTION_TYPE.DYNAMIC,
                false,
                this.scene
            );
            body.shape = boxShape;
            body.setMassProperties({
                centerOfMass: bodyNode.position,
                mass: 300,
                inertia: Vector3.Zero(),
            });

            body.setCollisionCallbackEnabled(true);

            switch (bone.name) {
                case "Head": {
                    setTimeout(() => {
                        body.getCollisionObservable().add((collision) => {
                            if (collision.type === "COLLISION_STARTED") {
                                if (
                                    collision.collidedAgainst.node.name.includes(
                                        "LeftHandMiddle1"
                                    ) ||
                                    collision.collidedAgainst.node.name.includes(
                                        "RightHandMiddle1"
                                    ) ||
                                    collision.collidedAgainst.node.name.includes(
                                        "LeftToeBase"
                                    ) ||
                                    collision.collidedAgainst.node.name.includes(
                                        "RightToeBase"
                                    )
                                ) {
                                    // TODO: handle flinching interaction better
                                    // const identity = collision.collidedAgainst.node.name
                                    //   .split("_")
                                    //   .at(-1);
                                    // for (const avatar of this._otherAvatars) {
                                    //   // if avatar is not already getting hit, play head flinch animation
                                    //   if (
                                    //     avatar.participant.identity === identity &&
                                    //     avatar.interaction?.type === "hitting" &&
                                    //     this.interaction?.type !== "gethit"
                                    //   ) {
                                    //     this.playInteraction("HeadFlinch", "gethit");
                                    //     break;
                                    //   }
                                    // }
                                }
                            }
                        });
                    }, 8);
                    break;
                }
                case "Hips":
                case "Spine1":
                case "Spine2": {
                    setTimeout(() => {
                        body.getCollisionObservable().add((collision) => {
                            if (collision.type === "COLLISION_STARTED") {
                                if (
                                    collision.collidedAgainst.node.name.includes(
                                        "LeftHandMiddle1"
                                    ) ||
                                    collision.collidedAgainst.node.name.includes(
                                        "RightHandMiddle1"
                                    ) ||
                                    collision.collidedAgainst.node.name.includes(
                                        "LeftToeBase"
                                    ) ||
                                    collision.collidedAgainst.node.name.includes(
                                        "RightToeBase"
                                    )
                                ) {
                                    // TODO: handle flinching interaction better
                                    // const identity = collision.collidedAgainst.node.name
                                    //   .split("_")
                                    //   .at(-1);
                                    // for (const avatar of this._otherAvatars) {
                                    //   // if avatar is not already getting hit, play chest flinch animation
                                    //   // and prevent having another flinch if already getting hit
                                    //   if (
                                    //     avatar.participant.name === identity &&
                                    //     avatar.interaction?.type === "hitting" &&
                                    //     this.interaction?.type !== "gethit"
                                    //   ) {
                                    //     this.playInteraction("ChestFlinch", "gethit");
                                    //     break;
                                    //   }
                                    // }
                                }
                            }
                        });
                    }, 8);
                    break;
                }
            }

            // update position of physics bodies every frame
            const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
            if (plugin) {
                this._syncBodiesObservers.push(
                    this.scene.onAfterPhysicsObservable.add(() => {
                        (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
                            body._pluginData.hpBodyId,
                            bone.getAbsolutePosition(this._rootMesh).asArray()
                        );
                        (plugin as HavokPlugin)._hknp.HP_Body_SetOrientation(
                            body._pluginData.hpBodyId,
                            bone.getRotationQuaternion(1, this._rootMesh).asArray()
                        );
                    })
                );
            }

            this._hitBoxBodies.push(body);
            this._physicsBodies.push(body);

            return body;
        };

        const getBoneFromName = (name: string): Bone | undefined => {
            return skeleton.bones.find((bone) => bone.name === name);
        };

        const BONE_BOX_BODY_PARAMS = {
            hips: {
                shape: "box",
                size: new Vector3(0.28, 0.28, 0.28),
                offset: new Vector3(0, 0.03, 0),
            },
            spine1: {
                shape: "box",
                size: new Vector3(0.26, 0.22, 0.26),
                offset: new Vector3(0, -0.03, 0),
            },
            spine2: {
                shape: "box",
                size: new Vector3(0.18, 0.18, 0.18),
                offset: new Vector3(0, -0.12, 0),
            },
            head: {
                shape: "sphere",
                size: 0.16,
                offset: new Vector3(0, 0.08, 0),
            },
            arm: {
                shape: "box",
                size: new Vector3(0.12, 0.28, 0.12),
                offset: new Vector3(0, -0.12, 0),
            },
            forearm: {
                shape: "box",
                size: new Vector3(0.12, 0.34, 0.12),
                offset: new Vector3(0, -0.12, 0),
            },
            hand: {
                shape: "sphere",
                size: 0.08,
                offset: Vector3.Zero(),
            },
            thigh: {
                shape: "box",
                size: new Vector3(0.12, 0.36, 0.12),
                offset: new Vector3(0, -0.24, 0),
            },
            calf: {
                shape: "box",
                size: new Vector3(0.12, 0.47, 0.12),
                offset: new Vector3(0, -0.2, 0),
            },
            foot: {
                shape: "box",
                size: new Vector3(0.12, 0.34, 0.16),
                offset: Vector3.Zero(),
            },
        };

        // create physics bodies for bones
        createBoxBody(
            getBoneFromName("Hips"),
            BONE_BOX_BODY_PARAMS.hips.size,
            BONE_BOX_BODY_PARAMS.hips.offset
        );

        createBoxBody(
            getBoneFromName("Spine1"),
            BONE_BOX_BODY_PARAMS.spine1.size,
            BONE_BOX_BODY_PARAMS.spine1.offset
        );
        createBoxBody(
            getBoneFromName("Spine2"),
            BONE_BOX_BODY_PARAMS.spine2.size,
            BONE_BOX_BODY_PARAMS.spine2.offset
        );
        createSphereBody(
            getBoneFromName("Head"),
            BONE_BOX_BODY_PARAMS.head.size,
            BONE_BOX_BODY_PARAMS.head.offset
        );

        createBoxBody(
            getBoneFromName("LeftArm"),
            BONE_BOX_BODY_PARAMS.arm.size,
            BONE_BOX_BODY_PARAMS.arm.offset
        );
        createBoxBody(
            getBoneFromName("RightArm"),
            BONE_BOX_BODY_PARAMS.arm.size,
            BONE_BOX_BODY_PARAMS.arm.offset
        );
        createBoxBody(
            getBoneFromName("LeftForeArm"),
            BONE_BOX_BODY_PARAMS.forearm.size,
            BONE_BOX_BODY_PARAMS.forearm.offset
        );
        createBoxBody(
            getBoneFromName("RightForeArm"),
            BONE_BOX_BODY_PARAMS.forearm.size,
            BONE_BOX_BODY_PARAMS.forearm.offset
        );
        createSphereBody(getBoneFromName("LeftHandMiddle1"));
        createSphereBody(getBoneFromName("RightHandMiddle1"));

        createBoxBody(
            getBoneFromName("LeftUpLeg"),
            BONE_BOX_BODY_PARAMS.thigh.size,
            BONE_BOX_BODY_PARAMS.thigh.offset
        );
        createBoxBody(
            getBoneFromName("RightUpLeg"),
            BONE_BOX_BODY_PARAMS.thigh.size,
            BONE_BOX_BODY_PARAMS.thigh.offset
        );
        createBoxBody(
            getBoneFromName("LeftLeg"),
            BONE_BOX_BODY_PARAMS.calf.size,
            BONE_BOX_BODY_PARAMS.calf.offset
        );
        createBoxBody(
            getBoneFromName("RightLeg"),
            BONE_BOX_BODY_PARAMS.calf.size,
            BONE_BOX_BODY_PARAMS.calf.offset
        );
        createBoxBody(
            getBoneFromName("LeftToeBase"),
            BONE_BOX_BODY_PARAMS.foot.size
        );
        createBoxBody(
            getBoneFromName("RightToeBase"),
            BONE_BOX_BODY_PARAMS.foot.size
        );

        // for physics debugging
        // this._physicsBodies.forEach(body => this.physicsViewer.showBody(body));
    }

    private _createGroundCheckBody(): void {
        const bodyNode = new TransformNode(
            "groundCheckBody_node_" + this.participant.identity,
            this.scene
        );
        bodyNode.setAbsolutePosition(this.avatar.root.getAbsolutePosition());

        const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.1, this.scene);
        shape.material = { friction: 0, restitution: 0 };
        shape.filterMembershipMask =
            PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_GROUND_CHECK;
        shape.filterCollideMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;

        const body = new PhysicsBody(
            bodyNode,
            PHYSICS_MOTION_TYPE.DYNAMIC,
            false,
            this.scene
        );
        body.shape = shape;
        body.setMassProperties({
            centerOfMass: bodyNode.getWorldPosition(new Vector3()),
            mass: 0.1,
            inertia: Vector3.Zero(),
        });

        body.setCollisionCallbackEnabled(true);
        body.setCollisionEndedCallbackEnabled(true);

        let isGroundedTimeout: globalThis.NodeJS.Timeout | undefined;
        body.getCollisionObservable().add((collisionEvent) => {
            switch (collisionEvent.type) {
                case "COLLISION_STARTED":
                case "COLLISION_CONTINUED": {
                    if (isGroundedTimeout) {
                        clearTimeout(isGroundedTimeout);
                        isGroundedTimeout = undefined;
                    }
                    // this means character is landing
                    if (!this.isGrounded) {
                        eventBus.emit(`avatar:landing:${this.participant.identity}`, this);
                    }
                    this.isGrounded = true;
                    break;
                }
            }
        });
        body.getCollisionEndedObservable().add(() => {
            if (isGroundedTimeout) {
                clearTimeout(isGroundedTimeout);
                isGroundedTimeout = undefined;
            }
            isGroundedTimeout = setTimeout(() => {
                isGroundedTimeout = undefined;
                this.isGrounded = false;
            }, 1000 / 24);
        });

        const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
        if (plugin) {
            this._syncBodiesObservers.push(
                this.scene.onAfterPhysicsObservable.add(() => {
                    (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
                        body._pluginData.hpBodyId,
                        this.avatar.root.getAbsolutePosition().asArray()
                    );
                })
            );
        }

        this._physicsBodies.push(body);

        // for physics debugging
        // this.physicsViewer.showBody(body);
    }

    disposePhysicsBodies(): void {
        for (const observer of this._syncBodiesObservers) observer.remove();
        this._syncBodiesObservers = [];
        this._syncCapsuleBodyObserver?.remove();
        this._syncCapsuleBodyObserver = undefined;
        this._capsuleBody = undefined;
        for (const body of this._physicsBodies) body.dispose();
        this._physicsBodies = [];
        this._hitBoxBodies = [];
    }
}

export default AvatarBody;
