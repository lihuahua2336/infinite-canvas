import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useLogto } from "@logto/react";
import { useLocation, useNavigate } from "react-router-dom";

import { isLogtoConfigured, userFromClaims } from "@/lib/logto";
import { useUserStore } from "@/stores/use-user-store";

export function AuthGate({ children }: { children: ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { error, getIdTokenClaims, isAuthenticated, isLoading } = useLogto();
    const user = useUserStore((state) => state.user);
    const setUser = useUserStore((state) => state.setUser);
    const clearUser = useUserStore((state) => state.clearUser);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState("");

    useEffect(() => {
        if (!isLogtoConfigured || isLoading || isAuthenticated || error) return;
        clearUser();
        const redirect = `${location.pathname}${location.search}${location.hash}`;
        navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true });
    }, [clearUser, error, isAuthenticated, isLoading, location.hash, location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!isAuthenticated || user || loadingProfile || profileError) return;
        setLoadingProfile(true);
        setProfileError("");
        void getIdTokenClaims()
            .then((claims) => {
                if (!claims) throw new Error("Logto 未返回用户信息");
                setUser(userFromClaims(claims));
            })
            .catch((profileLoadError) => setProfileError(profileLoadError instanceof Error ? profileLoadError.message : "读取用户信息失败"))
            .finally(() => setLoadingProfile(false));
    }, [getIdTokenClaims, isAuthenticated, loadingProfile, profileError, setUser, user]);

    if (!isLogtoConfigured) {
        return <GateMessage type="warning" message="EggAi 登录尚未配置，请设置 LOGTO_ISSUER 和 LOGTO_CLIENT_ID" />;
    }
    if ((!isAuthenticated && error) || profileError) {
        return <GateMessage type="error" message={profileError || error?.message || "EggAi 登录失败"} />;
    }
    if (loadingProfile || !isAuthenticated || !user) {
        return (
            <div className="flex h-full min-h-[240px] items-center justify-center bg-background text-foreground">
                <Spin tip="正在确认登录状态" />
            </div>
        );
    }
    return <>{children}</>;
}

function GateMessage({ type, message }: { type: "warning" | "error"; message: string }) {
    return (
        <div className="flex h-full min-h-[240px] items-center justify-center bg-background px-6 text-foreground">
            <Alert className="w-full max-w-lg" type={type} showIcon message={message} />
        </div>
    );
}
