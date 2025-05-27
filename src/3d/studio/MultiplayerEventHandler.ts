import type { Room, RpcInvocationData } from "livekit-client";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import ObjectPlacementHandler from "@/3d/studio/ObjectPlacementHandler";
import SaveStateHandler from "@/3d/studio/SaveStateHandler";
import eventBus, { EventNames } from "@/eventBus";
import type { PlaceObjectRPC, SaveStateRPC, UserRequest } from "@/models/multiplayer";

class MultiplayerEventHandler {
    readonly spaceBuilder: SpaceBuilder;

    /** Key: participant identity (string), value: ObjectPlacementHandler */
    remotePlaceObjectHandlers: Map<string, ObjectPlacementHandler>;
    remoteSaveStateHandlers: Map<string, SaveStateHandler>;

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;
        this.remotePlaceObjectHandlers = new Map<string, ObjectPlacementHandler>();
        this.remoteSaveStateHandlers = new Map<string, SaveStateHandler>();

        for (const [, remoteParticipant] of this.spaceBuilder.multiplayerManager.room.remoteParticipants) {
            const saveStateHandler = new SaveStateHandler(
                this.spaceBuilder,
                remoteParticipant
            );
            this.remoteSaveStateHandlers.set(remoteParticipant.identity, saveStateHandler);
        }

        this.init();
    }
    get room(): Room {
        return this.spaceBuilder.multiplayerManager.room;
    }

    init() {
        this._registerEvent(
            "participant:placingObject",
            this._placingObjectEventListener,
            "participantPlacingObject",
            this._placingObjectRPC
        );
        this._registerEvent(
            "participant:placeObject",
            this._placeObjectEventListener,
            "participantPlaceObject",
            this._placeObjectRPC
        );
        this._registerEvent(
            "studio:saveState",
            this._saveStudioStateEventListener,
            "participantSaveStudioState",
            this._saveStudioStateRPC
        );
        this._registerEvent(
            "studio:undo",
            this._undoStudioEventListener,
            "participantUndoStudio",
            this._undoStudioStateRPC
        );
        this._registerEvent(
            "studio:redo",
            this._redoStudioEventListener,
            "participantRedoStudio",
            this._redoStudioStateRPC
        );
    }

    /**
     * Registers an event listener and an RPC method.
     * @param eventName - The name of the event to listen for.
     * @param eventListener - The listener function that will be called when the event is triggered.
     * @param rpcMethod - The name of the RPC method to register.
     * @param rpcHandler - The handler function for the RPC method.
     */
    private _registerEvent(
        eventName: EventNames,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventListener: (data: any) => void,
        rpcMethod: string,
        rpcHandler: (data: RpcInvocationData) => Promise<string>
    ) {
        eventBus.onWithEvent(eventName, eventListener.bind(this));
        try {
            // unregister the method if it already exists to prevent error
            this.room.unregisterRpcMethod(rpcMethod);
            this.room.registerRpcMethod(rpcMethod, rpcHandler.bind(this));
        } catch {
            // skip errors
        }
    }

    private async _broadcastEvent(
        method: string,
        request: UserRequest
    ) {
        if (request.origin === "other" && this.room.remoteParticipants.size === 0)
            return;

        for (const [, participant] of this.room.remoteParticipants) {
            try {
                await this.room.localParticipant.performRpc({
                    destinationIdentity: participant.identity,
                    method,
                    payload: JSON.stringify(request),
                });
            } catch {
                // skip errors
            }
        }
    }

    private _saveStudioStateEventListener(request: SaveStateRPC) {
        this._broadcastEvent("participantSaveStudioState", request);
    }
    private _undoStudioEventListener(request: SaveStateRPC) {
        this._broadcastEvent("participantUndoStudio", request);
    }
    private _redoStudioEventListener(request: SaveStateRPC) {
        this._broadcastEvent("participantRedoStudio", request);
    }
    private _placingObjectEventListener(request: PlaceObjectRPC) {
        this._broadcastEvent("participantPlacingObject", request);
    }
    private _placeObjectEventListener(request: PlaceObjectRPC) {
        this._broadcastEvent("participantPlaceObject", request);
    }

    /**
     * RPC method to handle placing objects in the studio.
     * This method is called by remote participants when they place an object.
     * @param data - The RPC invocation data containing the payload.
     * @returns A string indicating the success of the operation.
     */
    private async _placingObjectRPC(data: RpcInvocationData) {
        const payload = JSON.parse(data.payload) as PlaceObjectRPC;
        const remoteAvatar = this.spaceBuilder.multiplayerManager.remoteAvatars.get(
            data.callerIdentity
        );
        if (!remoteAvatar) return "error" as string;

        let existingPlacementHandler = this.remotePlaceObjectHandlers.get(
            data.callerIdentity
        );
        if (!existingPlacementHandler) {
            existingPlacementHandler = new ObjectPlacementHandler(
                this.spaceBuilder,
                remoteAvatar
            );
            this.remotePlaceObjectHandlers.set(
                data.callerIdentity,
                existingPlacementHandler
            );
        }

        try {
            await existingPlacementHandler.loadGhostPreviewObject(payload.asset);
        } catch {
            return "error" as string;
        }

        return "ok" as string;
    }

    /**
     * RPC method to handle the actual placement of objects in the studio.
     * This method is called by remote participants when they confirm the placement of an object.
     * @param data - The RPC invocation data containing the payload.
     * @returns A string indicating the success of the operation.
     */
    private async _placeObjectRPC(data: RpcInvocationData) {
        const remoteAvatar = this.spaceBuilder.multiplayerManager.remoteAvatars.get(
            data.callerIdentity
        );
        if (!remoteAvatar) return "error" as string;

        const placementHandler = this.remotePlaceObjectHandlers.get(data.callerIdentity);
        if (!placementHandler) return "error" as string;

        try {
            placementHandler.placeObject();
        } catch {
            return "error" as string;
        }

        return "ok" as string;
    }

    private async _saveStudioStateRPC(data: RpcInvocationData) {
        const handler = this.remoteSaveStateHandlers.get(data.callerIdentity);
        if (!handler) return "error" as string;
        const payload = JSON.parse(data.payload) as SaveStateRPC;
        handler.savedStates = payload.savedStates;
        handler.currentStateIndex = payload.currentStateIndex;
        return "ok" as string;
    }
    private async _undoStudioStateRPC(data: RpcInvocationData) {
        const handler = this.remoteSaveStateHandlers.get(data.callerIdentity);
        if (!handler) return "error" as string;
        handler.undo();
        const payload = JSON.parse(data.payload) as SaveStateRPC;
        handler.savedStates = payload.savedStates;
        handler.currentStateIndex = payload.currentStateIndex;
        return "ok" as string;
    }
    private async _redoStudioStateRPC(data: RpcInvocationData) {
        const handler = this.remoteSaveStateHandlers.get(data.callerIdentity);
        if (!handler) return "error" as string;
        handler.redo();
        const payload = JSON.parse(data.payload) as SaveStateRPC;
        handler.savedStates = payload.savedStates;
        handler.currentStateIndex = payload.currentStateIndex;
        return "ok" as string;
    }

    dispose() {
        eventBus.removeAllListeners("participant:placingObject");
        eventBus.removeAllListeners("participant:placeObject");
        eventBus.removeAllListeners("studio:saveState");
        eventBus.removeAllListeners("studio:undo");
        eventBus.removeAllListeners("studio:redo");

        this.room.unregisterRpcMethod("participantPlacingObject");
        this.room.unregisterRpcMethod("participantPlaceObject");
        this.room.unregisterRpcMethod("participantSaveStudioState");
        this.room.unregisterRpcMethod("participantUndoStudio");
        this.room.unregisterRpcMethod("participantRedoStudio");

        for (const [, handler] of this.remoteSaveStateHandlers) handler.dispose();
        this.remoteSaveStateHandlers.clear();
        for (const [, handler] of this.remotePlaceObjectHandlers) handler.dispose();
        this.remotePlaceObjectHandlers.clear();
    }
}

export default MultiplayerEventHandler;
