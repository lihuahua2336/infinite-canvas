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
    const rawTokens = await get<Array<{ token_id: number; token_name: string; api_key: string; base_url: string; group: string }>>(accessToken, "/api/ecosystem/tokens");
    const firstByGroup = new Map<string, (typeof rawTokens)[number]>();
    for (const token of rawTokens || []) {
        const group = token.group?.trim() || newApiDisplayName;
        if (token.api_key?.trim() && !firstByGroup.has(group)) firstByGroup.set(group, token);
    }
    result.tokens = (await Promise.all(Array.from(firstByGroup, async ([group, token]) => {
        const baseUrl = (token.base_url?.trim() || `${newApiPublicUrl || newApiBaseUrl}/v1`).replace(/\/+$/, "");
        const response = await fetch(`${newApiBaseUrl}/v1/models`, { headers: { Authorization: `Bearer ${token.api_key}` }, cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ id?: string }>; message?: string };
        if (!response.ok || !Array.isArray(payload.data)) throw new NewAPIConfigError(payload.message || `${group} 模型列表获取失败`, response.status || 502);
        const models = Array.from(new Set(payload.data.map((item) => item.id?.trim()).filter((item): item is string => Boolean(item)))).sort();
        return { tokenId: token.token_id, tokenName: token.token_name, baseUrl, apiKey: token.api_key.trim(), group, models };
    }))).filter((token) => token.models.length > 0);
    result.models = Array.from(new Set(result.tokens.flatMap((token) => token.models))).sort();
    result.configured = result.tokens.length > 0;
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
