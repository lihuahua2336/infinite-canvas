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
    const [rawModels, rawKeys] = await Promise.all([
        get<Array<{ model?: string }>>(accessToken, "/api/v1/ecosystem/models"),
        get<{ items?: Array<{ id?: number; name?: string; key?: string; group_id?: number }> }>(accessToken, "/api/v1/ecosystem/keys"),
    ]);
    result.models = Array.from(new Set((rawModels || []).map((item) => item.model?.trim()).filter((item): item is string => Boolean(item)))).sort();
    result.tokens = (rawKeys?.items || []).filter((item) => item.key?.trim()).map((item, index) => ({
        tokenId: Number(item.id) || index + 1,
        tokenName: item.name?.trim() || `令牌 ${Number(item.id) || index + 1}`,
        baseUrl: (newApiPublicUrl || newApiBaseUrl).replace(/\/+$/, ""),
        apiKey: item.key!.trim(),
        group: item.group_id ? String(item.group_id) : "",
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
