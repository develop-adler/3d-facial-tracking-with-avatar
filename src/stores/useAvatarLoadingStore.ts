import { create } from "zustand";

type AvatarLoadingStore = {
    isLoading: boolean;
    loadingPercentage: number;
    setNotLoading: () => void;
    setStartLoading: () => void;
    setIsLoading: (isLoading: boolean) => void;
    setLoadingPercentage: (percentage: number) => void;
};

export const useAvatarLoadingStore = create<AvatarLoadingStore>((set) => ({
    isLoading: true,
    loadingPercentage: 0,
    setNotLoading: () => set({ isLoading: false, loadingPercentage: 0 }),
    setStartLoading: () => set({ isLoading: true, loadingPercentage: 0 }),
    // set loading percentage to 0 if isLoading is true
    setIsLoading: (isLoading) => {
        if (isLoading) {
            set({ isLoading, loadingPercentage: 0 });
            return;
        }
        set({ isLoading });
    },
    setLoadingPercentage: (percentage) => set({ loadingPercentage: percentage }),
}));
