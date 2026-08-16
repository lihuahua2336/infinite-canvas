"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLogto } from "@logto/react";

import { NEW_API_LOGTO_AUDIENCE, NEW_API_PUBLIC_URL, NEW_API_BASE_URL, isEggAiConfigured, eggAiUserFromClaims } from "@/lib/eggai";
import { fetchNewAPIConfig } from "@/services/api/new-api";
import { useConfigStore } from "@/stores/use-config-store";
import { useEggAiStore } from "@/stores/use-eggai-store";

export function EggAiSession({ children }: { children: ReactNode }) {
    const { getAccessToken, getIdTokenClaims, isAuthenticated, isLoading } = useLogto();
    const user = useEggAiStore((state) => state.user);
    const hasPassedGate = useEggAiStore((state) => state.hasPassedGate);
    const setUser = useEggAiStore((state) => state.setUser);
    const grantGate = useEggAiStore((state) => state.grantGate);
    const setProvisioning = useEggAiStore((state) => state.setProvisioning);
    const setError = useEggAiStore((state) => state.setError);
    const applyNewAPITokenAsChannel = useConfigStore((state) => state.applyNewAPITokenAsChannel);
    const running = useRef(false);

    useEffect(() => {
        if (!isEggAiConfigured || isLoading || !isAuthenticated || running.current || (user && hasPassedGate)) return;
        running.current = true;
        setProvisioning(true);
        void (async () => {
            const claims = await getIdTokenClaims();
            if (!claims) throw new Error("EggAI 未返回用户信息");
            setUser(eggAiUserFromClaims(claims));
            const apiAddress = NEW_API_PUBLIC_URL || NEW_API_BASE_URL;
            if (apiAddress) {
                if (!NEW_API_LOGTO_AUDIENCE) throw new Error("请先配置 NEW_API_LOGTO_AUDIENCE");
                const accessToken = await getAccessToken(NEW_API_LOGTO_AUDIENCE);
                const next = await fetchNewAPIConfig(accessToken);
                if (!next.configured) throw new Error(next.message || `${next.displayName} 当前不可用`);
                applyNewAPITokenAsChannel(next);
            }
            grantGate();
        })()
            .catch((error) => setError(error instanceof Error ? error.message : "EggAI 登录授权失败"))
            .finally(() => {
                running.current = false;
                setProvisioning(false);
            });
    }, [applyNewAPITokenAsChannel, getAccessToken, getIdTokenClaims, grantGate, hasPassedGate, isAuthenticated, isLoading, setError, setProvisioning, setUser, user]);

    return <>{children}</>;
}
