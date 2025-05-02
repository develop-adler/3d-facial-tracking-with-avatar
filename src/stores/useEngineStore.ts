import { create } from "zustand";

import type { CoreEngineType } from "@/3d/CoreEngine";

type EngineStore = {
  coreEngine: CoreEngineType | null;
  setEngine: (coreEngine: CoreEngineType | null) => void;
};

export const useEngineStore = create<EngineStore>((set) => ({
  coreEngine: null,
  setEngine: (coreEngine) => set({ coreEngine }),
}));
