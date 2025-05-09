import { Engine } from "@babylonjs/core/Engines/engine";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { DracoCompression } from "@babylonjs/core/Meshes/Compression/dracoCompression";
import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2";
import { Logger } from "@babylonjs/core/Misc/logger";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

import type { SpaceLoadingPerformance } from "@/models/3d";
import eventBus from "@/eventBus";

import type { HavokPhysicsWithBindings } from "@babylonjs/havok";

registerBuiltInLoaders();

const SafeCanvas = (() =>
    typeof document === 'undefined' ?
        {
            getContext: () => {},
        } as unknown as HTMLCanvasElement :
        document.createElement('canvas'))();

export class CoreEngine {
    private static instance: CoreEngine;
    readonly canvas: HTMLCanvasElement;
    readonly engine: Engine;
    havok?: HavokPhysicsWithBindings;
    isSettingUpHavok: boolean = false;

    spaceLoadingData: SpaceLoadingPerformance;

    private constructor() {
        this.spaceLoadingData = {
            space_data_loaded: -1,
            space_3d_objects_loaded: -1,
            space_scene_created: -1,
            space_avatar_set: -1,
            space_avatar_controller_ready: -1,
            space_initialized: -1,
            space_environment_map_ready: -1,
            space_physics_ready: -1,
            space_avatar_ready: -1,
            space_fst_lod_ready: -1,
            space_vl_lod_ready: -1,
            space_lw_lod_ready: -1,
            space_md_lod_ready: -1,
            space_hg_lod_ready: -1,
            space_uh_lod_ready: -1,
            space_fully_loaded: -1,
        };

        if (typeof document === 'undefined') {
            this.canvas = SafeCanvas;
            this.engine = new NullEngine();
            this.engine.dispose();
            return;
        }

        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.outline = "none";
        this.canvas.style.border = "none";

        globalThis.addEventListener("resize", this.resize.bind(this));
        this.canvas.addEventListener("resize", this.resize.bind(this));

        this.engine = this._createEngine(this.canvas);
    }

    static getInstance(): CoreEngine {
        if (!CoreEngine.instance) {
            CoreEngine.instance = new CoreEngine();
        }
        return CoreEngine.instance;
    }

    private _createEngine(canvas: HTMLCanvasElement): Engine {
        this._setBabylonJSDefaults();
        const engine = new Engine(canvas, true, {
            stencil: true, // for HighlightLayer
            audioEngine: false, // disable audio engine since it's not used
        });
        engine.enableOfflineSupport = false;
        engine.disableManifestCheck = true;

        // render at 1.25x the resolution
        engine.setHardwareScalingLevel(0.8);
        engine.maxFPS = 90;

        this.createHavokPhysics();

        return engine;
    }

    async createHavokPhysics(): Promise<HavokPhysicsWithBindings> {
        this.isSettingUpHavok = true;
        const { default: HavokPhysics } = await import("@babylonjs/havok");
        const havok = await HavokPhysics();
        this.havok = havok;
        this.isSettingUpHavok = false;
        eventBus.emitWithEvent('havok:ready', havok);
        return havok;
    }

    private _setBabylonJSDefaults(): void {
        Logger.LogLevels = Logger.NoneLogLevel;

        KhronosTextureContainer2.URLConfig = {
            jsDecoderModule: "/babylonjs/ktx2/babylon.ktx2Decoder.js",
            jsMSCTranscoder: "/babylonjs/ktx2/transcoder/msc_basis_transcoder.js",
            wasmMSCTranscoder: "/babylonjs/ktx2/transcoder/msc_basis_transcoder.wasm",
            wasmUASTCToASTC: "/babylonjs/ktx2/transcoder/uastc_astc.wasm",
            wasmUASTCToBC7: "/babylonjs/ktx2/transcoder/uastc_bc7.wasm",
            wasmUASTCToRGBA_SRGB:
                "/babylonjs/ktx2/transcoder/uastc_rgba8_srgb_v2.wasm",
            wasmUASTCToRGBA_UNORM:
                "/babylonjs/ktx2/transcoder/uastc_rgba8_unorm_v2.wasm",
            wasmZSTDDecoder: "/babylonjs/ktx2/transcoder/zstddec.wasm",
            wasmUASTCToR8_UNORM: "/babylonjs/ktx2/transcoder/uastc_r8_unorm.wasm",
            wasmUASTCToRG8_UNORM: "/babylonjs/ktx2/transcoder/uastc_rg8_unorm.wasm",
        };

        DracoCompression.Configuration = {
            decoder: {
                wasmUrl: "/babylonjs/draco/draco_wasm_wrapper_gltf.js",
                wasmBinaryUrl: "/babylonjs/draco/draco_decoder_gltf.wasm",
                fallbackUrl: "/babylonjs/draco/draco_decoder_gltf.js",
            },
        };
    }

    insertCanvasToDOM(container: HTMLElement) {
        container.append(this.canvas);
        // call resize to fix the canvas size
        this.resize();
        console.log("Canvas inserted to DOM", container);
    }

    removeCanvasFromDOM(container?: HTMLElement | null) {
        // eslint-disable-next-line unicorn/prefer-dom-node-remove
        (container ?? this.canvas.parentElement)?.removeChild(this.canvas);
        console.log("Canvas removed from DOM", this.canvas);
    }

    resize() {
        this.engine.resize();
    }

    // dispose() {
    //     this.engine.dispose();
    // }
}
