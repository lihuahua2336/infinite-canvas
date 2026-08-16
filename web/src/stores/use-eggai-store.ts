"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { EggAiUser } from "@/lib/eggai";

type EggAiStore = {
    user: EggAiUser | null;
    hasPassedGate: boolean;
    isProvisioning: boolean;
    error: string;
    setUser: (user: EggAiUser) => void;
    grantGate: () => void;
    clear: () => void;
    setProvisioning: (value: boolean) => void;
    setError: (value: string) => void;
};

export const useEggAiStore = create<EggAiStore>()(
    persist(
        (set) => ({
            user: null,
            hasPassedGate: false,
            isProvisioning: true,
            error: "",
            setUser: (user) => set({ user, error: "" }),
            grantGate: () => set({ hasPassedGate: true, isProvisioning: false }),
            clear: () => set({ user: null, hasPassedGate: false, isProvisioning: false, error: "" }),
            setProvisioning: (isProvisioning) => set({ isProvisioning }),
            setError: (error) => set({ error, isProvisioning: false }),
        }),
        {
            name: "infinite-canvas:eggai-access-v1",
            partialize: (state) => ({ user: state.user }),
        },
    ),
);
