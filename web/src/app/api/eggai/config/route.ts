import { getAccessToken, getLogtoContext } from "@logto/next/server-actions";

import { eggAiLogtoConfig, isEggAiServerConfigured, newApiAudience } from "@/lib/eggai-server";
import { fetchNewAPIConfigWithToken, NewAPIConfigError } from "@/services/api/new-api-server";

export async function GET() {
    if (!isEggAiServerConfigured) return Response.json({ message: "EggAI 服务端登录尚未配置" }, { status: 503 });
    const context = await getLogtoContext(eggAiLogtoConfig);
    if (!context.isAuthenticated) return Response.json({ message: "EggAI 登录已失效" }, { status: 401 });
    if (!newApiAudience) return Response.json({ message: "未配置 NEW_API_LOGTO_AUDIENCE" }, { status: 503 });
    try {
        const accessToken = await getAccessToken(eggAiLogtoConfig, newApiAudience);
        return Response.json(await fetchNewAPIConfigWithToken(accessToken), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const status = error instanceof NewAPIConfigError ? error.status : 502;
        const message = error instanceof Error ? error.message : "EggAI 渠道配置请求失败";
        return Response.json({ message }, { status });
    }
}
