import type { AvatarGender, ObjectQuaternion, ObjectTransform } from "./3d";

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

export type AvatarChange = {
    sid: string;
    avatarId: string;
    gender: AvatarGender;
};

export type AvatarAudioData = {
    position: ObjectTransform;
    // rotation: ObjectQuaternion;
    // forward: ObjectTransform;
    cameraPosition: ObjectTransform;
    cameraRotation: ObjectTransform;
    // cameraRotation: ObjectQuaternion;
};

export type RemoteAvatarAudioData = AvatarAudioData & {
    sid: string;
};