import { Clock, PerspectiveCamera, Scene, Vector3, AmbientLight } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Room } from "livekit-client";

// Import for the physics engine. We are using Rapier instead of Havok.
// import RAPIER from "@dimforge/rapier3d-compat";
// import type { World } from "@dimforge/rapier3d-compat";

import type CoreEngine from "@/3dthree/core/CoreEngine";
import HavokPhysics from "@/3dthree/core/HavokPhysics";
import Atom from "@/3dthree/space/Atom";
import eventBus from "@/eventBus";
import type { AvatarPhysicsShapes } from "@/models/3d";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { isMobile } from "@/utils/browserUtils";
import { deepDispose } from "@/utils/three/deepDispose";
// TODO: Implement this.
// import CreateAvatarPhysicsShape from "@/utils/CreateAvatarPhysicsShape";

import {
    AVATAR_CONTROLLER_PARAMS,
    AVATAR_PARAMS,
    MULTIPLAYER_PARAMS,
    WORLD_GRAVITY,
    // WORLD_GRAVITY,
} from "constant";

import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { clientSettings } from "clientSettings";

class CoreScene {
    readonly coreEngine: CoreEngine;
    readonly room: Room;
    clock: Clock;
    scene: Scene;
    camera: PerspectiveCamera;
    controls: OrbitControls;
    ambientLight: AmbientLight;
    atom: Atom;
    readonly remoteAvatarPhysicsShapes: AvatarPhysicsShapes; // Will now store Rapier.ColliderDesc

    // Physics-related properties
    havokPhysics?: HavokPhysics;
    isPhysicsEnabled: boolean = false;

    private _beforeRenderCallbacks: Set<(deltaTime: number) => void>;
    private _resizeObserver: ResizeObserver;

    constructor(room: Room, coreEngine: CoreEngine) {
        this.coreEngine = coreEngine;
        this.room = room;
        this.remoteAvatarPhysicsShapes = {
            male: {},
            female: {},
            other: {},
        };

        coreEngine.spaceLoadingData.space_initialized = performance.now();
        this._beforeRenderCallbacks = new Set();
        this.clock = new Clock(true);
        this.scene = this._createThreeScene();
        // In Three.js, the camera needs the renderer's DOM element for controls
        const { camera, controls } = this._createCameraAndControls();
        this.camera = camera;
        this.controls = controls;

        // light for MToonMaterial because it uses ShaderMaterial that does not have envMap properties
        this.ambientLight = new AmbientLight(0xFF_FF_FF, 0);
        this.scene.add(this.ambientLight);

        this.atom = new Atom(this); // Assumes Atom class is now Three.js compatible

        this._resizeObserver = new ResizeObserver(() => {
            this._resizeCamera();
        });
        this._resizeObserver.observe(this.coreEngine.renderer.domElement);

        this.runSceneRenderLoop();
    }

    private _createThreeScene(): Scene {
        // Three.js Scene constructor is simpler. The optimization flags from
        // Babylon.js do not have direct equivalents and are handled internally.
        const scene = new Scene();
        this._setupThreeScene(scene);
        return scene;
    }

    private _setupThreeScene(scene: Scene): void {
        // --- COMMENT: Conversion from Babylon.js Scene Setup ---
        // Properties like `autoClear` and `clearColor` are moved from the Scene
        // to the WebGLRenderer in Three.js.

        // disable the default scene clearing behavior
        this.coreEngine.renderer.autoClear = false; // Color buffer
        this.coreEngine.renderer.autoClearDepth = true; // Depth buffer
        this.coreEngine.renderer.autoClearStencil = true; // Stencil buffer

        // --- CANNOT CONVERT DIRECTLY ---
        // `scene.setRenderingAutoClearDepthStencil(1, false, false, false);`
        // Three.js does not have a direct equivalent for managing auto-clearing
        // for specific rendering groups. This effect is typically achieved by
        // creating custom render passes, where you manually control clearing
        // between drawing different sets of objects. This is a more advanced
        // rendering technique.

        // set transparent background color on the renderer
        this.coreEngine.renderer.setClearColor(0x00_00_00, 0);

        // --- CANNOT CONVERT DIRECTLY ---
        // `scene.skipPointer...Picking` & `scene.pointer...Predicate`
        // In Three.js, raycasting (picking) is not automatic. You create a
        // Raycaster and call `intersectObjects` manually, usually on a mouse
        // event. This gives you full control over when picking occurs and which
        // objects are tested, which is how performance is managed. There are
        // no scene-level flags to disable it globally.

        // --- COMMENT: Feature Flags ---
        // `audioEnabled`, `collisionsEnabled`, `fogEnabled`, `lightsEnabled`, `shadowsEnabled`
        // In Three.js, these features are enabled by simply adding the
        // corresponding objects (e.g., AudioListener, Fog, Light) to the scene.
        // If they are not added, they are effectively disabled. No flags needed.

        const enableHavokPhysics = (havokEngine: HavokPhysicsWithBindings) => {
            // enable havok physics with gravity
            const gravityVector = new Vector3(0, WORLD_GRAVITY, 0);
            this.havokPhysics = new HavokPhysics(havokEngine, gravityVector);
            this.isPhysicsEnabled = true;
            eventBus.emit(`space:scenePhysicsEnabled:${this.room.name}`, scene);
            if (clientSettings.DEBUG) console.log("Havok physics enabled for scene.");
        };

        if (this.coreEngine.havok) {
            enableHavokPhysics(this.coreEngine.havok);
        } else {
            this.coreEngine.havokPromise.then((havok) => {
                enableHavokPhysics(havok);
            });
        }

        eventBus.emit(`space:sceneCreated:${this.room.name}`, scene);
        this.coreEngine.spaceLoadingData.space_scene_created =
            performance.now() - this.coreEngine.spaceLoadingData.space_initialized;
    }

    // TODO: Convert this to use Threejs physics shapes
    // private _createAvatarPhysicsShapes(): void {
    //     // This function's logic remains, but the implementation of
    //     // CreateAvatarPhysicsShape must be changed to return Rapier collider
    //     // descriptions (`RAPIER.ColliderDesc`) instead of Babylon physics shapes.
    //     const genders = ["male", "female", "other"] as const;
    //     for (const gender of genders) {
    //         const physicsShapes = this.remoteAvatarPhysicsShapes[gender];
    //         if (!physicsShapes.normal) {
    //             // Now returns a Rapier.ColliderDesc
    //             physicsShapes.normal = CreateAvatarPhysicsShape(
    //                 this.scene,
    //                 gender,
    //                 false,
    //                 true
    //             );
    //         }
    //         if (!physicsShapes.crouch) {
    //             // Now returns a Rapier.ColliderDesc
    //             physicsShapes.crouch = CreateAvatarPhysicsShape(
    //                 this.scene,
    //                 gender,
    //                 true,
    //                 true
    //             );
    //         }
    //     }
    // }

    private _createCameraAndControls(): {
        camera: PerspectiveCamera;
        controls: OrbitControls;
    } {
        const aspectRatio =
            this.coreEngine.renderer.domElement.width /
            this.coreEngine.renderer.domElement.height;

        const camera = new PerspectiveCamera(
            45, // fov in degrees, will be adjusted later
            aspectRatio,
            MULTIPLAYER_PARAMS.CAMERA_MINZ,
            MULTIPLAYER_PARAMS.CAMERA_MAXZ
        );
        camera.position.set(0, 1.8, -2);
        this.scene.add(camera);

        const controls = new OrbitControls(
            camera,
            this.coreEngine.renderer.domElement
        );

        controls.enablePan = false; // `panningSensibility = 0`. This also disables keyboard panning.
        controls.enableDamping = true; // `inertia = 0.8`
        controls.dampingFactor = 0.2; // Lower value = more damping
        controls.rotateSpeed = 0.5; // `angularSensibilityX/Y` (adjust as needed)

        // `lower/upper...Limit = null` is the default in OrbitControls
        controls.minPolarAngle = -Infinity;
        controls.maxPolarAngle = Infinity;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        controls.minDistance = 0;
        controls.maxDistance = Infinity;

        controls.target.set(0, 1.5, 0);

        controls.update(); // Initial update

        eventBus.emit(`space:cameraCreated:${this.room.name}`, camera);

        return { camera, controls };
    }

    assignNewScene(scene: Scene): void {
        this.stopSceneRenderLoop();
        this.isPhysicsEnabled = false;

        // --- COMMENT: Scene Disposal ---
        // `scene.dispose()` in Babylon is comprehensive. In Three.js, you must
        // manually dispose geometries, materials, and textures to free up GPU
        // memory. `scene.clear()` only removes objects from the scene graph.
        // A proper implementation would traverse `this.scene.children`.
        this.scene.traverse((object) => {
            deepDispose(object);
        });
        this.scene.clear();

        this.scene = scene;
        this._setupThreeScene(scene);

        const { camera, controls } = this._createCameraAndControls();
        this.camera = camera;
        this.controls = controls;

        this.atom = new Atom(this);
        this.runSceneRenderLoop();
    }

    switchToMultiplayer(): void {
        // In Three.js, autoClear is on the renderer, not the scene
        this.coreEngine.renderer.autoClear = false;

        this.atom.skybox.toggle(true);
        this._setCameraToMultiplayer();

        // this._createAvatarPhysicsShapes();
    }

    switchToVideoChat(): void {
        this.coreEngine.renderer.autoClear = true;
        this.atom.skybox.toggle(useLiveKitStore.getState().skyboxEnabled);
        this._setCameraToVideoChat();
    }

    private _setCameraToMultiplayer(): void {
        this.camera.far = MULTIPLAYER_PARAMS.CAMERA_MAXZ;

        this.controls.zoomSpeed = 1; // Adjust as needed

        this.controls.minDistance = AVATAR_PARAMS.CAMERA_RADIUS_LOWER_AVATAR;
        this.controls.maxDistance = AVATAR_PARAMS.CAMERA_RADIUS_UPPER_AVATAR;

        this.controls.rotateSpeed = isMobile()
            ? 0.7 // Example value for mobile
            : 0.5; // Example value for desktop

        // `lower/upperBetaLimit` maps to `min/maxPolarAngle` (in radians)
        this.controls.minPolarAngle = AVATAR_PARAMS.CAMERA_BETA_LOWER_LIMIT_AVATAR;
        this.controls.maxPolarAngle = AVATAR_PARAMS.CAMERA_BETA_UPPER_LIMIT_AVATAR;

        // Remove horizontal rotation limits
        this.controls.minAzimuthAngle = -Infinity;
        this.controls.maxAzimuthAngle = Infinity;

        const fov =
            this.coreEngine.canvas.clientWidth / this.coreEngine.canvas.clientHeight >
                0.7
                ? AVATAR_CONTROLLER_PARAMS.FOV_THIRDPERSON
                : AVATAR_CONTROLLER_PARAMS.FOV_THIRDPERSON_MOBILE;

        this.camera.fov = fov;

        this.camera.updateProjectionMatrix();
        this.controls.enabled = true;
    }

    private _setCameraToVideoChat(): void {
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 5;
        this.camera.fov = 45;
        this.camera.updateProjectionMatrix();
        this.controls.enabled = false; // Disable controls for static preview
        this.camera.position.set(0, 1.75, 0.7);
        this.controls.target.set(0, 1.7, 0);
    }

    private _resizeCamera(): void {
        const canvas = this.coreEngine.renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    private _renderScene(): void {
        // Call all before render callbacks
        const deltaTime = this.clock.getDelta();
        for (const callback of this._beforeRenderCallbacks) {
            try {
                callback(deltaTime);
            } catch (error) {
                console.error("Error in before render callback:", error);
            }
        }

        try {
            this.coreEngine.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error("Error rendering scene:", error);
        }
    }

    // TODO: prevent running render loop when scene is not active on-screen
    runSceneRenderLoop(): void {
        // `runRenderLoop` in Babylon is `setAnimationLoop` in Three.js
        this.coreEngine.renderer.setAnimationLoop(this._renderScene.bind(this));
    }

    stopSceneRenderLoop(): void {
        // Pass `null` to stop the animation loop
        // eslint-disable-next-line unicorn/no-null
        this.coreEngine.renderer.setAnimationLoop(null);
    }

    /**
     * Registers a callback function to be executed on every frame, before rendering.
     * This mimics Babylon's onBeforeRenderObservable.
     * @param callback The function to execute. It receives deltaTime in seconds.
     * @returns A function to unregister the callback.
     */
    public addBeforeRenderCallback(callback: (deltaTime: number) => void) {
        this._beforeRenderCallbacks.add(callback);
        return () => {
            this.removeBeforeRenderCallback(callback);
        };
    }

    /**
     * Unregisters a callback function.
     * @param callback The function to remove.
     */
    public removeBeforeRenderCallback(
        callback: (deltaTime: number) => void
    ): void {
        this._beforeRenderCallbacks.delete(callback);
    }

    dispose() {
        this._beforeRenderCallbacks.clear();
        this._resizeObserver.disconnect();
        this.stopSceneRenderLoop();

        this.ambientLight.dispose();
        this.ambientLight = undefined!;

        this.camera.clear();
        this.camera = undefined!;

        this.controls.dispose();
        this.controls = undefined!;

        this.havokPhysics?.dispose();
        this.havokPhysics = undefined;

        this.scene.traverse((object) => {
            deepDispose(object);
        });
        this.scene.clear();
        this.scene = undefined!;

        this.clock.stop(); // Stop the clock if it's running
        this.clock = undefined!;
    }
}

export default CoreScene;
