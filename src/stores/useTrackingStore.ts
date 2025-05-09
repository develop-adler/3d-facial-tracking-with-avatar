import { create } from "zustand";

import FaceTracker from "@/3d/tracking/FaceTracker";

type TrackingStore = {
    readonly faceTracker?: FaceTracker;
};

export const useTrackingStore = create<TrackingStore>(() => ({
    faceTracker: globalThis.window ? FaceTracker.getInstance() : undefined,
}));
