import { apiGet } from "@/services/api/request";

export type NewAPITokenBrief = {
    tokenId: number;
    tokenName: string;
    baseUrl: string;
    group: string;
};

export type NewAPIConfigResponse = {
    configured: boolean;
    loginUrl: string;
    message: string;
    models: string[];
    tokens: NewAPITokenBrief[];
};

export async function fetchNewAPIConfig(token: string) {
    return apiGet<NewAPIConfigResponse>("/api/new-api/config", undefined, token);
}
