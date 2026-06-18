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

export async function fetchNewAPIConfig() {
    const response = await fetch("/api/new-api/config", { cache: "no-store" });
    const config = (await response.json().catch(() => null)) as NewAPIConfigResponse | null;
    if (!config) throw new Error("读取 New API 配置失败");
    if (!response.ok) throw new NewAPIConfigError(config.message || "读取 New API 配置失败", response.status);
    return {
        ...config,
        configured: Boolean(config.configured),
        displayName: config.displayName || "New API",
        loginUrl: config.loginUrl || "",
        message: config.message || "",
        models: Array.isArray(config.models) ? config.models : [],
        tokens: Array.isArray(config.tokens) ? config.tokens : [],
    };
}
