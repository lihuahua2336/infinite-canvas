export type NewAPIToken = { tokenId: number; tokenName: string; baseUrl: string; apiKey: string; group: string; models: string[] };
export type NewAPIConfigResponse = { configured: boolean; displayName: string; loginUrl: string; message: string; models: string[]; tokens: NewAPIToken[] };

export async function fetchNewAPIConfig(): Promise<NewAPIConfigResponse> {
    const response = await fetch("/api/eggai/config", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as NewAPIConfigResponse & { message?: string };
    if (!response.ok) throw new Error(payload.message || "EggAI 渠道配置请求失败");
    return payload;
}
