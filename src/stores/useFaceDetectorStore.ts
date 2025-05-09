import { create } from 'zustand';

import type { FaceDetectorType } from '@/3d/tracking/FaceDetector';

type FaceDetectorStore = {
  faceDetector?: FaceDetectorType;
    setFaceDetector: (faceDetector?: FaceDetectorType) => void;
};

export const useFaceDetectorStore = create<FaceDetectorStore>((set) => ({
  setFaceDetector: (faceDetector) => set({ faceDetector }),
}));
