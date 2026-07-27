import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    email?: string;
};

type UserStore = {
    user: LocalUser | null;
    hasPassedEggAiGate: boolean;
    isEggAiLogoutPending: boolean;
    setUser: (user: LocalUser) => void;
    clearUser: () => void;
    grantEggAiGate: () => void;
    revokeEggAiGate: () => void;
    completeEggAiLogout: () => void;
};

export const useUserStore = create<UserStore>()(
    persist(
        (set) => ({
            user: null,
            hasPassedEggAiGate: false,
            isEggAiLogoutPending: false,
            setUser: (user) => set({ user }),
            clearUser: () => set({ user: null }),
            grantEggAiGate: () => set({ hasPassedEggAiGate: true }),
            revokeEggAiGate: () => set({ user: null, hasPassedEggAiGate: false, isEggAiLogoutPending: true }),
            completeEggAiLogout: () => set({ isEggAiLogoutPending: false }),
        }),
        {
            name: "infinite-canvas:eggai_access",
            partialize: (state) => ({ hasPassedEggAiGate: state.hasPassedEggAiGate }),
        },
    ),
);
