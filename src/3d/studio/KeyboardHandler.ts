import { KeyboardEventTypes, type KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";

import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

type KeyStatus = {
    KeyW: boolean;
    ArrowUp: boolean;
    KeyA: boolean;
    ArrowLeft: boolean;
    KeyS: boolean;
    ArrowRight: boolean;
    KeyD: boolean;
    ArrowDown: boolean;
};

class KeyboardHandler {
    readonly spaceBuilder: SpaceBuilder;
    readonly keyDown = {
        escape: false,
        shift: false,
        control: false,
        meta: false, // mac's command key
    };
    readonly keyStatus: KeyStatus = {
        KeyW: false,
        ArrowUp: false,
        KeyA: false,
        ArrowLeft: false,
        KeyS: false,
        ArrowRight: false,
        KeyD: false,
        ArrowDown: false,
    };
    readonly keyboardObservable: Observer<KeyboardInfo>;

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;

        this.keyboardObservable = this._initKeyboardHandler();
    }
    get scene(): Scene {
        return this.spaceBuilder.scene;
    }

    private _initKeyboardHandler() {
        // keyboard events
        return this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case KeyboardEventTypes.KEYDOWN: {
                    const keyCode = kbInfo.event.code;
                    if (keyCode in this.keyStatus) {
                        this.keyStatus[keyCode as keyof KeyStatus] = true;

                        // const forward =
                        //     !!this.keyStatus["KeyW"] || !!this.keyStatus["ArrowUp"];
                        // const backward =
                        //     !!this.keyStatus["KeyS"] || !!this.keyStatus["ArrowDown"];
                        // const left =
                        //     !!this.keyStatus["KeyA"] || !!this.keyStatus["ArrowLeft"];
                        // const right =
                        //     !!this.keyStatus["KeyD"] || !!this.keyStatus["ArrowRight"];

                        // this.spaceBuilder.forceRenderScene = forward || backward || left || right ? true : false;
                    }

                    switch (kbInfo.event.code) {
                        case "ShiftLeft": {
                            this.keyDown.shift = true;
                            break;
                        }
                        case "ControlLeft": {
                            this.keyDown.control = true;
                            break;
                        }
                        case "MetaLeft": {
                            this.keyDown.meta = true;
                            break;
                        }
                        case "Escape": {
                            this.keyDown.escape = true;
                            break;
                        }
                    }
                    break;
                }
                case KeyboardEventTypes.KEYUP: {
                    const keyCode = kbInfo.event.code;
                    if (keyCode in this.keyStatus) {
                        this.keyStatus[keyCode as keyof KeyStatus] = false;
                    }

                    switch (kbInfo.event.code) {
                        case "ShiftLeft": {
                            this.keyDown.shift = false;
                            break;
                        }
                        case "ControlLeft": {
                            this.keyDown.control = false;
                            break;
                        }
                        case "MetaLeft": {
                            this.keyDown.meta = false;
                            break;
                        }
                        case "Escape": {
                            this.keyDown.escape = false;
                            break;
                        }
                    }
                    break;
                }
            }
        });
    }

    dispose(): void {
        this.keyboardObservable.remove();
    }
}

export default KeyboardHandler;