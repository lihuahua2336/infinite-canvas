import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";

type ProxyConfig = Pick<AiConfig, "baseUrl" | "proxyMode">;
type HeaderValue = string | undefined;

export function aiApiRequest(config: ProxyConfig, path: string, method: string, headers: Record<string, HeaderValue> = {}) {
    return externalAiApiRequest(config, buildApiUrl(config.baseUrl, path), method, headers);
}

export function externalAiApiRequest(config: Pick<AiConfig, "proxyMode">, target: string, method: string, headers: Record<string, HeaderValue> = {}) {
    if (config.proxyMode !== "nextjs") return { url: target, headers: cleanHeaders(headers) };
    return {
        url: "/api/ai-proxy",
        headers: cleanHeaders({
            ...headers,
            "x-ai-target": target,
            "x-ai-method": method.toUpperCase(),
        }),
    };
}

function cleanHeaders(headers: Record<string, HeaderValue>) {
    return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => Boolean(entry[1])));
}
