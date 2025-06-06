import { create } from "zustand";

import FaceTracker from "@/utils/tracking/FaceTracker";

type TrackingStore = {
    faceTracker: FaceTracker;
};

export const useTrackingStore = create<TrackingStore>(() => ({
    faceTracker: FaceTracker.getInstance(),
}));
