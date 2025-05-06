import { create } from "zustand";

interface ScreenControlState {
  isFullscreen: boolean;
  isViewportFill: boolean;
  setFullscreen: (value: boolean) => void;
  toggleFullscreen: () => void;
  setViewportFill: (value: boolean) => void;
  toggleViewportFill: () => void;
}

export const useScreenControlStore = create<ScreenControlState>((set) => ({
  isFullscreen: false,
  isViewportFill: false,
  setFullscreen: (value) => set({ isFullscreen: value }),
  toggleFullscreen: () =>
    set((state) => ({ isFullscreen: !state.isFullscreen })),
  setViewportFill: (value) => set({ isViewportFill: value }),
  toggleViewportFill: () =>
    set((state) => ({ isViewportFill: !state.isViewportFill })),
}));
