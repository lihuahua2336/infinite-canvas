import { NEW_API_BASE_URL, NEW_API_DISPLAY_NAME, NEW_API_PUBLIC_URL } from "@/lib/eggai";

export type NewAPIToken = { tokenId: number; tokenName: string; baseUrl: string; apiKey: string; group: string };
export type NewAPIConfigResponse = { configured: boolean; displayName: string; loginUrl: string; message: string; models: string[]; tokens: NewAPIToken[] };

export async function fetchNewAPIConfig(accessToken: string): Promise<NewAPIConfigResponse> {
    const baseUrl = NEW_API_PUBLIC_URL || NEW_API_BASE_URL;
    const result: NewAPIConfigResponse = { configured: false, displayName: NEW_API_DISPLAY_NAME, loginUrl: setupUrl(baseUrl), message: "", models: [], tokens: [] };
    if (!baseUrl) {
        result.message = `未配置 ${NEW_API_DISPLAY_NAME} 地址`;
        return result;
    }
    if (!accessToken.trim()) throw new Error(`无法获取 ${NEW_API_DISPLAY_NAME} 访问令牌`);
    const [models, rawTokens] = await Promise.all([
        get<string[]>(baseUrl, accessToken, "/api/ecosystem/models"),
        get<Array<{ token_id?: number; token_name?: string; api_key?: string; base_url?: string; group?: string }>>(baseUrl, accessToken, "/api/ecosystem/tokens"),
    ]);
    result.models = Array.from(new Set((models || []).map((item) => item.trim()).filter(Boolean))).sort();
    result.tokens = (rawTokens || []).filter((item) => item.api_key?.trim()).map((item, index) => ({
        tokenId: Number(item.token_id) || index + 1,
        tokenName: item.token_name?.trim() || `令牌 ${Number(item.token_id) || index + 1}`,
        baseUrl: (item.base_url || NEW_API_PUBLIC_URL || NEW_API_BASE_URL).replace(/\/+$/, ""),
        apiKey: item.api_key!.trim(),
        group: item.group?.trim() || "",
    }));
    result.configured = result.models.length > 0 && result.tokens.length > 0;
    result.message = result.configured ? `${NEW_API_DISPLAY_NAME} 已连接` : `${NEW_API_DISPLAY_NAME} 当前没有可用模型或令牌`;
    return result;
}
async function get<T>(baseUrl: string, accessToken: string, path: string) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: T };
    if (!response.ok || payload.success === false) throw new Error(payload.message || `${NEW_API_DISPLAY_NAME} 请求失败`);
    return ("data" in payload ? payload.data : payload) as T;
}

function setupUrl(baseUrl: string) {
    if (!baseUrl) return "";
    try {
        const url = new URL(baseUrl);
        url.pathname = `${url.pathname.replace(/\/+$/, "")}/console/token`;
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return "";
    }
}
