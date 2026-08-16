import { getLogtoContext } from "@logto/next/server-actions";

import { eggAiLogtoConfig, eggAiUserFromClaims, isEggAiServerConfigured } from "@/lib/eggai-server";

export async function GET() {
    if (!isEggAiServerConfigured) return Response.json({ configured: false, authenticated: false, user: null, message: "EggAI 服务端登录尚未配置" }, { status: 503 });
    const context = await getLogtoContext(eggAiLogtoConfig);
    return Response.json({ configured: true, authenticated: context.isAuthenticated, user: context.claims ? eggAiUserFromClaims(context.claims) : null }, { headers: { "Cache-Control": "no-store" } });
}
