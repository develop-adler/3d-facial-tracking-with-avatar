import { create } from "zustand";
import type {
    GizmoTransformationType,
    ObjectTransform,
    ObjectTransformType,
    Vector2,
} from "@/models/3d";
import type { Asset } from "@/models/common";
import type { LockedStudioObjects, StudioSavedStates } from "@/models/studio";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

type StudioStore = {
    showContextMenu: boolean;
    contextMenuPosition?: Vector2;
    selectedObject?: Mesh | AbstractMesh;
    objectTransforms: Record<ObjectTransformType, ObjectTransform>;
    updateObjectTransformsFrom3D: boolean;
    currentGizmoTransformationType: GizmoTransformationType;
    currentStateIndex: number;
    savedStates: StudioSavedStates;
    lockedObjects: LockedStudioObjects;
    isPreviewMode: boolean;
    totalChanges: number;
    isSavingDraft: boolean;
    isPublished: boolean;
    isJSONDataChanged: boolean;
    isSpaceDataChanged: boolean;
    isInPostCamera: boolean;
    isEditSpawnAreaMode: boolean;
    isThumbnailModal: boolean;
    currentSkyboxAsset?: Asset;
    openCreateModal: boolean;
    scaleAspectRatioLock: boolean;
    isPlacingObject: boolean;
} & SpaceStoreActions;

interface SpaceStoreActions {
    setLockedObjects: (lockedObjects: LockedStudioObjects) => void;
    setSelectedObject: (object?: Mesh | AbstractMesh) => void;
    setObjectTransformsFrom3D: (
        transforms: StudioStore["objectTransforms"]
    ) => void;
    setObjectTransformsForAxis: (
        transformType: ObjectTransformType,
        axis: "x" | "y" | "z",
        value: number,
        uniformScaling?: boolean
    ) => void;
    setGizmoTransformationType: (
        gizmoTransformationType: GizmoTransformationType
    ) => void;
    resetTotalChanges: () => void;
    incrementTotalChanges: () => void;
    saveStateAndIncrementChange: (
        savedStates: StudioSavedStates,
        currentStateIndex: number
    ) => void;
    setJSONDataChanged: () => void;
    setIsPublished: (isPublished: boolean) => void;
    setThumbnailCaptureMode: (isInPostCamera: boolean) => void;
    setEditSpawnAreaMode: (isEditSpawnAreaMode: boolean) => void;
    setIsThumbnailModal: (isThumbnailModal: boolean) => void;
    setCurrentSkyboxAsset: (asset: Asset) => void;
    setIsSavingDraft: (isSavingDraft: boolean) => void;
    // setThumbnails: (thumbnails: ThumbnailScreenshots) => void;
    setScaleAspectRatioLock: (scaleAspectRatioLock: boolean) => void;
    setShowContextMenu: (
        showContextMenu: boolean,
        contextMenuPosition?: Vector2
    ) => void;
    setIsPlacingObject: (isPlacingObject: boolean) => void;
}

export const useStudioStore = create<StudioStore>((set, get) => ({
    selectedObject: undefined,
    objectTransforms: {
        location: [0, 0, 0] as ObjectTransform,
        rotation: [0, 0, 0] as ObjectTransform,
        scale: [1, 1, 1] as ObjectTransform,
    },
    updateObjectTransformsFrom3D: false,
    currentGizmoTransformationType: "location" as GizmoTransformationType,
    currentStateIndex: 0,
    savedStates: [],
    lockedObjects: [],
    isPreviewMode: false,
    spaceDraft: undefined,
    spaceDraftJSONData: undefined,
    totalChanges: 0,
    isSavingDraft: false,
    isPublished: false,
    isJSONDataChanged: false,
    isSpaceDataChanged: false,
    isInPostCamera: false,
    isEditSpawnAreaMode: false,
    isThumbnailModal: false,
    isPropertiesPanelExpanded: true,
    currentSkyboxAsset: undefined,
    openCreateModal: false,
    scaleAspectRatioLock: false,
    showContextMenu: false,
    isPlacingObject: false,

    setLockedObjects(lockedObjects) {
        set({ lockedObjects });
    },
    setCurrentSkyboxAsset(asset) {
        set({ currentSkyboxAsset: asset });
    },
    setSelectedObject(object) {
        set({ selectedObject: object });
    },
    setObjectTransformsFrom3D(transforms) {
        set({ updateObjectTransformsFrom3D: true, objectTransforms: transforms });
    },
    setObjectTransformsForAxis(transformType, axis, value, uniformScaling?) {
        const { objectTransforms } = get();

        // uniform scaling
        if (uniformScaling === true && transformType === "scale") {
            const currentScale = objectTransforms[transformType]; // [x, y, z]

            // find the scale factor based on the new value for the specified axis
            const axisIndex = axis === "x" ? 0 : (axis === "y" ? 1 : 2);
            const scaleFactor = value / currentScale[axisIndex];

            // apply the scale factor uniformly to all axes
            const newScale = currentScale.map(
                (v) => v * scaleFactor
            ) as ObjectTransform;

            objectTransforms[transformType] = newScale;

            set({
                updateObjectTransformsFrom3D: false,
                objectTransforms: { ...objectTransforms },
            });
            return;
        }

        let index = 0;
        if (axis === "y") index = 1;
        else if (axis === "z") index = 2;

        // Convert degrees to radians if is rotation value
        objectTransforms[transformType][index] =
            transformType === "rotation" ? (value * Math.PI) / 180 : value;
        set({
            updateObjectTransformsFrom3D: false,
            objectTransforms: { ...objectTransforms },
        });
    },
    setGizmoTransformationType(gizmoTransformationType) {
        set({ currentGizmoTransformationType: gizmoTransformationType });
    },
    // setPreviewMode(isPreviewMode) {
    //     set({ isPreviewMode });
    // },
    resetTotalChanges() {
        set({
            totalChanges: 0,
            isJSONDataChanged: false,
            isSpaceDataChanged: false,
        });
    },
    incrementTotalChanges() {
        set(({ totalChanges }) => ({
            totalChanges: totalChanges + 1,
            isJSONDataChanged: true,
        }));
    },
    saveStateAndIncrementChange(savedStates, currentStateIndex) {
        // do [...savedStates] to allow useEffect to detect that it's updated
        set(({ totalChanges }) => ({
            savedStates: [...savedStates],
            currentStateIndex: currentStateIndex,
            totalChanges: totalChanges + 1,
            isJSONDataChanged: true,
        }));
    },
    setJSONDataChanged() {
        set({ isJSONDataChanged: true });
    },
    setIsPublished(isPublished) {
        set({ isPublished });
    },
    setThumbnailCaptureMode(isInPostCamera) {
        set({ isInPostCamera });
    },
    setEditSpawnAreaMode(isEditSpawnAreaMode) {
        set({ isEditSpawnAreaMode });
    },
    setIsSavingDraft(isSavingDraft) {
        set({ isSavingDraft });
    },
    setIsThumbnailModal(isThumbnailModal) {
        set({ isThumbnailModal });
    },
    // setThumbnails(thumbnails) {
    //     set({ thumbnails });
    // },
    setScaleAspectRatioLock(scaleAspectRatioLock) {
        set({ scaleAspectRatioLock });
    },
    setShowContextMenu(showContextMenu, contextMenuPosition) {
        set({ showContextMenu, contextMenuPosition });
    },
    setIsPlacingObject(isPlacingObject) {
        set({ isPlacingObject });
    },
}));
