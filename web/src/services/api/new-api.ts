import { apiGet } from "@/services/api/request";

export type NewAPITokenBrief = {
    tokenId: number;
    tokenName: string;
    baseUrl: string;
    apiKey: string;
    group: string;
};

export type NewAPIConfigResponse = {
    configured: boolean;
    displayName: string;
    loginUrl: string;
    message: string;
    models: string[];
    tokens: NewAPITokenBrief[];
};

export async function fetchNewAPIConfig(token: string) {
    const config = await apiGet<NewAPIConfigResponse>("/api/new-api/config", undefined, token);
    return {
        ...config,
        displayName: config.displayName || "New API",
        models: Array.isArray(config.models) ? config.models : [],
        tokens: Array.isArray(config.tokens) ? config.tokens : [],
    };
}
