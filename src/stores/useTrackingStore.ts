import { create } from "zustand";

import FaceTracker from "@/3d/tracking/FaceTracker";

type TrackingStore = {
    faceTracker: FaceTracker;
};

export const useTrackingStore = create<TrackingStore>(() => ({
    faceTracker: FaceTracker.getInstance(),
}));
