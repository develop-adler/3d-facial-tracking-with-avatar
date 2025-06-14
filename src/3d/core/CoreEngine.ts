import { Engine } from "@babylonjs/core/Engines/engine";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { DracoCompression } from "@babylonjs/core/Meshes/Compression/dracoCompression";
import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2";
import { Logger } from "@babylonjs/core/Misc/logger";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
// import "@/utils/vrm-loader";
// import "@/utils/vrm-loader-6";
// import "@/utils/vrm";
// import "@/utils/babylon-vrm.es";

import Resource from "@/3d/assets/Resource";
import eventBus from "@/eventBus";
import type { SpaceLoadingPerformance } from "@/models/3d";
import type { Asset } from "@/models/common";
import type { StudioObjectType } from "@/models/studio";
import ArchitectureAssetsJSON from "@/jsons/asset_architectures.json";
import DecorationAssetsJSON from "@/jsons/asset_decorations.json";
import EntertainmentAssetsJSON from "@/jsons/asset_entertainments.json";
import FurnitureAssetsJSON from "@/jsons/asset_furnitures.json";
import SkyboxAssetsJSON from "@/jsons/asset_skyboxs.json";

import type { HavokPhysicsWithBindings } from "@babylonjs/havok";

type StoredAssets = {
    [key in StudioObjectType]: Record<string, Asset>;
};

registerBuiltInLoaders();

const SafeCanvas = (() =>
    typeof document === "undefined"
        ? ({
            getContext: () => { },
        } as unknown as HTMLCanvasElement)
        : document.createElement("canvas"))();

export class CoreEngine {
    private static instance: CoreEngine;
    readonly canvas: HTMLCanvasElement;
    readonly engine: Engine;
    havok?: HavokPhysicsWithBindings;
    isSettingUpHavok: boolean = false;

    readonly spaceLoadingData: SpaceLoadingPerformance;
    readonly cachedAssets: StoredAssets;
    readonly assetFilePaths: Record<string, Resource>;

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
        this.cachedAssets = this.initAssets();
        this.assetFilePaths = {};

        if (typeof document === "undefined") {
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
        eventBus.emitWithEvent("havok:ready", havok);
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
        this.engine.clear(new Color4(0, 0, 0, 0), true, true, true);
        container.append(this.canvas);
        // call resize to fix the canvas size
        this.resize();
    }

    removeCanvasFromDOM() {
        this.canvas.remove();
        this.engine.clear(new Color4(0, 0, 0, 0), true, true, true);
    }

    resize() {
        this.engine.resize();
    }

    initAssets(): StoredAssets {
        const storeResultsToRecord = (results: Asset[]) => {
            const record: Record<string, Asset> = {};
            for (const obj of results) {
                if (!(obj.id in record)) record[obj.id] = obj;
            }
            return record;
        };
        return {
            architectures: storeResultsToRecord(
                ArchitectureAssetsJSON.results as Asset[]
            ),
            decorations: storeResultsToRecord(
                DecorationAssetsJSON.results as Asset[]
            ),
            entertainments: storeResultsToRecord(
                EntertainmentAssetsJSON.results as Asset[]
            ),
            furnitures: storeResultsToRecord(FurnitureAssetsJSON.results as Asset[]),
            skyboxs: storeResultsToRecord(SkyboxAssetsJSON.results as Asset[]),
        };
    }

    async loadAsset(id: string, type: StudioObjectType): Promise<Asset> {
        // check if the asset is already in the cache
        if (this.cachedAssets[type]) {
            if (id in this.cachedAssets[type]) return this.cachedAssets[type][id];
        }

        // // if the asset is not in the cache, load it from the JSON file
        // const assetJSONUrl: Record<StudioObjectType, string> = {
        //     architectures: "@/jsons/asset_architectures.json",
        //     decorations: "@/jsons/asset_decorations.json",
        //     entertainments: "@/jsons/asset_entertainments.json",
        //     furnitures: "@/jsons/asset_furnitures.json",
        //     skyboxs: "@/jsons/asset_skyboxs.json",
        // };

        // const assetJSON: AssetJsonWithResults = await import(assetJSONUrl[type]);

        // if (!assetJSON) {
        //     throw new Error(`Asset JSON for type ${type} not found`);
        // }

        // const record: Record<string, Asset> = {};
        // for (const obj of assetJSON.results) {
        //     if (!(obj.id in record)) record[obj.id] = obj;
        // }
        // this.cachedAssets[type] = record;

        // if (id in record) return record[id];

        throw new Error(`Asset [id ${id}, type ${type}] not found`);
    }

    /**
     * This checks if the asset's file is loadable and returns the asset with file path
     * @param id - The id of the asset
     * @returns The Resource object that has the url to the asset file
     */
    async getAssetFilePath(
        id: string,
        path: string,
        checkAvailability: boolean = true
    ): Promise<Resource> {
        if (id in this.assetFilePaths) {
            const resource = this.assetFilePaths[id];
            if (resource.isChecking) {
                // if the resource is already checking, wait for it to finish
                await new Promise((resolve) => {
                    const interval = setInterval(() => {
                        if (!resource.isChecking) {
                            clearInterval(interval);
                            resolve(resource);
                        }
                    }, 100);
                });
            }
            return resource;
        }

        const resource = new Resource(id, path);

        if (checkAvailability && !resource.checkedAvailability) {
            const available = await resource.checkAvailability();
            if (!available) {
                throw new Error(`Asset file [id ${id}, path ${path}] not found`);
            }
        }

        this.assetFilePaths[id] = resource;

        return resource;
    }

    // dispose() {
    //     this.engine.dispose();
    // }
}
