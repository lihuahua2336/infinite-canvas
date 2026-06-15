"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { useUserStore } from "@/stores/use-user-store";

export default function UserLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const isLoginPage = pathname === "/login";
    const shouldBlock = !isLoginPage && (!isReady || !token || user?.role === "guest");

    useEffect(() => {
        if (isLoginPage || !isReady) return;
        if (!token || user?.role === "guest") {
            router.replace(`/login?redirect=${encodeURIComponent(pathname || "/")}`);
        }
    }, [isLoginPage, isReady, pathname, router, token, user?.role]);

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            {shouldBlock ? null : (
                <>
                    <AppTopNav />
                    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
                </>
            )}
        </div>
    );
}
