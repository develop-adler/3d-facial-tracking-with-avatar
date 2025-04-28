import { create } from 'zustand';

import type { FaceDetectorType } from '@/app/utils/FaceDetector';

type FaceDetectorStore = {
  faceDetector: FaceDetectorType | null;
    setFaceDetector: (faceDetector: FaceDetectorType | null) => void;
};

export const useFaceDetectorStore = create<FaceDetectorStore>((set) => ({
  faceDetector: null,
  setFaceDetector: (faceDetector) => set({ faceDetector }),
}));
