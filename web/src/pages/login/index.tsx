import { useEffect } from "react";
import { Alert, Button } from "antd";
import { useLogto } from "@logto/react";
import { LogIn } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { isLogtoConfigured, logtoCallbackUri, safeRedirectPath } from "@/lib/logto";

export default function LoginPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { error, isAuthenticated, isLoading, signIn } = useLogto();
    const redirect = safeRedirectPath(searchParams.get("redirect"));

    useEffect(() => {
        if (isAuthenticated) navigate(redirect, { replace: true });
    }, [isAuthenticated, navigate, redirect]);

    const login = async () => {
        await signIn({
            redirectUri: logtoCallbackUri(),
            postRedirectUri: new URL(redirect, window.location.origin),
        });
    };

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-10 text-foreground">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex items-center justify-center">
                    <Link to="/" className="inline-flex items-center gap-2 text-base font-semibold text-stone-950 dark:text-stone-100">
                        <span className="size-7 shrink-0 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />
                        <span>无限画布</span>
                    </Link>
                </div>
                <section className="rounded-lg border border-stone-200 bg-background p-6 dark:border-stone-800">
                    <h1 className="text-xl font-semibold text-stone-950 dark:text-stone-100">登录后继续使用</h1>
                    <p className="mt-2 text-sm leading-6 text-stone-500">使用 EggAi 登录后，可读取 New API 中属于当前账号的模型和令牌。</p>
                    {!isLogtoConfigured ? <Alert className="mt-4" type="warning" showIcon message="请先配置 LOGTO_ISSUER 和 LOGTO_CLIENT_ID" /> : null}
                    {error ? <Alert className="mt-4" type="error" showIcon message={error.message} /> : null}
                    <Button className="mt-5" type="primary" size="large" block icon={<LogIn className="size-4" />} loading={isLoading} disabled={!isLogtoConfigured} onClick={() => void login()}>
                        使用 EggAi 登录
                    </Button>
                </section>
            </div>
        </main>
    );
}
