"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Spin } from "antd";
import { usePathname, useRouter } from "next/navigation";

import { useUserStore } from "@/stores/use-user-store";

export function AuthGate({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const isLoading = useUserStore((state) => state.isLoading);
    const hydrateUser = useUserStore((state) => state.hydrateUser);

    useEffect(() => {
        if (!isReady && !isLoading) void hydrateUser();
    }, [hydrateUser, isLoading, isReady]);

    useEffect(() => {
        if (!isReady || user) return;
        const redirect = `${window.location.pathname || pathname}${window.location.search || ""}`;
        router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
    }, [isReady, pathname, router, user]);

    if (!isReady || !user) {
        return (
            <div className="flex h-full min-h-[240px] items-center justify-center bg-background text-foreground">
                <Spin tip="正在确认登录状态" />
            </div>
        );
    }

    return <>{children}</>;
}
