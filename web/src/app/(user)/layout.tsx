"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLogto } from "@logto/react";
import { usePathname, useRouter } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { fetchUserConfig } from "@/services/api/user-config";
import { useUserStore } from "@/stores/use-user-store";
import { useEggAiStore } from "@/stores/use-eggai-store";
import { eggAiCallbackUrl, isEggAiConfigured } from "@/lib/eggai";

const protectedPrefixes = ["/asset-library"];

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const eggAiUser = useEggAiStore((state) => state.user);
    const eggAiReady = useEggAiStore((state) => state.hasPassedGate);
    const eggAiProvisioning = useEggAiStore((state) => state.isProvisioning);
    const eggAiError = useEggAiStore((state) => state.error);
    const { isAuthenticated: isEggAiAuthenticated, isLoading: isEggAiLoading, signIn } = useLogto();
    const eggAiSignInStartedRef = useRef(false);
    const wasLoggedOutRef = useRef(false);
    const isProtectedPage = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const isAuthFlowPage = pathname === "/login" || pathname === "/callback";
    const requiresEggAi = !isAuthFlowPage;

    useEffect(() => {
        if (!isReady || !isProtectedPage || user || eggAiUser) return;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }, [eggAiUser, isProtectedPage, isReady, pathname, router, user]);

    useEffect(() => {
        const waitingForEggAi = isEggAiLoading || (isEggAiAuthenticated && !eggAiError);
        if (!requiresEggAi || eggAiReady || eggAiProvisioning || waitingForEggAi || !isReady) return;
        const redirect = `${pathname}${window.location.search}${window.location.hash}`;
        sessionStorage.setItem("infinite-canvas:eggai-redirect", redirect);
        if (!isEggAiConfigured) {
            router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
            return;
        }
        if (eggAiError) {
            router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
            return;
        }
        if (eggAiSignInStartedRef.current) return;
        eggAiSignInStartedRef.current = true;
        void signIn(eggAiCallbackUrl());
    }, [eggAiError, eggAiProvisioning, eggAiReady, eggAiUser, isEggAiAuthenticated, isEggAiLoading, isReady, pathname, requiresEggAi, router, signIn]);

    useEffect(() => {
        if (!isReady) return;
        if (!user) {
            wasLoggedOutRef.current = true;
            return;
        }
        const syncCanvasAfterLogin = wasLoggedOutRef.current;
        const token = useUserStore.getState().token;
        if (!token) return;
        wasLoggedOutRef.current = false;
        fetchUserConfig(token).then(async (config) => {
            const syncEnabled = config.syncCapabilities?.userData === true;
            const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
            const canvasStore = useCanvasStore.getState();
            canvasStore.setSyncEnabled(syncEnabled);
            if (
                syncCanvasAfterLogin &&
                syncEnabled &&
                canvasStore.hydrated
            ) {
                void canvasStore.syncWithRemote(token, true);
            }
            const { useAssetStore } = await import("@/stores/use-asset-store");
            void useAssetStore.getState().hydrateAccountAssets(token, syncEnabled);
        }).catch(() => { });
    }, [isReady, user]);

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className="min-h-0 flex-1 overflow-hidden">{(isProtectedPage && (!isReady || (!user && !eggAiUser))) || (requiresEggAi && (!eggAiReady || eggAiProvisioning || isEggAiLoading || (isEggAiAuthenticated && !eggAiError))) ? null : children}</div>
        </div>
    );
}
