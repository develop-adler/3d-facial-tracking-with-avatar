import { Room, type RoomOptions } from "livekit-client";

const ROOM_OPTIONS: RoomOptions = {
    // Optimize video quality for each participant's screen
    adaptiveStream: true,
    // Enable automatic audio/video quality optimization
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    videoCaptureDefaults: {
        facingMode: "user",
        // none so that livekit can't automatically publish a video track
        deviceId: "",
    }
};

class LiveKitRoom {
    private static instance: LiveKitRoom;
    readonly room: Room;

    private constructor() {
        this.room = new Room(ROOM_OPTIONS);
    }

    public static getInstance() {
        LiveKitRoom.instance ??= new LiveKitRoom();
        return LiveKitRoom.instance;
    }
    dispose() {
        this.room.disconnect(true);
        LiveKitRoom.instance = new LiveKitRoom();
    }
}

export default LiveKitRoom;