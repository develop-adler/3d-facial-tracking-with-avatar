import {
  type PhysicsShapeSphere,
  type PhysicsShapeContainer,
} from "@babylonjs/core/Physics/v2/physicsShape";

import type { Asset } from "@/models/common";
import type {
  StudioArchitectureObjectProperty,
  StudioDecorationObjectProperty,
  StudioImageObjectProperty,
  StudioObjectProperty,
} from "@/models/studio";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

export type ObjectTransform = [number, number, number];
export type ObjectQuaternion = [number, number, number, number];
export type ObjectAbsoluteTransforms = {
  absolutePosition: [number, number, number];
  absoluteRotationQuaternion: [number, number, number, number];
  absoluteScaling: [number, number, number];
};
export type ObjectTransformType = "location" | "rotation" | "scale";
export type GizmoTransformationType =
  | "none"
  | "location"
  | "rotation"
  | "scale";
export type Vector2 = { x: number; y: number };
export type AvatarGender = "male" | "female" | "other";
export type AvatarInteractionType =
  | "single"
  | "continuous"
  | "multi"
  | "hitting"
  | "gethit"
  | "loop";

export type AvatarPhysicsShapes = {
  male: {
    normal?: PhysicsShapeContainer;
    crouch?: PhysicsShapeSphere;
  };
  female: {
    normal?: PhysicsShapeContainer;
    crouch?: PhysicsShapeSphere;
  };
  other: {
    normal?: PhysicsShapeContainer;
    crouch?: PhysicsShapeSphere;
  };
};

export type SpaceLoadingPerformance = {
  space_data_loaded: number; // Data associated with the space has been loaded.
  space_3d_objects_loaded: number; // All 3D objects within the space have been loaded. (Combines multiple object loading observables)
  space_scene_created: number; // The 3D scene has been created.
  space_avatar_set: number; // The user's avatar has been set.
  space_avatar_controller_ready: number; // The avatar's control mechanism is ready.
  space_initialized: number; // The space has been initialized.
  space_environment_map_ready: number; // The environment map has been loaded.
  space_physics_ready: number; // The physics engine for the space is ready.
  space_avatar_ready: number; // The user's avatar is fully ready for interaction.
  space_fst_lod_ready: number; // The first level of detail (LOD) for the space is ready.
  space_vl_lod_ready: number; // Very low level of detail LOD is ready.
  space_lw_lod_ready: number; // Low level of detail LOD is ready.
  space_md_lod_ready: number; // Medium level of detail LOD is ready.
  space_hg_lod_ready: number; // High level of detail LOD is ready.
  space_uh_lod_ready: number; // Ultra high level of detail LOD is ready.
  space_fully_loaded: number; // Indicates that the space is fully loaded and ready for interaction.
};

export type AssetJsonWithResults = { results: Asset[] };

export type SoundList = {
  music: { id: string }[];
  shuffle: boolean;
};

export type SpaceJSON = {
  version: number;
  space: {
    size: number;
    previewCamera: {
      fov: number;
      position: ObjectTransform;
      target: ObjectTransform;
    };
    atom: {
      name: string;
      description: string;
      userSpawnInfo: {
        corners: [
          ObjectTransform,
          ObjectTransform,
          ObjectTransform,
          ObjectTransform
        ];
        target: ObjectTransform;
      };
      models: {
        skybox: string;
        architectures?: StudioArchitectureObjectProperty[];
        furnitures?: StudioObjectProperty[];
        decorations?: StudioDecorationObjectProperty[];
        entertainments?: StudioObjectProperty[];
        images?: StudioImageObjectProperty[];
        objects?: StudioObjectProperty[];
      };
    };
    sounds?: SoundList;
  };
};
export type ObjectQuality = 'lowest' | 'low' | 'medium' | 'high' | 'ultra';
export type ObjectQualityWithNoTexture = 'notexture' | ObjectQuality;
