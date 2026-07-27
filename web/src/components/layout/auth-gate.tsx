import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { useLogto } from "@logto/react";
import { ExternalLink } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useNewAPIConfig } from "@/hooks/use-new-api-config";
import { isLogtoConfigured, userFromClaims } from "@/lib/logto";
import { useUserStore } from "@/stores/use-user-store";

export function AuthGate({ children }: { children: ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { error, getIdTokenClaims, isAuthenticated, isLoading } = useLogto();
    const { newAPIConfig, provisionNewAPIChannel } = useNewAPIConfig();
    const user = useUserStore((state) => state.user);
    const hasPassedEggAiGate = useUserStore((state) => state.hasPassedEggAiGate);
    const isEggAiLogoutPending = useUserStore((state) => state.isEggAiLogoutPending);
    const setUser = useUserStore((state) => state.setUser);
    const clearUser = useUserStore((state) => state.clearUser);
    const grantEggAiGate = useUserStore((state) => state.grantEggAiGate);
    const completeEggAiLogout = useUserStore((state) => state.completeEggAiLogout);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState("");
    const provisioningRef = useRef(false);

    useEffect(() => {
        if (isLoading || isAuthenticated) return;
        if (isEggAiLogoutPending) completeEggAiLogout();
        if (user) clearUser();
        if (!isLogtoConfigured || hasPassedEggAiGate || error) return;
        const redirect = `${location.pathname}${location.search}${location.hash}`;
        navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
    }, [clearUser, completeEggAiLogout, error, hasPassedEggAiGate, isAuthenticated, isEggAiLogoutPending, isLoading, location.hash, location.pathname, location.search, navigate, user]);

    useEffect(() => {
        if (!isAuthenticated || isEggAiLogoutPending || provisioningRef.current || profileError || (user && hasPassedEggAiGate)) return;
        const shouldProvisionAccess = !hasPassedEggAiGate;
        provisioningRef.current = true;
        setLoadingProfile(true);
        setProfileError("");
        void (async () => {
            const claims = await getIdTokenClaims();
            if (!claims) throw new Error("Logto 未返回用户信息");
            setUser(userFromClaims(claims));

            if (shouldProvisionAccess) {
                await provisionNewAPIChannel();
                grantEggAiGate();
            }
        })()
            .catch((profileLoadError) => {
                setProfileError(profileLoadError instanceof Error ? profileLoadError.message : "读取用户信息失败");
            })
            .finally(() => {
                provisioningRef.current = false;
                setLoadingProfile(false);
            });
    }, [getIdTokenClaims, grantEggAiGate, hasPassedEggAiGate, isAuthenticated, isEggAiLogoutPending, profileError, provisionNewAPIChannel, setUser, user]);

    if (hasPassedEggAiGate) return <>{children}</>;
    if (!isLogtoConfigured) {
        return <GateMessage type="warning" message="EggAi 登录尚未配置，请设置 LOGTO_ISSUER 和 LOGTO_CLIENT_ID" />;
    }
    if ((!isAuthenticated && error) || profileError) {
        return <GateMessage type="error" message={profileError || error?.message || "EggAi 登录失败"} setupUrl={profileError && !newAPIConfig?.configured ? newAPIConfig?.loginUrl : undefined} onRetry={isAuthenticated && profileError ? () => setProfileError("") : undefined} />;
    }
    if (loadingProfile || !isAuthenticated || !user) {
        return (
            <div className="flex h-full min-h-[240px] items-center justify-center bg-background text-foreground">
                <Spin tip={isEggAiLogoutPending ? "正在退出登录" : "正在保存本地授权"} />
            </div>
        );
    }
    return <>{children}</>;
}

function GateMessage({ type, message, setupUrl, onRetry }: { type: "warning" | "error"; message: string; setupUrl?: string; onRetry?: () => void }) {
    const action = setupUrl || onRetry ? (
        <div className="flex flex-wrap gap-2">
            {setupUrl ? <Button size="small" icon={<ExternalLink className="size-3.5" />} href={setupUrl} target="_blank" rel="noopener noreferrer">前往配置</Button> : null}
            {onRetry ? <Button size="small" onClick={onRetry}>重试</Button> : null}
        </div>
    ) : undefined;
    return (
        <div className="flex h-full min-h-[240px] items-center justify-center bg-background px-6 text-foreground">
            <Alert className="w-full max-w-lg" type={type} showIcon message={message} action={action} />
        </div>
    );
}
