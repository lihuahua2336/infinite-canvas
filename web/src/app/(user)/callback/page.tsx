"use client";

import { Alert, Spin } from "antd";
import { useHandleSignInCallback, useLogto } from "@logto/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";

import { useEggAiStore } from "@/stores/use-eggai-store";

export default function CallbackPage() {
    return <Suspense fallback={<CallbackShell />}><CallbackContent /></Suspense>;
}

function CallbackContent() {
    const router = useRouter();
    const params = useSearchParams();
    const { isAuthenticated, isLoading, error } = useLogto();
    const { error: callbackError } = useHandleSignInCallback();
    const hasPassedGate = useEggAiStore((state) => state.hasPassedGate);
    const provisioningError = useEggAiStore((state) => state.error);
    const storedRedirect = typeof window !== "undefined" ? sessionStorage.getItem("infinite-canvas:eggai-redirect") : null;
    const redirect = (params.get("redirect") || storedRedirect)?.startsWith("/") ? (params.get("redirect") || storedRedirect)! : "/";

    useEffect(() => {
        if (isAuthenticated && hasPassedGate) {
            sessionStorage.removeItem("infinite-canvas:eggai-redirect");
            router.replace(redirect);
        }
    }, [hasPassedGate, isAuthenticated, redirect, router]);

    if (error || callbackError || provisioningError) return <CallbackShell><Alert type="error" showIcon message={provisioningError || callbackError?.message || error?.message || "EggAI 登录失败"} /></CallbackShell>;
    if (isLoading || isAuthenticated) return <CallbackShell><Spin tip="正在确认 EggAI 登录并保存渠道授权" /></CallbackShell>;
    return <CallbackShell><Alert type="warning" showIcon message="EggAI 登录未完成，请返回登录页重试" /></CallbackShell>;
}

function CallbackShell({ children }: { children?: ReactNode }) {
    return <main className="flex h-full min-h-0 items-center justify-center bg-background px-6"><div className="w-full max-w-lg">{children || <Spin />}</div></main>;
}
