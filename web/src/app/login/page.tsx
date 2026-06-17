"use client";

import { Alert, Button } from "antd";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

function safeRedirect(value: string | null) {
    const redirect = (value || "/").replace(/[\t\n\r]/g, "");
    if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.startsWith("/\\")) return "/";
    return redirect;
}

export default function LoginPage() {
    const [redirect, setRedirect] = useState("/");
    const [error, setError] = useState("");
    const loginUrl = `/api/auth/logto/authorize?redirect=${encodeURIComponent(redirect)}`;

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        setRedirect(safeRedirect(searchParams.get("redirect")));
        setError(searchParams.get("error") || "");
    }, []);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-10 text-foreground">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex items-center justify-center">
                    <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold text-stone-950 dark:text-stone-100">
                        <span
                            className="size-7 shrink-0 bg-current"
                            style={{
                                mask: "url(/logo.svg) center / contain no-repeat",
                                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                            }}
                        />
                        <span>无限画布</span>
                    </Link>
                </div>
                <section className="rounded-lg border border-stone-200 bg-background p-6 shadow-sm dark:border-stone-800">
                    <div className="mb-5">
                        <h1 className="text-xl font-semibold text-stone-950 dark:text-stone-100">登录后继续使用</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500">请使用 Logto 登录。登录后会回到刚才访问的页面，并可在设置中自动读取 New API 令牌和模型。</p>
                    </div>
                    {error ? <Alert className="mb-4" type="error" showIcon message={error} /> : null}
                    <Button type="primary" size="large" block icon={<LogIn className="size-4" />} href={loginUrl}>
                        使用 Logto 登录
                    </Button>
                </section>
            </div>
        </main>
    );
}
