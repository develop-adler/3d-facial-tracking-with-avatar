import { create } from "zustand";

import CoreEngine  from "@/3dthree/core/CoreEngine";

type EngineStore = {
  readonly coreEngine: CoreEngine;
};

export const useEngineStore = create<EngineStore>(() => ({
  coreEngine: CoreEngine.getInstance(),
}));
