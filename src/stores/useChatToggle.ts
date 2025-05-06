import { create } from "zustand";

type ChatToggleStore = {
    isChatOpen: boolean;
    toggleChat: () => void;
    setChatOpen: (isOpen: boolean) => void;
};

export const useChatToggleStore = create<ChatToggleStore>((set) => ({
    isChatOpen: false,
    toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
    setChatOpen: (isOpen: boolean) => set({ isChatOpen: isOpen }),
}));
