"use client";

import { useCallback } from "react";
import { useLogto } from "@logto/react";
import { usePathname, useRouter } from "next/navigation";

import { eggAiCallbackUrl, isEggAiConfigured } from "@/lib/eggai";
import { useEggAiStore } from "@/stores/use-eggai-store";

export function useRequireEggAi() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, isLoading, signIn } = useLogto();
    const hasPassedGate = useEggAiStore((state) => state.hasPassedGate);

    return useCallback(() => {
        if (isAuthenticated && hasPassedGate) return true;
        const redirect = `${pathname}${window.location.search}${window.location.hash}`;
        sessionStorage.setItem("infinite-canvas:eggai-redirect", redirect);
        if (isEggAiConfigured && !isLoading) void signIn(eggAiCallbackUrl());
        else router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
        return false;
    }, [hasPassedGate, isAuthenticated, isLoading, pathname, router, signIn]);
}
