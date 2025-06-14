import {
    PerspectiveCamera,
    Vector3,
    WebGLRenderTarget,
    type Scene,
    type WebGLRenderer,
} from "three";
import type Avatar from "@/3dthree/avatar/Avatar";
import type CoreScene from "@/3dthree/core/CoreScene";

import { MULTIPLAYER_PARAMS } from "constant";

class AvatarFaceView {
    readonly coreScene: CoreScene;
    readonly avatar: Avatar;
    readonly camera: PerspectiveCamera;
    readonly pipCanvas: HTMLCanvasElement;
    readonly renderTarget: WebGLRenderTarget;

    private _isRendering: boolean = false;

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
        this.renderTarget = this._createRenderTarget();
    }

    get renderer(): WebGLRenderer {
        return this.coreScene.coreEngine.renderer;
    }
    get scene(): Scene {
        return this.coreScene.scene;
    }

    // This method should be called from the main render loop
    update(deltaTime: number): void {
        this._positionCamera();
        this._checkIdle(deltaTime);

        if (this._isRendering) {
            this._renderToTarget();
        }
    }

    private _createFacialExpressionCamera(): PerspectiveCamera {
        const camera = new PerspectiveCamera(
            45, // fov
            this.pipCanvas.width / this.pipCanvas.height, // aspect
            MULTIPLAYER_PARAMS.CAMERA_MINZ, // near
            MULTIPLAYER_PARAMS.CAMERA_MAXZ // far
        );
        camera.name = "facialExpressionCamera";
        return camera;
    }

    private _positionCamera(): void {
        const leftEye = this.avatar.bones?.find((b) => b.name === "LeftEye");
        const rightEye = this.avatar.bones?.find((b) => b.name === "RightEye");

        const targetPos = new Vector3();
        const cameraPos = new Vector3();

        if (leftEye && rightEye) {
            const leftEyePos = new Vector3().setFromMatrixPosition(leftEye.matrixWorld);
            const rightEyePos = new Vector3().setFromMatrixPosition(rightEye.matrixWorld);
            targetPos.lerpVectors(leftEyePos, rightEyePos, 0.5).add(new Vector3(0, 0.1, 0));
        } else {
            this.avatar.root.getWorldPosition(targetPos);
            targetPos.y += this.avatar.headHeight;
        }

        const forward = new Vector3();
        this.avatar.root.getWorldDirection(forward);
        cameraPos.copy(targetPos).add(forward.multiplyScalar(0.65));

        this.camera.position.copy(cameraPos);
        this.camera.lookAt(targetPos.sub(new Vector3(0, 0.1, 0))); // point down a bit
    }

    private _createRenderTarget(): WebGLRenderTarget {
        const { width, height } = this._getCanvasSize();
        return new WebGLRenderTarget(width, height);
    }

    private _renderToTarget(): void {
        // A more performant way than readPixels is to draw the render target's texture
        // directly to the 2D canvas.
        const pipCtx = this.pipCanvas.getContext("2d");
        if (!pipCtx) return;

        // Temporarily set the renderer to use the render target
        const currentRenderTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera); // Render the scene with the face camera
        this.renderer.setRenderTarget(currentRenderTarget); // Restore original render target

        // Draw the result to the 2D canvas
        pipCtx.clearRect(0, 0, this.pipCanvas.width, this.pipCanvas.height);
        pipCtx.drawImage(this.renderer.domElement, 0, 0, this.pipCanvas.width, this.pipCanvas.height);
    }

    private _checkIdle(_deltaTime: number): void {
        // ... (logic to show/hide canvas based on idle time)
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

    dispose(): void {
        this.renderTarget.dispose();
        // The camera is a JS object, it will be garbage collected.
    }
}

export default AvatarFaceView;
