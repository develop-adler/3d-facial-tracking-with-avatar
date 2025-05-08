import { create } from 'zustand';

import type CoreScene from '@/3d/core/CoreScene';

type SceneStore = {
    coreScene?: CoreScene;
    setScene: (coreScene?: CoreScene) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
    setScene: (coreScene) => set({ coreScene }),
}));
