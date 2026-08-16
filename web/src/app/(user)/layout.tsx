"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { fetchUserConfig } from "@/services/api/user-config";
import { useUserStore } from "@/stores/use-user-store";
import { useEggAiStore } from "@/stores/use-eggai-store";
import { isEggAiConfigured } from "@/lib/eggai";

const protectedPrefixes = ["/asset-library"];

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const eggAiUser = useEggAiStore((state) => state.user);
    const eggAiReady = useEggAiStore((state) => state.hasPassedGate);
    const wasLoggedOutRef = useRef(false);
    const isProtectedPage = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    const isAuthFlowPage = pathname === "/login" || pathname === "/callback";
    const requiresEggAi = isEggAiConfigured && !isAuthFlowPage;

    useEffect(() => {
        if (!isReady || !isProtectedPage || user || eggAiUser) return;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }, [eggAiUser, isProtectedPage, isReady, pathname, router, user]);

    useEffect(() => {
        if (!requiresEggAi || eggAiReady || !isReady) return;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }, [eggAiReady, eggAiUser, isReady, pathname, requiresEggAi, router]);

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
            <div className="min-h-0 flex-1 overflow-hidden">{(isProtectedPage && (!isReady || (!user && !eggAiUser))) || (requiresEggAi && !eggAiReady) ? null : children}</div>
        </div>
    );
}
