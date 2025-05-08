import { create } from "zustand";

import { CoreEngine } from "@/3d/core/CoreEngine";

type EngineStore = {
  coreEngine: CoreEngine;
  // setEngine: (coreEngine: CoreEngine | null) => void;
};

export const useEngineStore = create<EngineStore>(() => ({
  coreEngine: CoreEngine.getInstance(),
  // setEngine: (coreEngine) => set({ coreEngine }),
}));
