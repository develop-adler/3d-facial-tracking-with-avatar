/* eslint-disable unicorn/no-null */

import { Texture, EquirectangularReflectionMapping, SRGBColorSpace, PMREMGenerator } from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { toast } from "react-toastify";

import type Atom from "@/3dthree/space/Atom";
import eventBus from "@/eventBus";
import type { Asset } from "@/models/common";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";
import { TOAST_TOP_OPTIONS } from "constant";

class Skybox {
    readonly atom: Atom;
    premGenTexture?: Texture; // for objects with MToonMaterial (that extends ShaderMaterial)

    isEnvMapReady: boolean = false;

    constructor(atom: Atom) {
        this.atom = atom;
    }

    get coreScene() {
        return this.atom.coreScene;
    }
    get scene() {
        return this.coreScene.scene;
    }

    /**
     * Loads an HDR environment map and applies it to the scene's background
     * and environment for PBR reflections.
     * @param assetId - The ID of the skybox asset to load.
     * @param intensity - The intensity of the environment lighting.
     * @param showSkybox - Whether the skybox should be visible initially.
     */
    async load(
        assetId: string = useLiveKitStore.getState().skyboxId,
        intensity: number = useLiveKitStore.getState().skyboxIntensity,
        showSkybox: boolean = useLiveKitStore.getState().skyboxEnabled
    ) {
        let asset: Asset;
        try {
            asset = await this.coreScene.coreEngine.loadAsset(assetId, "skyboxs");
        } catch (error) {
            if (clientSettings.DEBUG) console.error("Failed to load skybox:", error);
            toast("Failed to load skybox", TOAST_TOP_OPTIONS);
            return;
        }

        const resourcePath = `/static/${asset.path}/resource.hdr`;
        const resource = await this.coreScene.coreEngine.getAssetFilePath(
            assetId,
            resourcePath
        );

        const rgbeLoader = new RGBELoader();
        const texture = await rgbeLoader.loadAsync(resource.url);

        texture.mapping = EquirectangularReflectionMapping;

        // INFO: https://discourse.threejs.org/t/gltfloader-and-rgbeloader-adding-hdr-texture-to-enviroment/36086/6
        // PMREMGenerator processes the HDR texture into a format suitable for reflections.
        const pmremGenerator = new PMREMGenerator(
            this.coreScene.coreEngine.renderer
        );
        pmremGenerator.compileEquirectangularShader();

        this.premGenTexture = pmremGenerator.fromEquirectangular(texture).texture;

        // need to be set after premGenTexture is set
        texture.colorSpace = SRGBColorSpace;

        // Dispose any previously loaded textures to free up GPU memory.
        this.scene.environment?.dispose();
        // FIX: Check if the background is a texture before disposing.
        if (this.scene.background instanceof Texture) {
            this.scene.background.dispose();
        }

        // Apply the new environment map.
        this.scene.environment = texture;
        this.scene.environmentIntensity = intensity;

        // Clean up the generator.
        pmremGenerator.dispose();

        // Set the initial visibility state.
        this.toggle(showSkybox);

        this.isEnvMapReady = true;
        eventBus.emit(`space:envMapReady:${this.coreScene.room.name}`, this);

        useLiveKitStore.setState({ skyboxId: assetId });
    }

    /**
     * Toggles the visibility of the skybox background.
     * @param force - Optional boolean to force a specific state (true for visible, false for hidden).
     */
    toggle(force?: boolean) {
        const skyboxEnabled = useLiveKitStore.getState().skyboxEnabled;
        const isEnabled = force ?? !skyboxEnabled;

        // To show the skybox, set scene.background to the environment map.
        // To hide it, set scene.background to null.
        this.scene.background = isEnabled ? this.scene.environment : null;

        useLiveKitStore.setState({
            skyboxEnabled: isEnabled,
        });
    }

    /**
     * Sets the intensity of the environment lighting, affecting PBR materials.
     * @param intensity - The new intensity value.
     */
    setIntensity(intensity: number) {
        this.scene.environmentIntensity = intensity;
    }

    /**
     * Disposes of all textures and resources used by the skybox.
     */
    dispose() {
        this.premGenTexture?.dispose();
        this.premGenTexture = undefined;

        this.scene.environment?.dispose();
        // FIX: Check if the background is a texture before disposing.
        if (this.scene.background instanceof Texture) {
            this.scene.background.dispose();
        }

        // Clear the references on the scene object.
        this.scene.environment = null;
        this.scene.background = null;
        this.isEnvMapReady = false;
    }
}

export default Skybox;