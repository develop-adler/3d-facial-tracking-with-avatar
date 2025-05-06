// for pointer pick events, scene.pick() and to fix error:
// "Ray needs to be imported before as it contains a side-effect required by your code."
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Physics/v2/physicsEngineComponent"; // for .getPhysicsEngine() .enablePhysics() function
import "@babylonjs/core/Rendering/boundingBoxRenderer"; // for occlusion queries

// import { Animation } from "@babylonjs/core/Animations/animation";
// import { CubicEase } from "@babylonjs/core/Animations/easing";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";

import type { CoreEngine } from "@/3d/CoreEngine";
import Atom from "@/3d/Multiplayer/Atom";
import Avatar from "@/3d/Multiplayer/Avatar";
import AvatarController from "@/3d/Multiplayer/AvatarController";
import eventBus from "@/eventBus";
import { isMobile } from "@/utils/browserUtils";

import {
    AVATAR_CONTROLLER_PARAMS,
    AVATAR_PARAMS,
    MULTIPLAYER_PARAMS,
    WORLD_GRAVITY,
} from "constant";

// import type { AssetContainer } from "@babylonjs/core/assetContainer";
// import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
// import type { Observer } from "@babylonjs/core/Misc/observable";
// import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import type { Room } from "livekit-client";

class MultiplayerScene {
    readonly coreEngine: CoreEngine;
    readonly room: Room;
    readonly scene: Scene;
    readonly camera: ArcRotateCamera;
    readonly atom: Atom;
    avatar?: Avatar;
    avatarController?: AvatarController;

    isPhysicsEnabled: boolean = false;

    constructor(room: Room, coreEngine: CoreEngine) {
        this.coreEngine = coreEngine;
        this.room = room;

        this.scene = this._createBabylonScene();
        this.camera = this._createCamera(this.scene);
        this.atom = new Atom(this);

        this.coreEngine.engine.runRenderLoop(this._renderScene.bind(this));
    }

    private _createBabylonScene(): Scene {
        const scene = new Scene(this.coreEngine.engine, {
            useGeometryUniqueIdsMap: true,
            useMaterialMeshMap: true, // speed-up the disposing of Material by reducing the time spent to look for bound meshes
            useClonedMeshMap: true, // speed-up the disposing of Mesh by reducing the time spent to look for associated cloned meshes
        });

        // disable the default scene clearing behavior
        scene.autoClear = false; // Color buffer
        scene.autoClearDepthAndStencil = true; // Depth and stencil

        // for avatar and gift occlusion culling
        scene.setRenderingAutoClearDepthStencil(1, false, false, false);
        scene.setRenderingAutoClearDepthStencil(2, false, false, false);

        // set transparent background color
        scene.clearColor = new Color4(0, 0, 0, 0);

        scene.skipPointerMovePicking = true;
        scene.skipPointerDownPicking = true;
        scene.skipPointerUpPicking = true;

        scene.pointerMovePredicate = () => false;
        scene.pointerDownPredicate = () => false;
        scene.pointerUpPredicate = () => false;
        scene.constantlyUpdateMeshUnderPointer = false;

        scene.audioEnabled = false;
        scene.collisionsEnabled = false;
        scene.fogEnabled = false;
        scene.lightsEnabled = false;
        scene.shadowsEnabled = false;

        // if (!isSafari()) {
        //   this._gpuPicker = new GPUPicker();
        //   scene.skipPointerUpPicking = true;
        // }

        const enableHavokPhysics = (havok: HavokPhysicsWithBindings) => {
            // enable havok physics with gravity
            const havokPlugin = new HavokPlugin(true, havok);
            const gravityVector = new Vector3(0, WORLD_GRAVITY, 0);
            scene.enablePhysics(gravityVector, havokPlugin);

            this.isPhysicsEnabled = true;
            eventBus.emit(`space:scenePhysicsEnabled:${this.room.name}`, scene);
        };

        if (this.coreEngine.havok) {
            enableHavokPhysics(this.coreEngine.havok);
        } else if (this.coreEngine.isSettingUpHavok) {
            eventBus.onceWithEvent<HavokPhysicsWithBindings>(
                "havok:ready",
                (havok) => {
                    enableHavokPhysics(havok);
                }
            );
        } else {
            this.coreEngine
                .createHavokPhysics()
                .then((havok) => enableHavokPhysics(havok));
        }

        eventBus.emit(`space:sceneCreated:${this.room.name}`, scene);
        this.coreEngine.spaceLoadingData.space_scene_created =
            performance.now() - this.coreEngine.spaceLoadingData.space_initialized;

        return scene;
    }

    private _createCamera(scene: Scene): ArcRotateCamera {
        const camera = new ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            MULTIPLAYER_PARAMS.DEFAULT_CAMERA_RADIUS,
            Vector3.FromArray(MULTIPLAYER_PARAMS.CAMERA_TARGET_PREVIEW),
            scene,
            true
        );
        scene.activeCamera = camera;

        // disable panning
        camera.panningSensibility = 0;

        // dampen rotation
        camera.inertia = 0.8;

        camera.minZ = MULTIPLAYER_PARAMS.CAMERA_MINZ;
        camera.maxZ = MULTIPLAYER_PARAMS.CAMERA_MAXZ;

        // disable rotation using keyboard arrow key
        camera.keysUp = [];
        camera.keysDown = [];
        camera.keysLeft = [];
        camera.keysRight = [];

        // lower rotation sensitivity, higher value = less sensitive
        camera.angularSensibilityX =
            MULTIPLAYER_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_PREVIEW;
        camera.angularSensibilityY =
            MULTIPLAYER_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_PREVIEW;

        // remove camera limitations
        // eslint-disable-next-line unicorn/no-null
        camera.lowerBetaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        camera.upperBetaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        camera.lowerAlphaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        camera.upperAlphaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        camera.lowerRadiusLimit = null;
        // eslint-disable-next-line unicorn/no-null
        camera.upperRadiusLimit = null;

        camera.fov = 0.8;

        const cameraPosition = new Vector3(5, 5, 5);
        camera.setPosition(cameraPosition);

        camera.attachControl();

        eventBus.emit(`space:cameraCreated:${this.room.name}`, camera);

        return camera;
    }
    setCameraToAvatar(): void {
        this.camera.maxZ = MULTIPLAYER_PARAMS.CAMERA_MAXZ;

        // disable panning
        this.camera.panningSensibility = 0;

        // lower zooming sensitivity on mobile
        this.camera.pinchPrecision = 200;
        this.camera.wheelPrecision = 100;

        this.camera.radius = MULTIPLAYER_PARAMS.DEFAULT_CAMERA_RADIUS;

        const aspectRatio = this.coreEngine.engine.getAspectRatio(this.camera);
        this.camera.fov =
            aspectRatio > 0.7
                ? AVATAR_CONTROLLER_PARAMS.FOV_THIRDPERSON
                : AVATAR_CONTROLLER_PARAMS.FOV_THIRDPERSON_MOBILE;

        // camera min distance and max distance
        this.camera.lowerRadiusLimit = AVATAR_PARAMS.CAMERA_RADIUS_LOWER_AVATAR;
        this.camera.upperRadiusLimit = AVATAR_PARAMS.CAMERA_RADIUS_UPPER_AVATAR;

        //  lower rotation sensitivity, higher value = less sensitive
        this.camera.angularSensibilityX = isMobile()
            ? AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR_MOBILE
            : AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;
        this.camera.angularSensibilityY = isMobile()
            ? AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR_MOBILE
            : AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;

        // limit up and down rotation range
        this.camera.lowerBetaLimit = AVATAR_PARAMS.CAMERA_BETA_LOWER_LIMIT_AVATAR; // looking down (divided by lower value = lower angle)
        this.camera.upperBetaLimit = AVATAR_PARAMS.CAMERA_BETA_UPPER_LIMIT_AVATAR; // looking up (divided by higher value = lower angle)

        // remove horizontal rotation limitation
        // eslint-disable-next-line unicorn/no-null
        this.camera.lowerAlphaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        this.camera.upperAlphaLimit = null;
    }

    /**
     * set the camera's parameters to be preview-ready
     */
    private _setCameraToPreview(): void {
        // lower rotation sensitivity, higher value = less sensitive
        this.camera.angularSensibilityX =
            MULTIPLAYER_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_PREVIEW;
        this.camera.angularSensibilityY =
            MULTIPLAYER_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_PREVIEW;

        // remove limitations
        // eslint-disable-next-line unicorn/no-null
        this.camera.lowerBetaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        this.camera.upperBetaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        this.camera.lowerAlphaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        this.camera.upperAlphaLimit = null;
        // eslint-disable-next-line unicorn/no-null
        this.camera.lowerRadiusLimit = null;
        // eslint-disable-next-line unicorn/no-null
        this.camera.upperRadiusLimit = null;

        this.camera.setPosition(new Vector3(5, 5, 5));
        this.camera.setTarget(new Vector3(0, 3, 0));
    }

    private _renderScene(): void {
        if (this.scene.activeCamera) {
            this.scene.render();
        }
    }

    dispose() {
        this.coreEngine.engine.stopRenderLoop(this._renderScene);
    }
}

export default MultiplayerScene;
