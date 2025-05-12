import type { AvatarGender, ObjectQuaternion, ObjectTransform } from "./3d";

export type RoomAndName = {
    room: string;
    name: string;
};

export type SyncState = {
    identity: string;
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

export type AvatarChangeAttributesData = {
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
    identity: string;
};

export type SpaceType = "self" | "other";

export type RequestJoinSpace = {
    identity: string;
    spaceType: SpaceType;
    // spaceId: string;
};

export type ConfirmJoinSpace = {
    identity: string;
    confirm: boolean;
};
