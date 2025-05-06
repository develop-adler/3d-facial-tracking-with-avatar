import { create } from 'zustand';

import { Scene3D } from '@/3d/VideoChat/Scene3D';

type SceneStore = {
    coreScene: Scene3D | null;
    setScene: (coreScene: Scene3D | null) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
    coreScene: null,
    setScene: (coreScene) => set({ coreScene }),
}));
