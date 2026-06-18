import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie, readSession, refreshNewAPIToken, setSessionCookie } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

class NewAPIRequestError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}

export async function GET(request: NextRequest) {
    const displayName = newAPIDisplayName();
    const result: NewAPIConfigResponse = {
        configured: false,
        displayName,
        loginUrl: newAPISetupURL(),
        message: "",
        models: [],
        tokens: [],
    };
    if (!newAPIBaseURL()) {
        result.message = `${displayName} 地址未配置，请在环境变量中设置 NEW_API_BASE_URL`;
        return Response.json(result);
    }

    const session = readSession(request);
    if (!session) {
        result.message = "请先使用 Logto 登录";
        return Response.json(result, { status: 401 });
    }
    const refreshed = await refreshNewAPIToken(session).catch(() => ({ session, refreshed: false, ok: false }));
    if (!refreshed.ok || !refreshed.session.newAPIToken?.accessToken) {
        const response = NextResponse.json({ ...result, message: `请重新登录以授权访问 ${displayName}` }, { status: 401 });
        clearSessionCookie(response);
        return response;
    }

    try {
        await newAPIGet(refreshed.session.newAPIToken.accessToken, "/api/ecosystem/me");
        const [models, tokens] = await Promise.all([fetchNewAPIModels(refreshed.session.newAPIToken.accessToken), fetchNewAPITokens(refreshed.session.newAPIToken.accessToken)]);
        result.models = models;
        result.tokens = publicNewAPITokens(tokens);
        result.configured = result.models.length > 0 && result.tokens.length > 0;
        result.message = result.configured ? `${displayName} 已连接` : result.models.length ? `${displayName} 当前没有可用令牌，请前往 ${displayName} 登录后创建令牌` : `${displayName} 当前没有可用模型，请先在后台配置模型渠道`;
        const response = NextResponse.json(result);
        if (refreshed.refreshed) setSessionCookie(response, refreshed.session, request);
        return response;
    } catch (error) {
        if (error instanceof NewAPIRequestError && error.status === 401) {
            const response = NextResponse.json({ ...result, message: `请重新登录以授权访问 ${displayName}` }, { status: 401 });
            clearSessionCookie(response);
            return response;
        }
        result.message = error instanceof Error ? error.message : `${displayName} 读取失败`;
        const response = NextResponse.json(result);
        if (refreshed.refreshed) setSessionCookie(response, refreshed.session, request);
        return response;
    }
}

async function fetchNewAPIModels(accessToken: string) {
    const models = await newAPIGet<string[]>(accessToken, "/api/ecosystem/models");
    return uniqueSortedStrings(Array.isArray(models) ? models : []);
}

async function fetchNewAPITokens(accessToken: string) {
    const tokens = await newAPIGet<EcosystemToken[]>(accessToken, "/api/ecosystem/tokens");
    return Array.isArray(tokens) ? tokens : [];
}

async function newAPIGet<T = unknown>(accessToken: string, path: string) {
    const response = await fetch(`${newAPIBaseURL()}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: T };
    const message = (payload.message || "").trim();
    if (!response.ok) throw new NewAPIRequestError(`${newAPIDisplayName()} 请求失败：${path} ${response.status} ${message || response.statusText}`, response.status);
    if (payload.success === false) throw new Error(message || `${newAPIDisplayName()} 请求失败：${path}`);
    if ("data" in payload) return payload.data as T;
    return payload as T;
}

function publicNewAPITokens(tokens: EcosystemToken[]) {
    return tokens
        .filter((token) => (token.api_key || "").trim())
        .map((token, index) => ({
            tokenId: Number(token.token_id) || index + 1,
            tokenName: (token.token_name || "").trim() || `令牌 ${Number(token.token_id) || index + 1}`,
            baseUrl: firstNonEmpty(token.base_url, process.env.NEW_API_PUBLIC_URL, process.env.NEW_API_BASE_URL),
            apiKey: (token.api_key || "").trim(),
            group: (token.group || "").trim(),
        }));
}

function newAPIDisplayName() {
    return (process.env.NEW_API_DISPLAY_NAME || "").trim() || "New API";
}

function newAPIBaseURL() {
    return (process.env.NEW_API_BASE_URL || "").trim().replace(/\/+$/, "");
}

function newAPISetupURL() {
    const base = firstNonEmpty(process.env.NEW_API_PUBLIC_URL, process.env.NEW_API_BASE_URL);
    if (!base) return "";
    try {
        const url = new URL(base);
        url.pathname = `${url.pathname.replace(/\/+$/, "")}/console/token`;
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return `${base.replace(/\/+$/, "")}/console/token`;
    }
}

function firstNonEmpty(...values: Array<string | undefined>) {
    return values.find((value) => value && value.trim())?.trim().replace(/\/+$/, "") || "";
}

function uniqueSortedStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}
