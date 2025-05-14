import { create } from "zustand";

import FaceTracker from "@/3d/tracking/FaceTracker";

type TrackingStore = {
    faceTracker: FaceTracker;
    setFaceTracker: (faceTracker: FaceTracker) => void;
};

export const useTrackingStore = create<TrackingStore>((set) => ({
    faceTracker: FaceTracker.getInstance(),
    setFaceTracker: (tracker: FaceTracker) => set({ faceTracker: tracker }),
}));
