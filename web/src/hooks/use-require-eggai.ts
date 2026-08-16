"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";

import { useEggAiStore } from "@/stores/use-eggai-store";

export function useRequireEggAi() {
    const pathname = usePathname();
    const user = useEggAiStore((state) => state.user);
    const hasPassedGate = useEggAiStore((state) => state.hasPassedGate);

    return useCallback(() => {
        if (user && hasPassedGate) return true;
        const redirect = `${pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`/api/auth/sign-in?redirect=${encodeURIComponent(redirect)}`);
        return false;
    }, [hasPassedGate, pathname, user]);
}
