import { Engine } from "@babylonjs/core/Engines/engine";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

registerBuiltInLoaders();

export class CoreEngine {
    readonly canvas: HTMLCanvasElement;
    readonly engine: Engine;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new Engine(canvas, true);

        // render at twice the resolution
        this.engine.setHardwareScalingLevel(0.5);
    }

    resize() {
        this.engine.resize();
    }

    dispose() {
        this.engine.dispose();
    }
}

export type CoreEngineType = InstanceType<typeof CoreEngine>;
