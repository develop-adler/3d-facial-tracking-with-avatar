import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import type { CoreEngine } from "@/app/3d/CoreEngine";

export class CoreScene {
    readonly coreEngine: CoreEngine;
    readonly scene: Scene;
    readonly camera: ArcRotateCamera;
    readonly light: HemisphericLight;

    constructor(coreEngine: CoreEngine) {
        this.coreEngine = coreEngine;
        this.scene = new Scene(coreEngine.engine);
        this.camera = new ArcRotateCamera(
            "camera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            10,
            Vector3.Zero(),
            this.scene
        );
        this.light = new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        );

        this.setupScene();

        coreEngine.engine.runRenderLoop(() => {
            if (this.scene.activeCamera) this.scene.render();
        });
    }

    setupScene() {
        // disable unused features for better performance
        this.scene.collisionsEnabled = false; // disable collisions
        this.scene.skipPointerMovePicking = true; // disable pointer picking
        this.scene.shadowsEnabled = false; // disable shadows
        this.scene.skipFrustumClipping = true;
        this.scene.renderingManager.maintainStateBetweenFrames = false;

        this.scene.autoClear = true;
        this.scene.clearColor.setAll(0);

        this.camera.position = new Vector3(0, 1.75, 0.7);
        this.camera.target = new Vector3(0, 1.7, 0);

        // disable rotation using keyboard arrow key
        this.camera.keysUp = [];
        this.camera.keysDown = [];
        this.camera.keysLeft = [];
        this.camera.keysRight = [];

        // disable panning
        this.camera.panningSensibility = 0;

        this.camera.fov = 0.7;

        // prevent clipping
        this.camera.minZ = 0.1;
        this.camera.maxZ = 200;

        // lower rotation sensitivity, higher value = less sensitive
        this.camera.angularSensibilityX = 1500;
        this.camera.angularSensibilityY = 1500;

        // limit vertical rotation
        this.camera.lowerBetaLimit = Math.PI / 2.8;
        this.camera.upperBetaLimit = Math.PI / 1.7;

        // limit zoom range
        this.camera.lowerRadiusLimit = 0.5;
        this.camera.upperRadiusLimit = 5;

        this.camera.wheelPrecision = 200;
        // this.camera.attachControl();

        this.light.diffuse.set(1, 1, 1);
        this.light.intensity = 1.5;
    }

    dispose() {
        this.coreEngine.engine.stopRenderLoop();
        this.scene.dispose();
    }
}

export type CoreSceneType = InstanceType<typeof CoreScene>;
