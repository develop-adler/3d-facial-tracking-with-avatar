import type { ObjectQuaternion, ObjectTransform } from "@/apis/entities";

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
