"use client";

import { Alert, Button } from "antd";
import { LogIn } from "lucide-react";
import { useLogto } from "@logto/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useEggAiStore } from "@/stores/use-eggai-store";
import { eggAiCallbackUrl, isEggAiConfigured } from "@/lib/eggai";

function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) return "/";
    return cleaned;
}

export default function LoginPage() {
    return <Suspense fallback={null}><LoginContent /></Suspense>;
}

function LoginContent() {
    const searchParams = useSearchParams();
    const { signIn } = useLogto();
    const eggAiError = useEggAiStore((state) => state.error);
    const eggAiProvisioning = useEggAiStore((state) => state.isProvisioning);
    const redirect = safeRedirect(searchParams.get("redirect"));

    const loginWithEggAi = () => {
        sessionStorage.setItem("infinite-canvas:eggai-redirect", redirect);
        void signIn(eggAiCallbackUrl());
    };

    return (
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <section className="w-full max-w-[420px]">
                <div className="mb-7 text-center">
                    <span className="mx-auto mb-4 block size-12 bg-stone-950 dark:bg-stone-100" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} aria-label="无限画布" />
                    <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">EggAI 登录</h1>
                    <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">完成 EggAI 授权后开始创作。</p>
                </div>
                {isEggAiConfigured ? (
                    <Button block size="large" icon={<LogIn className="size-4" />} loading={eggAiProvisioning} onClick={loginWithEggAi}>
                        使用 EggAI 登录
                    </Button>
                ) : (
                    <Alert type="error" showIcon message="EggAI 登录尚未配置" description="请设置 NEXT_PUBLIC_LOGTO_ISSUER 和 NEXT_PUBLIC_LOGTO_CLIENT_ID 后重新构建。" />
                )}
                {eggAiError ? <p className="mt-3 text-center text-sm text-red-500">{eggAiError}</p> : null}
            </section>
        </main>
    );
}
