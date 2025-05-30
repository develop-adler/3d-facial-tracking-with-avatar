import { Room, type RoomOptions } from "livekit-client";

export const DEFAULT_ROOM_OPTIONS: RoomOptions = {
    // Optimize video quality for each participant's screen
    adaptiveStream: true,
    // Enable automatic audio/video quality optimization
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    videoCaptureDefaults: {
        facingMode: "user",
        // none so that livekit can't automatically publish a video track
        deviceId: "",
    },
};

class LiveKitRoom {
    private static instance: LiveKitRoom;
    private _room: Room;

    private constructor() {
        this._room = new Room(DEFAULT_ROOM_OPTIONS);
    }
    get room(): Room {
        return this._room;
    }

    static getInstance() {
        LiveKitRoom.instance ??= new LiveKitRoom();
        return LiveKitRoom.instance;
    }
    setRoom(room: Room) {
        this._room.disconnect(true);
        this._room = room;
    }
    disposeRoom() {
        this._room.disconnect(true);
        LiveKitRoom.instance = new LiveKitRoom();
    }
}

export default LiveKitRoom;
