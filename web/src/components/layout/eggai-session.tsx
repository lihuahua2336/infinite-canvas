"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { fetchEggAiSession } from "@/services/api/eggai-auth";
import { fetchNewAPIConfig } from "@/services/api/new-api";
import { useConfigStore } from "@/stores/use-config-store";
import { useEggAiStore } from "@/stores/use-eggai-store";

let provisionedInCurrentRuntime = false;

export function EggAiSession({ children }: { children: ReactNode }) {
    const setUser = useEggAiStore((state) => state.setUser);
    const grantGate = useEggAiStore((state) => state.grantGate);
    const setProvisioning = useEggAiStore((state) => state.setProvisioning);
    const setError = useEggAiStore((state) => state.setError);
    const clear = useEggAiStore((state) => state.clear);
    const applyNewAPITokenAsChannel = useConfigStore((state) => state.applyNewAPITokenAsChannel);
    const hasEggAiChannel = useConfigStore((state) => state.config.localChannels.some((channel) => channel.id.startsWith("new-api-") && Boolean(channel.name.trim())));
    const running = useRef(false);

    useEffect(() => {
        if (running.current) return;
        running.current = true;
        setProvisioning(true);
        void (async () => {
            const session = await fetchEggAiSession();
            if (!session.authenticated || !session.user) {
                clear();
                return;
            }
            setUser(session.user);
            if (provisionedInCurrentRuntime && hasEggAiChannel) {
                grantGate();
                return;
            }
            const next = await fetchNewAPIConfig();
            if (!next.configured) throw new Error(next.message || `${next.displayName} 当前不可用`);
            applyNewAPITokenAsChannel(next);
            provisionedInCurrentRuntime = true;
            grantGate();
        })()
            .catch((error) => setError(error instanceof Error ? error.message : "EggAI 登录授权失败"))
            .finally(() => {
                running.current = false;
                setProvisioning(false);
            });
    }, [applyNewAPITokenAsChannel, clear, grantGate, hasEggAiChannel, setError, setProvisioning, setUser]);

    return <>{children}</>;
}
