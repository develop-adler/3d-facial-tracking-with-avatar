import { create } from 'zustand';

import { Scene3D } from '@/3d/VideoChat/Scene3D';

type SceneStore = {
    coreScene?: Scene3D;
    setScene: (coreScene?: Scene3D) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
    setScene: (coreScene) => set({ coreScene }),
}));
