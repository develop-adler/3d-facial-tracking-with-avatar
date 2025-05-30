import type { AvatarGender, ObjectQuaternion, ObjectTransform } from "@/models/3d";
import type { Asset } from "@/models/common";
import type { StudioSavedStates } from "@/models/studio";

export type RoomJoinInfo = {
    room: string;
    name: string;
    passphrase: string;
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

export type RequestOrigin = "self" | "other";

export type UserRequest = {
    identity: string;
    origin: RequestOrigin;
};

export type ConfirmRequest = {
    identity: string;
    confirm: boolean;
};

export type PlaceObjectRPC = UserRequest & {
  asset: Asset;
}

export type SaveStateRPC = UserRequest & {
  savedStates: StudioSavedStates;
  currentStateIndex: number;
}
