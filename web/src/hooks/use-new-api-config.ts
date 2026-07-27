import { useCallback } from "react";
import { useLogto } from "@logto/react";

import { NEW_API_BASE_URL, NEW_API_DISPLAY_NAME, NEW_API_LOGTO_AUDIENCE, NEW_API_PUBLIC_URL } from "@/constant/runtime-config";
import { fetchNewAPIConfig, type NewAPIConfigResponse } from "@/services/api/new-api";
import { isSavedNewAPIChannel, newAPIChannelId, useConfigStore } from "@/stores/use-config-store";

export function useNewAPIConfig() {
    const { getAccessToken, isAuthenticated } = useLogto();
    const config = useConfigStore((state) => state.config);
    const newAPIConfig = useConfigStore((state) => state.newAPIConfig);
    const setNewAPIConfig = useConfigStore((state) => state.setNewAPIConfig);
    const applyNewAPITokenAsChannel = useConfigStore((state) => state.applyNewAPITokenAsChannel);

    const saveNewAPITokenAsChannel = useCallback(
        (next: NewAPIConfigResponse, tokenId?: string) => {
            const requested = (tokenId || "").trim();
            const token = next.tokens.find((item) => String(item.tokenId) === requested) || next.tokens[0];
            if (!token?.apiKey.trim()) throw new Error(`${next.displayName} 当前没有可用渠道密钥`);
            applyNewAPITokenAsChannel(next, String(token.tokenId));
            const savedChannel = useConfigStore.getState().config.channels.find((channel) => channel.id === newAPIChannelId(token.tokenId));
            if (savedChannel?.apiKey !== token.apiKey) throw new Error(`${next.displayName} 渠道密钥保存失败`);
            return token;
        },
        [applyNewAPITokenAsChannel],
    );

    const refreshNewAPIConfig = useCallback(async () => {
        if (!isAuthenticated) throw new Error("请先登录 EggAi");
        try {
            const hasNewAPIAddress = Boolean(NEW_API_PUBLIC_URL || NEW_API_BASE_URL);
            if (hasNewAPIAddress && !NEW_API_LOGTO_AUDIENCE) throw new Error("请先配置 NEW_API_LOGTO_AUDIENCE");
            const accessToken = hasNewAPIAddress ? await getAccessToken(NEW_API_LOGTO_AUDIENCE) : "";
            const next = await fetchNewAPIConfig(accessToken || "");
            setNewAPIConfig(next);
            return next;
        } catch (error) {
            const configError = error instanceof Error ? error : new Error(`读取 ${NEW_API_DISPLAY_NAME} 配置失败`);
            setNewAPIConfig({
                configured: false,
                displayName: NEW_API_DISPLAY_NAME,
                loginUrl: "",
                message: configError.message,
                models: [],
                tokens: [],
            });
            throw configError;
        }
    }, [getAccessToken, isAuthenticated, setNewAPIConfig]);

    const provisionNewAPIChannel = useCallback(async () => {
        const next = await refreshNewAPIConfig();
        if (!next.configured) throw new Error(next.message || `${next.displayName} 当前不可用`);
        saveNewAPITokenAsChannel(next);
        return next;
    }, [refreshNewAPIConfig, saveNewAPITokenAsChannel]);

    return {
        displayName: newAPIConfig?.displayName || NEW_API_DISPLAY_NAME,
        hasSavedNewAPIChannel: config.channels.some(isSavedNewAPIChannel),
        isAuthenticated,
        newAPIConfig,
        provisionNewAPIChannel,
        refreshNewAPIConfig,
        saveNewAPITokenAsChannel,
    };
}
