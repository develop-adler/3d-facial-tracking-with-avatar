import { ACESFilmicToneMapping, Cache, WebGLRenderer, SRGBColorSpace, Vector2 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Rapier physics engine import
// import RAPIER from "@dimforge/rapier3d-compat";

import Resource from "@/3d/assets/Resource";
import eventBus from "@/eventBus";
import ArchitectureAssetsJSON from "@/jsons/asset_architectures.json";
import DecorationAssetsJSON from "@/jsons/asset_decorations.json";
import EntertainmentAssetsJSON from "@/jsons/asset_entertainments.json";
import FurnitureAssetsJSON from "@/jsons/asset_furnitures.json";
import SkyboxAssetsJSON from "@/jsons/asset_skyboxs.json";
import type { SpaceLoadingPerformance } from "@/models/3d";
import type { Asset } from "@/models/common";
import type { StudioObjectType } from "@/models/studio";

import type { HavokPhysicsWithBindings } from "@babylonjs/havok";

type StoredAssets = {
    [key in StudioObjectType]: Record<string, Asset>;
};

const SafeCanvas = (() =>
    typeof document === "undefined"
        ? ({
            getContext: () => {},
        } as unknown as HTMLCanvasElement)
        : document.createElement("canvas"))();

class CoreEngine {
    private static instance: CoreEngine;
    readonly canvas: HTMLCanvasElement;
    readonly renderer: WebGLRenderer;

    havok?: HavokPhysicsWithBindings;
    havokPromise: Promise<HavokPhysicsWithBindings>;
    isSettingUpHavok: boolean = false;
    // rapier?: typeof RAPIER;
    // rapierPromise: Promise<typeof RAPIER>;
    // isSettingUpRapier: boolean = false;

    readonly gltfLoader: GLTFLoader;

    readonly spaceLoadingData: SpaceLoadingPerformance;
    readonly cachedAssets: StoredAssets;
    readonly assetFilePaths: Record<string, Resource>;

    private containerElement?: HTMLElement;
    private _resizeObserver: ResizeObserver;

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
        this._resizeObserver = new ResizeObserver(() => {
            this.resize();
        });

        if (typeof document === "undefined") {
            this.canvas = SafeCanvas;
            this.renderer = undefined!;
            this.gltfLoader = undefined!;
            // this.rapierPromise = Promise.reject("No DOM environment");
            this.havokPromise = Promise.reject("No DOM environment");
            return;
        }

        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.outline = "none";
        this.canvas.style.border = "none";

        this.renderer = this._createRenderer(this.canvas);
        this.gltfLoader = this._createGltfLoader();

        Cache.enabled = true;

        // globalThis.addEventListener("resize", this.resize.bind(this));

        // this.rapierPromise = this.createRapierPhysics();
        this.havokPromise = this.createHavokPhysics();
    }

    static getInstance(): CoreEngine {
        if (!CoreEngine.instance) {
            CoreEngine.instance = new CoreEngine();
        }
        return CoreEngine.instance;
    }

    private _createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
        const renderer = new WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true, // For transparent background
            stencil: true, // For effects like HighlightLayer
            powerPreference: "high-performance",
        });
        // Use sRGB for correct color output
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;

        // --- CANNOT CONVERT DIRECTLY ---
        // `engine.maxFPS = 90;`
        // Three.js syncs to the display's refresh rate by default via
        // requestAnimationFrame. Throttling FPS requires custom logic with
        // a Clock and checking elapsed time in the render loop.

        return renderer;
    }

    private _createGltfLoader(): GLTFLoader {
        const gltfLoader = new GLTFLoader();

        gltfLoader.setMeshoptDecoder(MeshoptDecoder);

        // Configure Draco decoder
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("three/draco/");
        gltfLoader.setDRACOLoader(dracoLoader);

        // Configure KTX2 decoder
        const ktx2Loader = new KTX2Loader();
        ktx2Loader.setTranscoderPath("three/basis/");
        ktx2Loader.detectSupport(this.renderer);
        gltfLoader.setKTX2Loader(ktx2Loader);

        return gltfLoader;
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

    // async createRapierPhysics(): Promise<typeof RAPIER> {
    //     if (this.rapier) return this.rapier;
    //     if (this.isSettingUpRapier) return this.rapierPromise;

    //     this.isSettingUpRapier = true;
    //     // const { default: RAPIER_API } = await import("@dimforge/rapier3d-compat");
    //     await RAPIER.init();
    //     this.rapier = RAPIER;
    //     this.isSettingUpRapier = false;
    //     // TODO: Add new event to eventBus
    //     eventBus.emit("rapier:ready", this.rapier);
    //     return this.rapier;
    // }

    insertCanvasToDOM(container: HTMLElement) {
        this.containerElement = container;
        this._resizeObserver.observe(this.containerElement);

        container.append(this.canvas);
        this.resize();
    }

    removeCanvasFromDOM() {
        if (this.containerElement) {
            this._resizeObserver.unobserve(this.containerElement);
            this.containerElement = undefined;
        }
        this.canvas.remove();
        this.renderer.setClearColor(0x00_00_00, 0);
    }

    resize() {
        if (!this.containerElement) return; // Don't do anything if we're not in the DOM

        const width = this.containerElement.clientWidth;
        const height = this.containerElement.clientHeight;

        // Check if the renderer and canvas size are already correct
        const { width: currentWidth, height: currentHeight } =
            this.renderer.getSize(new Vector2());
        if (currentWidth === width && currentHeight === height) {
            return; // No change needed
        }

        // Update the renderer's size
        this.renderer.setSize(width, height, false);
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

    dispose() {
        this._resizeObserver.disconnect();
        this.renderer.dispose();
        this.gltfLoader.dracoLoader?.dispose();
        this.gltfLoader.ktx2Loader?.dispose();
        this.renderer.dispose();
        // globalThis.removeEventListener("resize", this.resize);
    }
}

export default CoreEngine;