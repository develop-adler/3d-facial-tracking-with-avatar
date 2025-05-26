import type { Room, RpcInvocationData } from "livekit-client";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import ObjectPlacementHandler from "@/3d/studio/ObjectPlacementHandler";
import eventBus, { EventNames } from "@/eventBus";
import type { PlaceObjectRPC, StudioSavedStates } from "@/models/studio";

class MultiplayerEventHandler {
    readonly spaceBuilder: SpaceBuilder;

    /** Key: participant identity (string), value: ObjectPlacementHandler */
    placeObjectHandlers: Map<string, ObjectPlacementHandler>;
    remoteAvatarSavedStates: Map<string, StudioSavedStates>;

    constructor(spaceBuilder: SpaceBuilder) {
        this.spaceBuilder = spaceBuilder;
        this.placeObjectHandlers = new Map<string, ObjectPlacementHandler>();
        this.remoteAvatarSavedStates = new Map<string, StudioSavedStates>();

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
    }

    /**
     * Registers an event listener and an RPC method for placing objects in the studio.
     * This method is used to handle events with eventBus and to register the corresponding RPC methods.
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

        let existingPlacementHandler = this.placeObjectHandlers.get(
            data.callerIdentity
        );
        if (!existingPlacementHandler) {
            existingPlacementHandler = new ObjectPlacementHandler(
                this.spaceBuilder,
                remoteAvatar
            );
            this.placeObjectHandlers.set(
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

        const placementHandler = this.placeObjectHandlers.get(data.callerIdentity);
        if (!placementHandler) {
            return "error" as string;
        }

        try {
            placementHandler.placeObject();
        } catch {
            return "error" as string;
        }

        return "ok" as string;
    }

    private _placingObjectEventListener(request: PlaceObjectRPC) {
        this._broadcastPlaceObjectEvent("participantPlacingObject", request);
    }

    private _placeObjectEventListener(request: PlaceObjectRPC) {
        this._broadcastPlaceObjectEvent("participantPlaceObject", request);
    }

    private async _broadcastPlaceObjectEvent(
        method: string,
        request: PlaceObjectRPC
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

    dispose() {
        eventBus.removeAllListeners("participant:placingObject");
        eventBus.removeAllListeners("participant:placeObject");
        this.room.unregisterRpcMethod("participantPlacingObject");
        this.room.unregisterRpcMethod("participantPlaceObject");
        for (const [, handler] of this.placeObjectHandlers) handler.dispose();
    }
}

export default MultiplayerEventHandler;
