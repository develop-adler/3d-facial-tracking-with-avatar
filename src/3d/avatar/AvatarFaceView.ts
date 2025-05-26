import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type Avatar from "@/3d/avatar/Avatar";
import type CoreScene from "@/3d/core/CoreScene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import { MULTIPLAYER_PARAMS } from "constant";

/**
 * This class is responsible for rendering the avatar's face in a picture-in-picture (PIP) canvas.
 * It creates a dedicated camera that focuses on the avatar's face and renders it to a canvas.
 */
class AvatarFaceView {
    readonly coreScene: CoreScene;
    readonly avatar: Avatar;
    readonly camera: ArcRotateCamera;
    readonly positionFacialCameraObserver: Observer<Scene>;
    readonly pipCanvas: HTMLCanvasElement;
    readonly rtTexture: RenderTargetTexture;
    drawCanvasObserver: Observer<Scene>;

    constructor(
        coreScene: CoreScene,
        avatar: Avatar,
        pipCanvas: HTMLCanvasElement
    ) {
        this.coreScene = coreScene;
        this.avatar = avatar;
        this.pipCanvas = pipCanvas;
        this._fixCanvasSize(this.pipCanvas);
        this.camera = this._createFacialExpressionCamera();
        this.positionFacialCameraObserver = this._positionCameraObserver();
        this.rtTexture = this._createRenderTargetTexture();
        this.drawCanvasObserver = this._runSceneRenderObserver();
    }

    private _createFacialExpressionCamera(): ArcRotateCamera {
        const camera = new ArcRotateCamera(
            "facialExpressionCamera",
            -Math.PI * 0.5,
            Math.PI * 0.5,
            MULTIPLAYER_PARAMS.DEFAULT_CAMERA_RADIUS,
            Vector3.FromArray(MULTIPLAYER_PARAMS.CAMERA_TARGET_PREVIEW),
            this.coreScene.scene
        );

        // disable panning
        camera.panningSensibility = 0;

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

        this.coreScene.scene.activeCameras = [camera, this.coreScene.camera];

        return camera;
    }

    private _positionCameraObserver() {
        let avatarIdleTime = 0;
        return this.coreScene.scene.onBeforeRenderObservable.add(() => {
            // set camera position to be in front of the avatar's face and always point at it
            const target = this.avatar.customHeadNode.absolutePosition;
            const inFrontOfFace = target.add(
                this.avatar.root.forward.normalize().scaleInPlace(0.65)
            );
            this.camera.setPosition(inFrontOfFace);
            target.y -= 0.1; // point camera down a bit
            this.camera.target = target;

            // check avatar animation, only show canvas if avatar has stood idle for 1 second
            if (
                !this.avatar.isMoving &&
                !this.avatar.isCrouching &&
                this.avatar.isGrounded
            ) {
                avatarIdleTime += this.coreScene.scene.getEngine().getDeltaTime();
                if (avatarIdleTime > 1000) {
                    this.showCanvas();
                }
            } else {
                avatarIdleTime = 0;
                this.hideCanvas();
            }
        });
    }

    private _createRenderTargetTexture() {
        const { width, height } = this._getCanvasSize();
        const rtTexture = new RenderTargetTexture(
            "pipRTT",
            { width, height },
            this.coreScene.scene,
            {
                doNotChangeAspectRatio: false,
                isCube: false,
            }
        );
        rtTexture.activeCamera = this.camera;
        rtTexture.renderList = this.coreScene.scene.meshes; // or just the avatar parts
        this.coreScene.scene.customRenderTargets.push(rtTexture);

        return rtTexture;
    }

    private _runSceneRenderObserver() {
        const { width, height } = this._getCanvasSize();

        const pipCtx = this.pipCanvas.getContext("2d") as CanvasRenderingContext2D;
        const tempBuffer = new Uint8Array(width * height * 4); // match RTT size

        // check at 60 FPS
        let elapsedTime = 0;
        const fps = 60;
        const observer = this.coreScene.scene.onAfterRenderObservable.add(
            () => {
                elapsedTime += 1000 / fps;
                if (elapsedTime < 1000 / fps) return;
                elapsedTime = 0;

                const { width, height } = this._getCanvasSize();
                if (!this.rtTexture.isReadyForRendering()) return;

                // don't render if the canvas is not visible
                if (
                    this.pipCanvas.style.display === "none" ||
                    this.pipCanvas.style.visibility === "hidden" ||
                    this.pipCanvas.style.opacity === "0"
                ) {
                    return;
                }

                try {
                    // Read RTT contents into tempBuffer
                    this.rtTexture.readPixels(0, 0, tempBuffer);

                    // Convert to ImageData
                    const imageData = pipCtx.createImageData(width, height);
                    imageData.data.set(tempBuffer);

                    // Draw to 2D canvas
                    pipCtx.putImageData(imageData, 0, 0);
                } catch {
                    // empty
                }
            }
        );
        return observer;
    }

    showCanvas() {
        this.pipCanvas.style.opacity = "1";
        this.pipCanvas.style.pointerEvents = "auto";
    }

    hideCanvas() {
        this.pipCanvas.style.opacity = "0";
        this.pipCanvas.style.pointerEvents = "none";
    }

    /**
     * This fixes render target texture image being stretched/squished when drawn to canvas
     * @param canvas Canvas element to fix size
     */
    private _fixCanvasSize(canvas: HTMLCanvasElement) {
        const screenHeight = globalThis.window.innerHeight;
        const scale = 0.35;
        const heightPx = screenHeight * scale; // 35% of screen width
        const widthPx = Math.round(heightPx * (9 / 16)); // 9:16 aspect ratio

        // 1. Set internal drawing resolution
        canvas.width = widthPx;
        canvas.height = heightPx;

        // 2. Set CSS display size to match
        canvas.style.width = `${widthPx}px`;
        canvas.style.height = `${heightPx}px`;
    }

    private _getCanvasSize() {
        return {
            width: this.pipCanvas.width,
            height: this.pipCanvas.height,
        };
    }

    dispose() {
        this.drawCanvasObserver.remove();
        this.coreScene.scene.customRenderTargets = [];
        this.coreScene.scene.activeCameras = [this.coreScene.camera];
        this.camera.dispose();
        this.rtTexture.dispose();
    }
}

export default AvatarFaceView;
