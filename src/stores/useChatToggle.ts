import { create } from "zustand";

type ChatToggleStore = {
    isChatOpen: boolean;
    unreadCount: number;
    setUnreadCount: (count: number) => void;
    toggleChat: () => void;
    setChatOpen: (isOpen: boolean) => void;
};

export const useChatToggleStore = create<ChatToggleStore>((set) => ({
    isChatOpen: false,
    unreadCount: 0,
    setUnreadCount: (count: number) => set({ unreadCount: count }),
    toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
    setChatOpen: (isOpen: boolean) => set({ isChatOpen: isOpen }),
}));
