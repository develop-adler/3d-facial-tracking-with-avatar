import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { toast } from "react-toastify";

import type Atom from "@/3d/space/Atom";
import eventBus from "@/eventBus";
import type { Asset } from "@/models/common";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { clientSettings } from "clientSettings";
import { TOAST_TOP_OPTIONS } from "constant";

import type { Mesh } from "@babylonjs/core/Meshes/mesh";

class Skybox {
    readonly atom: Atom;
    readonly mesh: Mesh;

    isEnvMapReady: boolean = false; // set to true when env map is ready

    constructor(atom: Atom) {
        this.atom = atom;
        this.mesh = this._createSkyboxMesh();
    }

    get coreScene() {
        return this.atom.coreScene;
    }
    get scene() {
        return this.coreScene.scene;
    }

    private _createSkyboxMesh() {
        const skybox = CreateBox("skybox", { size: 1000 }, this.scene);
        skybox.isPickable = false;
        skybox.infiniteDistance = true;
        skybox.ignoreCameraMaxZ = true;
        skybox.alwaysSelectAsActiveMesh = true;
        skybox.doNotSyncBoundingInfo = true;
        skybox.freezeWorldMatrix();
        skybox.convertToUnIndexedMesh();

        // hide skybox by default
        skybox.setEnabled(useLiveKitStore.getState().skyboxEnabled);

        return skybox;
    }

    async load(
        assetId: string = useLiveKitStore.getState().skyboxId,
        intensity: number = useLiveKitStore.getState().skyboxIntensity,
        showSkybox: boolean = useLiveKitStore.getState().skyboxEnabled,
        isChangeSkybox: boolean = false
    ) {
        this.mesh.setEnabled(showSkybox);

        let asset: Asset;
        try {
            asset = await this.coreScene.coreEngine.loadAsset(assetId, "skyboxs");
        } catch (error) {
            if (clientSettings.DEBUG) console.error("Failed to load skybox:", error);
            toast("Failed to load skybox", TOAST_TOP_OPTIONS);
            return;
        }

        const resourceLow = await this.coreScene.coreEngine.getAssetFilePath(
            assetId + "_low",
            "/static/" + asset.path + "/resource_low.env"
        );

        // Skybox material
        let hdrSkyboxMaterial = this.mesh.material as StandardMaterial | null;

        if (!hdrSkyboxMaterial) {
            hdrSkyboxMaterial = new StandardMaterial("hdrSkyBoxMaterial", this.scene);
            hdrSkyboxMaterial.backFaceCulling = false;
            // hdrSkyboxMaterial.microSurface = 1.0;
            hdrSkyboxMaterial.disableLighting = true;
            hdrSkyboxMaterial.twoSidedLighting = true;

            this.mesh.material = hdrSkyboxMaterial;
        }

        const sceneEnvMapTexture = CubeTexture.CreateFromPrefilteredData(
            resourceLow.url,
            this.scene,
            ".env",
            false
        );
        const reflectionTexture = sceneEnvMapTexture.clone();

        if (isChangeSkybox) {
            // wait for textures to finish loading
            await Promise.all([
                new Promise<void>((resolve) => {
                    sceneEnvMapTexture.onLoadObservable.addOnce(() => {
                        resolve();
                    });
                }),
                new Promise<void>((resolve) => {
                    reflectionTexture.onLoadObservable.addOnce(() => {
                        resolve();
                    });
                }),
            ]);

            for (const mesh of this.scene.meshes) {
                mesh.material?.unfreeze();
            }

            this.scene.blockMaterialDirtyMechanism = true;

            this.scene.environmentTexture?.dispose();
            this.scene.environmentTexture = sceneEnvMapTexture;

            // update skybox material
            const skyboxMaterial = this.mesh.material as PBRMaterial;
            skyboxMaterial.reflectionTexture?.dispose();
            skyboxMaterial.reflectionTexture = reflectionTexture;
            skyboxMaterial.reflectionTexture.coordinatesMode = 5; // SKYBOX_MODE
            skyboxMaterial.markDirty(true);

            this.scene.blockMaterialDirtyMechanism = false;
        } else {
            this.scene.environmentTexture?.dispose();
            this.scene.environmentTexture = sceneEnvMapTexture;
            this.scene.environmentIntensity = intensity;

            hdrSkyboxMaterial.reflectionTexture?.dispose();
            hdrSkyboxMaterial.reflectionTexture = reflectionTexture;
            hdrSkyboxMaterial.reflectionTexture.coordinatesMode = 5;
        }

        this.scene.onAfterRenderObservable.addOnce(() => {
            for (const mesh of this.scene.meshes) {
                mesh.material?.freeze();
            }
        });

        const loadHighLODSkybox = async () => {
            const resource = await this.coreScene.coreEngine.getAssetFilePath(
                assetId,
                "/static/" + asset.path + "/resource.env"
            );
            const cubeTexture = CubeTexture.CreateFromPrefilteredData(
                resource.url,
                this.scene,
                ".env",
                false
            );
            cubeTexture.coordinatesMode = 5;
            if (cubeTexture.isReady()) {
                hdrSkyboxMaterial.reflectionTexture?.dispose();
                hdrSkyboxMaterial.reflectionTexture = cubeTexture;
                hdrSkyboxMaterial.freeze();
            } else {
                cubeTexture.onLoadObservable.addOnce((texture) => {
                    hdrSkyboxMaterial.reflectionTexture?.dispose();
                    hdrSkyboxMaterial.reflectionTexture = texture;
                    hdrSkyboxMaterial.freeze();
                });
            }
        };

        loadHighLODSkybox();

        useLiveKitStore.setState({
            skyboxId: assetId,
        });

        return new Promise<void>((resolve) => {
            if (sceneEnvMapTexture.isReady()) {
                this.isEnvMapReady = true;
                eventBus.emit(`space:envMapReady:${this.coreScene.room.name}`, this);
                resolve();
            } else {
                sceneEnvMapTexture.onLoadObservable.addOnce(() => {
                    this.isEnvMapReady = true;
                    eventBus.emit(`space:envMapReady:${this.coreScene.room.name}`, this);
                    resolve();
                });
            }
        });
    }

    toggle(force: boolean = false) {
        this.mesh.setEnabled(force ? true : !this.mesh.isEnabled());
        useLiveKitStore.setState({
            skyboxEnabled: this.mesh.isEnabled(),
        });
    }

    setIntensity(intensity: number) {
        for (const mesh of this.scene.meshes) {
            for (const child of mesh.getChildMeshes()) {
                child.material?.unfreeze();
            }
        }

        this.scene.environmentIntensity = intensity;

        this.scene.onAfterRenderObservable.addOnce(() => {
            for (const mesh of this.scene.meshes) {
                for (const child of mesh.getChildMeshes()) {
                    child.material?.freeze();
                }
            }
        });
    }

    dispose() {
        this.mesh.dispose(false, true);
        this.scene.environmentTexture?.dispose();
        // eslint-disable-next-line unicorn/no-null
        this.scene.environmentTexture = null;
        this.isEnvMapReady = false;
    }
}

export default Skybox;
