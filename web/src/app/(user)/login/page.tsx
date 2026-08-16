import { Alert, Button } from "antd";
import { LogIn } from "lucide-react";
import { redirect } from "next/navigation";

import { safeRedirectPath } from "@/lib/eggai";

type LoginPageProps = {
    searchParams: Promise<{ redirect?: string; error?: string; loggedOut?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const params = await searchParams;
    const target = safeRedirectPath(params.redirect);
    const signInUrl = `/api/auth/sign-in?redirect=${encodeURIComponent(target)}`;
    if (!params.error && params.loggedOut !== "1") redirect(signInUrl);

    return (
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <section className="w-full max-w-[420px]">
                <div className="mb-7 text-center">
                    <span className="mx-auto mb-4 block size-12 bg-stone-950 dark:bg-stone-100" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} aria-label="无限画布" />
                    <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">EggAI 登录</h1>
                    <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">完成 EggAI 授权后开始创作。</p>
                </div>
                {params.error ? <Alert className="mb-3" type="error" showIcon message={params.error} /> : null}
                <Button block href={signInUrl} size="large" icon={<LogIn className="size-4" />}>使用 EggAI 登录</Button>
            </section>
        </main>
    );
}
