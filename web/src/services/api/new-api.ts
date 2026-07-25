import { NEW_API_BASE_URL, NEW_API_DISPLAY_NAME, NEW_API_PUBLIC_URL } from "@/constant/runtime-config";

type EcosystemToken = {
    token_id?: number;
    token_name?: string;
    api_key?: string;
    base_url?: string;
    group?: string;
};

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

export class NewAPIConfigError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
        this.name = "NewAPIConfigError";
    }
}

export async function fetchNewAPIConfig(accessToken: string): Promise<NewAPIConfigResponse> {
    const result: NewAPIConfigResponse = {
        configured: false,
        displayName: NEW_API_DISPLAY_NAME,
        loginUrl: newAPISetupURL(),
        message: "",
        models: [],
        tokens: [],
    };
    const baseUrl = newAPIRequestBaseURL();
    if (!baseUrl) {
        result.message = `${NEW_API_DISPLAY_NAME} 地址未配置，请设置 NEW_API_PUBLIC_URL 或 NEW_API_BASE_URL`;
        return result;
    }
    if (!accessToken.trim()) throw new NewAPIConfigError(`无法获取 ${NEW_API_DISPLAY_NAME} 访问令牌`, 401);

    try {
        await newAPIGet(accessToken, "/api/ecosystem/me");
        const [models, tokens] = await Promise.all([
            newAPIGet<string[]>(accessToken, "/api/ecosystem/models"),
            newAPIGet<EcosystemToken[]>(accessToken, "/api/ecosystem/tokens"),
        ]);
        result.models = uniqueSortedStrings(Array.isArray(models) ? models : []);
        result.tokens = publicNewAPITokens(Array.isArray(tokens) ? tokens : []);
        result.configured = result.models.length > 0 && result.tokens.length > 0;
        result.message = result.configured
            ? `${NEW_API_DISPLAY_NAME} 已连接`
            : result.models.length
              ? `${NEW_API_DISPLAY_NAME} 当前没有可用令牌，请先创建令牌`
              : `${NEW_API_DISPLAY_NAME} 当前没有可用模型，请先配置模型渠道`;
        return result;
    } catch (error) {
        if (error instanceof NewAPIConfigError) throw error;
        if (error instanceof TypeError) {
            throw new Error(`${NEW_API_DISPLAY_NAME} 连接失败，请检查服务地址、HTTPS 和 CORS 配置`);
        }
        throw error;
    }
}

async function newAPIGet<T = unknown>(accessToken: string, path: string) {
    let response: Response;
    try {
        response = await fetch(`${newAPIRequestBaseURL()}${path}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
        });
    } catch {
        throw new TypeError("network_error");
    }
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: T };
    const message = (payload.message || "").trim();
    if (!response.ok) {
        throw new NewAPIConfigError(`${NEW_API_DISPLAY_NAME} 请求失败：${path} ${response.status} ${message || response.statusText}`, response.status);
    }
    if (payload.success === false) throw new Error(message || `${NEW_API_DISPLAY_NAME} 请求失败：${path}`);
    return ("data" in payload ? payload.data : payload) as T;
}

function publicNewAPITokens(tokens: EcosystemToken[]) {
    return tokens
        .filter((token) => (token.api_key || "").trim())
        .map((token, index) => ({
            tokenId: Number(token.token_id) || index + 1,
            tokenName: (token.token_name || "").trim() || `令牌 ${Number(token.token_id) || index + 1}`,
            baseUrl: firstNonEmpty(token.base_url, NEW_API_PUBLIC_URL, NEW_API_BASE_URL),
            apiKey: (token.api_key || "").trim(),
            group: (token.group || "").trim(),
        }));
}

function newAPIRequestBaseURL() {
    return firstNonEmpty(NEW_API_PUBLIC_URL, NEW_API_BASE_URL);
}

function newAPISetupURL() {
    const base = newAPIRequestBaseURL();
    if (!base) return "";
    try {
        const url = new URL(base);
        url.pathname = `${url.pathname.replace(/\/+$/, "")}/console/token`;
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return "";
    }
}

function firstNonEmpty(...values: Array<string | undefined>) {
    return values.find((value) => value?.trim())?.trim().replace(/\/+$/, "") || "";
}

function uniqueSortedStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}
