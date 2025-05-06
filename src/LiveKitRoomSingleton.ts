import { Room as LiveKitRoom } from "livekit-client";

export class Room {
    private static instance: LiveKitRoom;

    private constructor() {}

    public static getInstance() {
        Room.instance ??= new LiveKitRoom({
            // Optimize video quality for each participant's screen
            adaptiveStream: true,
            // Enable automatic audio/video quality optimization
            dynacast: true,
        });
        return Room.instance;
    }
}
