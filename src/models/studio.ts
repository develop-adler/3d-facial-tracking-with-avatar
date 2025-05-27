import type { ObjectAbsoluteTransforms, ObjectTransform } from "@/models/3d";

export type StudioObjectTypeItems =
  | "architectures"
  | "furnitures"
  | "decorations"
  | "entertainments";

export type StudioObjectType = StudioObjectTypeItems | "skyboxs";

export type StudioObjectTypeExtended =
  | (StudioObjectType & "sounds")
  | "images"
  | "objects";
export type StudioObjectSubType =
  | "carpet"
  | "ceiling"
  | "decoration"
  | "door"
  | "floor"
  | "lighting"
  | "window"
  | "bed"
  | "chair"
  | "shelf"
  | "sofa"
  | "table"
  | "sound_system"
  | "wall"
  | "picture_frame"
  | "screen"
  | "structure"
  | "none";
export type StudioObjectType3D =
  | "wallAttached"
  | "wall"
  | "ground"
  | "decoration"
  | "floor";

export type StudioSaveStateData = {
  name?: string; // for UI
  mesh?: number; // uniqueId of mesh
  meshes?: Array<number>;
  old?: string | ObjectAbsoluteTransforms | Record<string, ObjectAbsoluteTransforms>;
  new?: string | ObjectAbsoluteTransforms | Record<string, ObjectAbsoluteTransforms>;
  priorSelectedMesh?: number; // uniqueId
  priorSelectedMeshes?: Array<number>; // uniqueIds
};

export type StudioSavedState = {
  uid: string;
  date: string;
  type: StudioSavedStateType;
  data: StudioSaveStateData;
  name?: string;
};
export type StudioSavedStates = Array<StudioSavedState>;

export type StudioSavedStateType =
  | "select"
  | "deselect"
  | "add"
  | "delete"
  | "move"
  | "rotate"
  | "scale"
  | "lock"
  | "unlock"
  | "duplicate"
  | "changeSkybox";

export type StudioPictureFrameImage = {
  src: string;
  file: File;
};

export type StudioObjectProperty = {
  id: string;
  type: StudioObjectType;
  position: ObjectTransform;
  rotation: ObjectTransform;
  scale: ObjectTransform;
};

export type StudioMeshMetaData = {
  id: string;
  name: string;
  position: ObjectTransform;
  rotation: ObjectTransform;
  scale: ObjectTransform;
  type: StudioObjectType;
  type3D: StudioObjectType3D;
  subType: StudioObjectSubType;
  imageContent?: StudioPictureFrameImage;
};

export type LockedStudioObjects = Array<number>;

export type StudioArchitectureObjectProperty = StudioObjectProperty & {
  color?: string; // optional only for wall
};
export type StudioDecorationObjectProperty = StudioObjectProperty & {
  image?: string; // only applicable if subtype is picture_frame
  color?: [number, number, number, number]; // RGBA (RGB = 0 - 255, A = 0 - 1), only applicable if subtype is pannel
};

export type StudioImageObjectProperty = {
  id: string;
  type: StudioObjectType;
  position: ObjectTransform;
  rotation: ObjectTransform;
  scale: [number, number];
};
