import { create } from "zustand";

type AvatarLoadingStore = {
    isLoading: boolean;
    loadingPercentage: number;
    setNotLoading: () => void;
    setIsLoading: (isLoading: boolean) => void;
    setLoadingPercentage: (percentage: number) => void;
};

export const useAvatarLoadingStore = create<AvatarLoadingStore>((set) => ({
    isLoading: true,
    loadingPercentage: 0,
    setNotLoading: () => set({ isLoading: false, loadingPercentage: 0 }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setLoadingPercentage: (percentage) => set({ loadingPercentage: percentage }),
}));
