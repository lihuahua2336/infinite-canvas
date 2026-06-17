"use client";

import { create } from "zustand";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    email?: string;
};

type UserStore = {
    user: LocalUser | null;
    isReady: boolean;
    isLoading: boolean;
    hydrateUser: () => Promise<LocalUser | null>;
    logout: () => Promise<void>;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    isReady: false,
    isLoading: false,
    hydrateUser: async () => {
        set({ isLoading: true });
        try {
            const response = await fetch("/api/auth/me", { cache: "no-store" });
            if (!response.ok) {
                set({ user: null, isReady: true, isLoading: false });
                return null;
            }
            const payload = (await response.json()) as { user?: LocalUser | null };
            const user = payload.user || null;
            set({ user, isReady: true, isLoading: false });
            return user;
        } catch {
            set({ user: null, isReady: true, isLoading: false });
            return null;
        }
    },
    logout: async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            set({ user: null, isReady: true, isLoading: false });
        }
    },
    clearSession: () => set({ user: null, isReady: true, isLoading: false }),
}));
