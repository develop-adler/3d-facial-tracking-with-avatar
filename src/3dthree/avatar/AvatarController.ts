// import { Animation } from "@babylonjs/core/Animations/animation"; // Use a tweening library like GSAP or TWEEN.js
// import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
// import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
// import { ProximityCastResult } from "@babylonjs/core/Physics/proximityCastResult"; // Physics-engine specific
// import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult"; // Physics-engine specific
// import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody"; // Physics-engine specific
// import { PhysicsShapeCylinder } from "@babylonjs/core/Physics/v2/physicsShape"; // Physics-engine specific

import { Quaternion, Vector3, type PerspectiveCamera, type Scene } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WebXRManager } from "three/src/renderers/webxr/WebXRManager.js"; // For XR state

import type Avatar from "@/3dthree/avatar/Avatar";
import { Vector2 } from "@/models/3d";
import eventBus from "@/eventBus";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { isMobile } from "@/utils/browserUtils";
import { lerp } from "@/utils/functionUtils";

import { clientSettings } from "clientSettings";
import {
    AVATAR_CONTROLLER_PARAMS,
    AVATAR_INTERACTIONS,
    AVATAR_PARAMS,
    // PHYSICS_SHAPE_FILTER_GROUPS, // TODO_THREE: Physics-engine specific
} from "constant";

// TODO_THREE: A tweening library is highly recommended for camera animations.
// import { TWEEN } from 'three/examples/jsm/libs/tween.module.min.js';

type JoystickAxes = Vector2;
type CameraMode = "thirdPerson" | "firstPerson";

interface KeyStatus {
    KeyW: boolean;
    ArrowUp: boolean;
    KeyA: boolean;
    ArrowLeft: boolean;
    KeyS: boolean;
    ArrowRight: boolean;
    KeyD: boolean;
    ArrowDown: boolean;
    Space: boolean;
}

// In Three.js with OrbitControls, checking for movement is done by comparing positions/targets.
const isOrbitControlsMoved = (
    controls: OrbitControls,
    lastPosition: Vector3,
    lastTarget: Vector3
): boolean => {
    const moved =
        !controls.object.position.equals(lastPosition) ||
        !controls.target.equals(lastTarget);
    lastPosition.copy(controls.object.position);
    lastTarget.copy(controls.target);
    return moved;
};

const normalizeToMaxOne = (x: number, y: number) => {
    const maxAbs = Math.max(Math.abs(x), Math.abs(y));
    if (maxAbs === 0) return { x: 0, y: 0 }; // Avoid division by zero
    const scale = 1 / maxAbs;
    return { x: x * scale, y: y * scale };
};

const getSlerpValue = (valueToSet: number, capMin: number, capMax: number) => {
    return Math.min(capMax, Math.max(capMin, valueToSet));
};

class AvatarController {
    readonly scene: Scene;
    // Assuming CoreScene provides OrbitControls
    readonly camera: PerspectiveCamera;
    readonly controls: OrbitControls;
    readonly avatar: Avatar;

    private readonly _joystickAxes: JoystickAxes;
    private _isActive: boolean = false;

    private _hitWall: boolean = false;
    private _cameraShortened: boolean = false;

    // Assumes CoreScene provides access to the renderer's xr manager
    private _xr?: WebXRManager;
    private _xrCamera?: PerspectiveCamera;

    private _isCameraOffset: boolean = false;
    private _cameraMode: CameraMode = "thirdPerson";
    private _isCameraModeTransitioning: boolean = false;

    readonly movementKeys: KeyStatus;

    readonly oldCameraPosition: Vector3 = new Vector3();
    readonly moveDirection: Vector3 = new Vector3();
    readonly frontVector: Vector3 = new Vector3();
    readonly sideVector: Vector3 = new Vector3();

    private _moveSpeed: number = AvatarController.WALK_SPEED;

    private _isJumping: boolean = false;
    readonly _coyoteTime: number = 0.2;
    readonly _jumpBufferTime: number = 0.2;
    private _coyoteTimeCounter: number = 0;
    private _jumpBufferCounter: number = 0;
    private _jumpingCooldownTimer?: globalThis.NodeJS.Timeout;

    private _dontZoomOut: boolean = false;

    static readonly CROUCH_SPEED: number = 1.6;
    static readonly WALK_SPEED: number = 3;
    static readonly RUN_SPEED: number = 6.5;
    static readonly JUMP_FORCE: number = 12;
    static readonly FOV_FIRSTPERSON_MOBILE: number = 70; // FOV in degrees for Three.js
    static readonly FOV_FIRSTPERSON: number = 60;
    static readonly FOV_THIRDPERSON_MOBILE: number = 65;
    static readonly FOV_THIRDPERSON: number = 50;
    static readonly JOYSTICK_DEADZONE: number = 0.07;

    constructor(
        avatar: Avatar,
        camera: PerspectiveCamera,
        controls: OrbitControls,
        scene: Scene,
        joystickAxes?: JoystickAxes
    ) {
        this.avatar = avatar;
        this.camera = camera;
        this.controls = controls;
        this.scene = scene;
        this._joystickAxes = joystickAxes ?? { x: 0, y: 0 };
        this.movementKeys = {
            KeyW: false,
            ArrowUp: false,
            KeyA: false,
            ArrowLeft: false,
            KeyS: false,
            ArrowRight: false,
            KeyD: false,
            ArrowDown: false,
            Space: false,
        };

        this._moveSpeed *= this.avatar.gender === "female" ? 0.75 : 1;

        this._addEventListeners();
    }

    get isControlledByUser(): boolean {
        return this.avatar.isControlledByUser;
    }
    get cameraMode(): CameraMode {
        return this._cameraMode;
    }

    start(): void {
        if (this._isActive) return;

        // In Three.js, update logic is typically called from a single main render loop.
        // We just set the active flag. The external render loop will call `update()`.
        this._isActive = true;

        if (!isMobile()) {
            this._isCameraOffset = true;
            // TODO_THREE: camera.targetScreenOffset has no direct equivalent.
            // This requires custom camera projection matrix manipulation or using a post-processing effect.
            // For now, this feature is disabled.
            console.warn(
                "AvatarController: camera.targetScreenOffset is not supported by default in Three.js."
            );
        }

        // Make camera follow avatar's head
        this.avatar.customHeadNode.position.set(0, this.avatar.headHeight, 0);
        this.avatar.root.add(this.avatar.customHeadNode);

        if (clientSettings.DEBUG) {
            console.log("AvatarController started");
        }
    }

    stop(): void {
        this._isActive = false;
        // TODO_THREE: Remove custom camera offset logic if implemented.
        if (clientSettings.DEBUG) {
            console.log("AvatarController stopped");
        }
    }

    // This method should be called from the main render loop
    update(deltaTime: number): void {
        if (!this._isActive) return;

        this._updateCamera();
        this._updateCharacter(deltaTime);
        this._updateCharacterAnimation();
        this._updateCharacterHead();

        // Update tweening library if used for camera animations
        // TWEEN.update();
    }

    cancelCharacterInteraction(): void {
        if (this.avatar.isControlledByAnotherSession) return;
        if (!this.avatar.interaction) return;
        if (this.avatar.interaction.type === "gethit") return;

        // useGlobalModalStoreImmediate.getState().setOpenAvatarInteractionModal(false);

        // play the x-to-idle animation for continuous interactions
        // like sit interaction
        if (this.avatar.interaction.type === "continuous") {
            this.avatar.interaction.endContinuousInteraction(() => {
                this.avatar.interaction?.dispose();
                this.avatar.interaction = undefined;
            });
            return;
        }

        this.avatar.interaction.dispose();
        this.avatar.interaction = undefined;
    }

    private _addEventListeners(): void {
        globalThis.addEventListener("keydown", this._onKeyDown);
        globalThis.addEventListener("keyup", this._onKeyUp);
        globalThis.addEventListener("blur", this.stopAllMovements);
    }

    private _removeEventListeners(): void {
        globalThis.removeEventListener("keydown", this._onKeyDown);
        globalThis.removeEventListener("keyup", this._onKeyUp);
        globalThis.removeEventListener("blur", this.stopAllMovements);
    }

    private _onKeyDown = (event: KeyboardEvent): void => {
        const key = event.code;
        if (key in this.movementKeys) {
            if (!this.avatar.isInteractionByAnotherSession) {
                this.avatar.isControlledByUser = true;
            }
            this.movementKeys[key as keyof KeyStatus] = true;
            this.cancelCharacterInteraction();
        }

        switch (key) {
            case "KeyC": {
                if (!this.avatar.isInteractionByAnotherSession) {
                    this.avatar.isControlledByUser = true;
                }
                this.toggleCrouch();
                break;
            }
            case "Escape": {
                this.cancelCharacterInteraction();
                break;
            }
            case "ShiftLeft": {
                this.run();
                break;
            }
            // ... (rest of interaction key presses remain the same)
        }
    };

    private _onKeyUp = (event: KeyboardEvent): void => {
        const key = event.code;
        if (key in this.movementKeys) {
            this.movementKeys[key as keyof KeyStatus] = false;
            if (Object.values(this.movementKeys).every((v) => v === false)) {
                if (!this.avatar.isInteractionByAnotherSession) {
                    this.avatar.setNotControlledByUser();
                }
            }
        }
        if (key === "ShiftLeft") this.walk();
    };

    private _updateCharacterAnimation(): void {
        if (this.avatar.isControlledByAnotherSession || this.avatar.interaction)
            return;

        // play jump animation if not on ground
        if (!this.avatar.isGrounded) {
            this.avatar.playAnimation("Jump");
            return;
        }

        // play correct movement animation based on velocity
        if (this.avatar.avatarBody.capsule) {
            const velocity = this.avatar.avatarBody.capsule.getLinearVelocity();

            if (Math.abs(velocity.x) <= 0.02 && Math.abs(velocity.z) <= 0.02) {
                if (this.avatar.isCrouching) {
                    this.avatar.playAnimation("Crouch");
                    return;
                }

                this.avatar.playAnimation("Idle");
                return;
            }

            if (this.avatar.isCrouching) {
                this.avatar.playAnimation("CrouchWalk");
                return;
            } else if (this.avatar.isRunning) {
                this.avatar.playAnimation("Run");
                return;
            } else {
                this.avatar.playAnimation("Walk");
                return;
            }
        }

        // play idle animation by default
        this.avatar.playAnimation("Idle");
    }

    private _updateCamera(): void {
        // get avatar head position
        const newPosition = this.avatar.root.position.add(
            new Vector3(
                0,
                this.avatar.isCrouching
                    ? this.avatar.headHeight * 0.5
                    : this.avatar.headHeight,
                0
            )
        );

        // get move delta and update old position
        const delta = newPosition.sub(this.oldCameraPosition);
        this.oldCameraPosition.copy(newPosition);

        this.camera.position.add(delta);

        const headPosition = new Vector3();
        this.avatar.customHeadNode.getWorldPosition(headPosition);
        this.controls.target.copy(headPosition);

        // TODO_THREE: Implement camera-wall collision using physics raycasting.
        // this._updateRaycaster();
        // this._smoothlyControlCameraDistance();
    }

    private _updateCharacter(deltaTime: number): void {
        // ... (update audio position logic is fine)

        if (!this.avatar.isReady || this.avatar.isControlledByAnotherSession)
            return;
        if (this.avatar.interaction?.type === "continuous") return;

        // --- Sync avatar rotation with camera in first-person mode ---
        if (this._xr?.isPresenting || this._cameraMode === "firstPerson") {
            const cameraToUse = this._xrCamera ?? this.camera;
            const targetQuaternion = new Quaternion();
            // Get camera's world quaternion, but only the Y-axis rotation (yaw)
            cameraToUse.getWorldQuaternion(targetQuaternion);
            const euler = new Vector3().setFromQuaternion(targetQuaternion, "YXZ");
            targetQuaternion.setFromAxisAngle(new Vector3(0, 1, 0), euler.y);

            this.avatar.root.quaternion.slerp(targetQuaternion, 0.1); // slerp for smoothness
        }

        this.moveDirection.set(0, 0, 0);

        // when joystick is moved
        if (
            Math.abs(this._joystickAxes.x) > AvatarController.JOYSTICK_DEADZONE ||
            Math.abs(this._joystickAxes.y) > AvatarController.JOYSTICK_DEADZONE
        ) {
            if (!this.avatar.isInteractionByAnotherSession) {
                this.avatar.isControlledByUser = true;
            }
            this.cancelCharacterInteraction();
            // useGlobalModalStoreImmediate.getState().setOpenAvatarInteractionModal(false);

            this.avatar.isMoving = true;

            // ENTERING_XR = 0, EXITING_XR = 1, IN_XR = 2, NOT_IN_XR = 3
            if (this._xrState === 1 || this._xrState === 3) {
                // calculate the rotation angle based on joystick's x and y
                const joystickAngle = Math.atan2(
                    -this._joystickAxes.x,
                    -this._joystickAxes.y
                );

                // calculate towards camera direction
                const angleYCameraDirection = Math.atan2(
                    this.camera.position.x - this.avatar.root.position.x,
                    this.camera.position.z - this.avatar.root.position.z
                );

                if (this._cameraMode === "thirdPerson") {
                    // rotate mesh with respect to camera direction with lerp
                    if (this.avatar.root.rotationQuaternion === null) {
                        this.avatar.root.rotationQuaternion = Quaternion.Identity();
                    }
                    this.avatar.root.rotationQuaternion = Quaternion.Slerp(
                        this.avatar.root.rotationQuaternion,
                        Quaternion.RotationAxis(
                            Vector3.Up(),
                            angleYCameraDirection + joystickAngle
                        ),
                        getSlerpValue(1 / this.scene.getAnimationRatio(), 0.05, 0.2)
                    );
                }
            }

            // ========================================================
            // move physics body

            // normalize to 1 for joystic x and y for controlled movement speed
            const { x, y } = normalizeToMaxOne(
                this._joystickAxes.x,
                this._joystickAxes.y
            );
            this.moveDirection.set(x, 0, y);
            this.moveDirection.scaleInPlace(this._moveSpeed);

            // Convert the quaternion to Euler angles
            const cameraEuler = this.camera.absoluteRotation.toEulerAngles();

            // Create a new quaternion that only includes the Y-axis (yaw) rotation
            const targetQuaternion = Quaternion.RotationYawPitchRoll(
                cameraEuler.y,
                0,
                0
            );

            // move relative to camera's rotation
            if (this._xrState === 1 || this._xrState === 3) {
                this.moveDirection.rotateByQuaternionToRef(
                    targetQuaternion,
                    this.moveDirection
                );
            } else if (this._xrCamera) {
                this.moveDirection.rotateByQuaternionToRef(
                    this._xrCamera.absoluteRotation,
                    this.moveDirection
                );
            }

            // get y velocity to make it behave properly
            const vel = this.avatar.avatarBody.capsule.getLinearVelocity();
            this.moveDirection.y = vel.y;

            // move
            this.avatar.avatarBody.capsule.setLinearVelocity(this.moveDirection);
        } else {
            // if non of the movement keys are pressed and are not in
            // interaction by other session, free other avatars in other sessions
            if (!this.avatar.isInteractionByAnotherSession) {
                this.avatar.setNotControlledByUser();
            }
            setTimeout(() => {
                if (!this.avatar.isInteractionByAnotherSession) {
                    this.avatar.setNotControlledByUser();
                }
            }, 8);

            // slows down the avatar when not moving
            const velocity = this.avatar.avatarBody.capsule.getLinearVelocity();
            let drag = 0.85;
            // apply less drag in the air
            if (!this.avatar.isGrounded) drag = 0.95;
            this.avatar.avatarBody.capsule.setLinearVelocity(
                new Vector3(velocity.x * drag, velocity.y, velocity.z * drag)
            );

            this.avatar.isMoving = false;
        }

        // Keyboard input
        const forward =
            !!this.movementKeys["KeyW"] || !!this.movementKeys["ArrowUp"];
        const backward =
            !!this.movementKeys["KeyS"] || !!this.movementKeys["ArrowDown"];
        const left =
            !!this.movementKeys["KeyA"] || !!this.movementKeys["ArrowLeft"];
        const right =
            !!this.movementKeys["KeyD"] || !!this.movementKeys["ArrowRight"];

        if (forward || backward || left || right) {
            this.avatar.isMoving = true;

            this.frontVector.set(0, 0, Number(forward) - Number(backward));
            this.sideVector.set(Number(left) - Number(right), 0, 0);

            this.moveDirection.set(
                this.frontVector.x - this.sideVector.x,
                0,
                this.frontVector.z - this.sideVector.z
            );
            this.moveDirection.normalize();
            this.moveDirection.scaleInPlace(this._moveSpeed);

            // Convert the quaternion to Euler angles
            const cameraEuler = this.camera.absoluteRotation.toEulerAngles();

            // Create a new quaternion that only includes the Y-axis (yaw) rotation
            const targetQuaternion = Quaternion.RotationYawPitchRoll(
                cameraEuler.y,
                0,
                0
            );

            // move relative to camera's rotation
            if (this._xrState === 1 || this._xrState === 3) {
                this.moveDirection.rotateByQuaternionToRef(
                    targetQuaternion,
                    this.moveDirection
                );
            } else if (this._xrCamera) {
                this.moveDirection.rotateByQuaternionToRef(
                    this._xrCamera.absoluteRotation,
                    this.moveDirection
                );
            }

            // move the mesh by moving the physics body
            const vel = this.avatar.avatarBody.capsule.getLinearVelocity();
            this.moveDirection.y = vel.y;

            // TODO: don't allow velocity acceleration in the air

            this.avatar.avatarBody.capsule.setLinearVelocity(this.moveDirection);

            if (
                // if in third person mode, always rotate mesh with respect to movement direction
                this._cameraMode === "thirdPerson" ||
                // if in first person mode, only rotate mesh when moving forward
                ((this._cameraMode === "firstPerson" || this._xrCamera) && forward)
            ) {
                // calculate towards camera direction
                const angleYCameraDirection = Math.atan2(
                    this.camera.position.x - this.avatar.root.position.x,
                    this.camera.position.z - this.avatar.root.position.z
                );
                // get direction offset
                const directionOffset = this._calculateDirectionOffset();

                // rotate mesh with respect to camera direction with lerp
                if (this.avatar.root.rotationQuaternion === null) {
                    this.avatar.root.rotationQuaternion = Quaternion.Identity();
                }
                this.avatar.root.rotationQuaternion = Quaternion.Slerp(
                    this.avatar.root.rotationQuaternion,
                    Quaternion.RotationAxis(
                        Vector3.Up(),
                        angleYCameraDirection + directionOffset
                    ),
                    getSlerpValue(1 / this.scene.getAnimationRatio(), 0.05, 0.2)
                );
            }
        } else {
            // slows down the avatar when not moving
            const velocity = this.avatar.avatarBody.capsule.getLinearVelocity();
            let drag = 0.85;
            // apply less drag in the air
            if (!this.avatar.isGrounded) drag = 0.95;
            this.avatar.avatarBody.capsule.setLinearVelocity(
                new Vector3(velocity.x * drag, velocity.y, velocity.z * drag)
            );

            this.avatar.isMoving = false;
        }

        // --- Apply Movement to Physics Body ---
        // TODO_THREE: This entire section needs to be implemented with a physics engine.
        if (this.avatar.avatarBody.capsule) {
            // const currentVelocity = this.avatar.avatarBody.capsule.getLinearVelocity(); // Get velocity from physics body
            // this.moveDirection.y = currentVelocity.y; // Preserve vertical velocity
            // this.avatar.avatarBody.capsule.setLinearVelocity(this.moveDirection); // Set new velocity
        } else if (this.avatar.isMoving) {
            // Fallback for movement without physics (for testing)
            const cameraDirection = new Vector3();
            this.camera.getWorldDirection(cameraDirection);
            const flatDirection = new Vector3(
                cameraDirection.x,
                0,
                cameraDirection.z
            ).normalize();
            const rightDirection = new Vector3()
                .crossVectors(this.camera.up, flatDirection)
                .normalize();

            const finalMove = new Vector3();
            if (forward) finalMove.add(flatDirection);
            if (backward) finalMove.sub(flatDirection);
            if (left) finalMove.sub(rightDirection);
            if (right) finalMove.add(rightDirection);

            finalMove.normalize().multiplyScalar(this._moveSpeed * deltaTime);
            this.avatar.root.position.add(finalMove);

            // Rotate avatar to face movement direction
            if (this._cameraMode === "thirdPerson") {
                const lookAtQuaternion = new Quaternion().setFromUnitVectors(
                    new Vector3(0, 0, 1),
                    finalMove.clone().normalize()
                );
                this.avatar.root.quaternion.slerp(lookAtQuaternion, 0.1);
            }
        }

        // --- Handle Jumping and Stairs ---
        // TODO_THREE: Physics-dependent logic
        // this._handleJumping(deltaTime);
        // this._handleStairs();
    }

    /**
     * Make avatar head look at where the camera is looking
     */
    private _updateCharacterHead(): void {
        // TODO
    }

    private _handleJumping(): void {
        // TODO
    }

    private _handleStairs(): void {
        // TODO
    }

    // this prevents camera from clipping through walls
    private _updateRaycaster() {
        // TODO
    }

    // ... (handleJumping, handleStairs, updateCharacterHead, raycasting methods are all physics/Babylon-specific)
    // They need to be completely re-written with a Three.js physics engine and custom logic.

    switchToFirstPersonMode(animationTime: number = 0.2): void {
        if (this._isCameraModeTransitioning) return;
        this._isCameraModeTransitioning = true;

        // TODO_THREE: Implement with a tweening library like GSAP or TWEEN.js
        // Example with a conceptual tween:
        // new TWEEN.Tween(this.controls)
        //   .to({ maxDistance: 0.001 }, animationTime * 1000)
        //   .easing(TWEEN.Easing.Cubic.In)
        //   .onComplete(() => {
        //     this._isCameraModeTransitioning = false;
        //     this._cameraMode = "firstPerson";
        //     this.avatar.hide();
        //   })
        //   .start();
        // new TWEEN.Tween(this.camera)
        //   .to({ fov: AvatarController.FOV_FIRSTPERSON }, animationTime * 1000)
        //   .easing(TWEEN.Easing.Cubic.In)
        //   .start();
    }

    switchToThirdPersonMode(animationTime: number = 0.2): void {
        if (this._isCameraModeTransitioning) return;
        this._isCameraModeTransitioning = true;
        this.avatar.show();

        // TODO_THREE: Implement with a tweening library
        // new TWEEN.Tween(this.controls)
        //   .to({ maxDistance: AVATAR_PARAMS.CAMERA_RADIUS_UPPER_AVATAR }, animationTime * 1000)
        //   .easing(TWEEN.Easing.Cubic.Out)
        //   .onComplete(() => {
        //     this._isCameraModeTransitioning = false;
        //     this._cameraMode = "thirdPerson";
        //   })
        //   .start();
        // ... tween FOV as well
    }

    setJump(): void {
        // if (this.avatar.adlerEngine.preventAvatarJumping) {
        //     this.avatar.adlerEngine.preventAvatarJumping = false;
        //     return;
        // }
        this.movementKeys.Space = true;
    }

    run() {
        if (this.avatar.isCrouching) return;

        this.setCrouch(false);
        this.avatar.isRunning = true;
        this._moveSpeed = AvatarController.RUN_SPEED;
    }

    walk(): void {
        if (this.avatar.isCrouching) return;

        this.avatar.isRunning = false;
        this._moveSpeed = AvatarController.WALK_SPEED;
    }

    toggleRun(): void {
        if (this.avatar.interaction) return;

        if (this.avatar.isRunning) {
            if (this.avatar.isCrouching) return;
            this.avatar.isRunning = false;
            this._moveSpeed = AvatarController.WALK_SPEED;
        } else {
            this.setCrouch(false);
            this.avatar.isRunning = true;
            this._moveSpeed = AvatarController.RUN_SPEED;
        }
    }

    toggleCrouch(): void {
        if (this.avatar.interaction || !this.avatar.isGrounded) return;

        if (this.avatar.isRunning) {
            this.avatar.isRunning = false;
            this.setCrouch(true);
            return;
        }

        this.avatar.isCrouching = !this.avatar.isCrouching;
        this.setCrouch();
    }

    setCrouch(force?: boolean): void {
        if (force === true) {
            this.avatar.isCrouching = true;
        } else if (force === false) {
            this.avatar.isCrouching = false;
        }

        if (this.avatar.isCrouching) {
            this.avatar.isRunning = false;
            this._moveSpeed = AvatarController.CROUCH_SPEED;
            this.avatar.toggleCrouchCapsuleBody(true);

            // add Y offset so the camera also moves down when crouches down
            this.oldCameraPosition.y += this.avatar.headHeight * 0.5;
        } else if (!this.avatar.isCrouching) {
            this._moveSpeed = this.avatar.isRunning
                ? AvatarController.RUN_SPEED
                : AvatarController.WALK_SPEED;
            this.avatar.toggleCrouchCapsuleBody(false);

            // remove Y offset so the camera also moves up when stands up
            this.oldCameraPosition.y -= this.avatar.headHeight * 0.5;
        }
    }

    stopAllMovements(): void {
        for (const key in this.movementKeys) {
            if (Object.hasOwn(this.movementKeys, key)) {
                this.movementKeys[key as keyof KeyStatus] = false;
            }
        }
    }

    setJoystickAxes(x: number, y: number): void {
        this._joystickAxes.x = x;
        this._joystickAxes.y = y;
    }

    setXRState(state: 0 | 1 | 2 | 3): void {
        this._xrState = state;
    }

    setXRCamera(camera: XRCamera): void {
        this._xrCamera = camera;
    }

    dispose(): void {
        this.stop();
        this._removeEventListeners();
    }
}

export default AvatarController;
