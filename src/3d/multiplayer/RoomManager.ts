import { RoomEvent, type Room, type RpcInvocationData } from "livekit-client";
import { toast } from "react-toastify";

import eventBus from "@/eventBus";
import type { ConfirmJoinSpace, RequestJoinSpace } from "@/models/multiplayer";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

class RoomManager {
    readonly room: Room;

    constructor(room: Room) {
        this.room = room;
        this._initRoomEvents();
    }

    private _initRoomEvents() {
        this.room.on(
            RoomEvent.ParticipantDisconnected,
            this._onParticipantLeave.bind(this)
        );

        eventBus.onWithEvent<RequestJoinSpace>(
            "multiplayer:requestJoinSpace",
            this._requestJoinSpaceEventListener.bind(this)
        );
        try {
            // unregister the method if it already exists to prevent error
            this.room.unregisterRpcMethod("participantRequestJoinSpace");
            this.room.registerRpcMethod(
                "participantRequestJoinSpace",
                this._requestJoinSpaceRPC.bind(this)
            );
        } catch {
            // empty
        }

        eventBus.onWithEvent<ConfirmJoinSpace>(
            "multiplayer:confirmJoinSpace",
            this._confirmJoinSpaceEventListener.bind(this)
        );
        try {
            // unregister the method if it already exists to prevent error
            this.room.unregisterRpcMethod("participantConfirmJoinSpace");
            this.room.registerRpcMethod(
                "participantConfirmJoinSpace",
                this._confirmJoinSpaceRPC.bind(this)
            );
        } catch {
            // empty
        }
    }

    private _checkIsAnyoneInSpace() {
        // if there's any participant already in space, set multiplayer to true to enter space
        for (const [, participant] of this.room.remoteParticipants) {
            if (participant.attributes.inSpace) {
                return true;
            }
        }
        return false;
    }

    private async _requestJoinSpaceEventListener(request: RequestJoinSpace) {
        if (
            this.room.remoteParticipants.size === 0 &&
            request.spaceType === "other"
        ) {
            return;
        }

        if (
            this.room.remoteParticipants.size === 0 &&
            request.spaceType === "self"
        ) {
            // no one is in space, so we can set multiplayer to true
            useLiveKitStore.getState().setIsMultiplayer("true");
            return;
        }

        for (const [, participant] of this.room.remoteParticipants) {
            try {
                const _response = await this.room.localParticipant.performRpc({
                    destinationIdentity: participant.identity,
                    method: "participantRequestJoinSpace",
                    payload: JSON.stringify({
                        identity: request.identity,
                        spaceType: request.spaceType,
                        // spaceId: request.spaceId,
                    }),
                });
            } catch (error) {
                console.error("RPC call failed:", error);
            }
        }
    }

    private async _requestJoinSpaceRPC(data: RpcInvocationData) {
        const payload = JSON.parse(data.payload) as RequestJoinSpace;
        useLiveKitStore.getState().setOpenJoinSpaceModal({
            identity: data.callerIdentity,
            spaceType: payload.spaceType,
        });
        return "ok" as string;
    }

    private async _confirmJoinSpaceEventListener(confirmData: ConfirmJoinSpace) {
        for (const [, participant] of this.room.remoteParticipants) {
            try {
                const _response = await this.room.localParticipant.performRpc({
                    destinationIdentity: participant.identity,
                    method: "participantConfirmJoinSpace",
                    payload: JSON.stringify({
                        identity: confirmData.identity,
                        confirm: confirmData.confirm,
                    }),
                });
                // we click confirm button, so we can set multiplayer to true
                if (confirmData.confirm) {
                    useLiveKitStore.getState().setIsMultiplayer("true");
                }
            } catch (error) {
                console.error("RPC call failed:", error);
            }
        }
    }

    private async _confirmJoinSpaceRPC(data: RpcInvocationData) {
        const payload = JSON.parse(data.payload) as ConfirmJoinSpace;
        // we receive confirm data from other participant, so we can set multiplayer to true
        if (payload.confirm) {
            useLiveKitStore.getState().setIsMultiplayer("true");
        } else {
            toast("Your request to join space was declined", {
                position: "top-center",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                pauseOnFocusLoss: true,
            });
        }
        return "ok" as string;
    }

    private _onParticipantLeave() {
        if (!this._checkIsAnyoneInSpace()) {
            useLiveKitStore.getState().setIsMultiplayer();
        }
    }

    dispose(): void {
        this.room.off(RoomEvent.ParticipantDisconnected, this._onParticipantLeave);
        eventBus.offWithEvent(
            "multiplayer:requestJoinSpace",
            this._requestJoinSpaceEventListener
        );
        this.room.unregisterRpcMethod("participantRequestJoinSpace");
        eventBus.offWithEvent(
            "multiplayer:confirmJoinSpace",
            this._confirmJoinSpaceEventListener
        );
        this.room.unregisterRpcMethod("participantConfirmJoinSpace");
    }
}

export default RoomManager;
