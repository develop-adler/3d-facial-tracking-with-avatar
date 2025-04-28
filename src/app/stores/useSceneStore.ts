import { create } from 'zustand';

import type { CoreSceneType } from '@/app/3d/CoreScene';

type SceneStore = {
    scene: CoreSceneType | null;
    setScene: (scene: CoreSceneType | null) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
    scene: null,
    setScene: (scene) => set({ scene }),
}));
