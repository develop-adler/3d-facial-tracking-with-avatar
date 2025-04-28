import { create } from "zustand";

import type { CoreEngineType } from "@/app/3d/CoreEngine";

type EngineStore = {
  engine: CoreEngineType | null;
  setEngine: (engine: CoreEngineType | null) => void;
};

export const useEngineStore = create<EngineStore>((set) => ({
  engine: null,
  setEngine: (engine) => set({ engine }),
}));
