"use client";

import { useCallback, useState } from "react";

import { fetchNewAPIConfig } from "@/services/api/new-api";
import { useUserStore } from "@/stores/use-user-store";
import { useConfigStore } from "@/stores/use-config-store";

export function useNewAPIConfig() {
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const newAPIConfig = useConfigStore((state) => state.newAPIConfig);
    const setNewAPIConfig = useConfigStore((state) => state.setNewAPIConfig);
    const [loading, setLoading] = useState(false);

    const loadNewAPIConfig = useCallback(async () => {
        if (!token || !user || user.role === "guest") {
            setNewAPIConfig(null);
            return null;
        }
        setLoading(true);
        try {
            const config = await fetchNewAPIConfig(token);
            setNewAPIConfig(config);
            return config;
        } catch (error) {
            const fallback = {
                configured: false,
                loginUrl: "",
                message: error instanceof Error ? error.message : "读取 New API 配置失败",
                models: [],
                tokens: [],
            };
            setNewAPIConfig(fallback);
            return fallback;
        } finally {
            setLoading(false);
        }
    }, [setNewAPIConfig, token, user]);

    return { newAPIConfig, loadNewAPIConfig, loading };
}
