import "server-only";

import { newApiBaseUrl, newApiDisplayName, newApiPublicUrl } from "@/lib/eggai-server";
import type { NewAPIConfigResponse } from "@/services/api/new-api";

export class NewAPIConfigError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

export async function fetchNewAPIConfigWithToken(accessToken: string): Promise<NewAPIConfigResponse> {
    const result: NewAPIConfigResponse = { configured: false, displayName: newApiDisplayName, loginUrl: setupUrl(), message: "", models: [], tokens: [] };
    if (!newApiBaseUrl) throw new NewAPIConfigError(`未配置 ${newApiDisplayName} 地址`, 503);
    const [models, rawTokens] = await Promise.all([
        get<string[]>(accessToken, "/api/ecosystem/models"),
        get<Array<{ token_id?: number; token_name?: string; api_key?: string; base_url?: string; group?: string }>>(accessToken, "/api/ecosystem/tokens"),
    ]);
    result.models = Array.from(new Set((models || []).map((item) => item.trim()).filter(Boolean))).sort();
    result.tokens = (rawTokens || []).filter((item) => item.api_key?.trim()).map((item, index) => ({
        tokenId: Number(item.token_id) || index + 1,
        tokenName: item.token_name?.trim() || `令牌 ${Number(item.token_id) || index + 1}`,
        baseUrl: (item.base_url || newApiPublicUrl || newApiBaseUrl).replace(/\/+$/, ""),
        apiKey: item.api_key!.trim(),
        group: item.group?.trim() || "",
    }));
    result.configured = result.models.length > 0 && result.tokens.length > 0;
    result.message = result.configured ? `${newApiDisplayName} 已连接` : `${newApiDisplayName} 当前没有可用模型或令牌`;
    return result;
}

async function get<T>(accessToken: string, path: string) {
    const response = await fetch(`${newApiBaseUrl}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: T };
    if (!response.ok || payload.success === false) throw new NewAPIConfigError(payload.message || `${newApiDisplayName} 请求失败`, response.status || 502);
    return ("data" in payload ? payload.data : payload) as T;
}

function setupUrl() {
    if (!newApiPublicUrl) return "";
    const url = new URL(newApiPublicUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/console/token`;
    return url.toString();
}
