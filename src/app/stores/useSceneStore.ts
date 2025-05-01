import { create } from 'zustand';

import type { CoreSceneType } from '@/app/3d/CoreScene';

type SceneStore = {
    coreScene: CoreSceneType | null;
    setScene: (coreScene: CoreSceneType | null) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
    coreScene: null,
    setScene: (coreScene) => set({ coreScene }),
}));
