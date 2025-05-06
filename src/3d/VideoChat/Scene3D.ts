import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import type { CoreEngine } from "@/3d/CoreEngine";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

export class Scene3D {
    readonly coreEngine: CoreEngine;
    readonly scene: Scene;
    readonly camera: ArcRotateCamera;
    light?: HemisphericLight;
    skybox?: Mesh;
    envMap?: CubeTexture;

    constructor(coreEngine: CoreEngine, light: boolean = true) {
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
        this.light = light ? new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        ) : undefined;

        this.setupScene(this.light);
        
        this.coreEngine.engine.runRenderLoop(this._runRenderLoop.bind(this));
    }

    setupScene(light?: HemisphericLight) {
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

        if (light) {
            light.diffuse.set(1, 1, 1);
            light.intensity = 1.5;
        }
    }

    _runRenderLoop() {
        if (this.scene.activeCamera) this.scene.render();
    }

    dispose() {
        this.light?.dispose();
        this.light = undefined;
        this.envMap?.dispose();
        this.envMap = undefined;
        this.camera.dispose();
        this.coreEngine.engine.stopRenderLoop(this._runRenderLoop.bind(this));
        this.scene.dispose();
    }
}
