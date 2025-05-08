import type { ObjectQuaternion, ObjectTransform } from "./3d";

export type RoomAndName = {
    room: string;
    name: string;
};

export type SyncState = {
    sid: string;
    position: ObjectTransform;
    rotation: ObjectQuaternion;
    animation: string;
    isAnimationLooping: boolean;
    isCrouching: boolean;
    isMoving: boolean;
    isGrounded: boolean;
    morphTargets: Record<string, number>;
    lookTarget?: ObjectTransform;
};
