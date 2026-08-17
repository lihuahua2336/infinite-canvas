import { getLogtoContext } from "@logto/next/server-actions";

import { eggAiLogtoConfig, eggAiUserFromClaims, isEggAiServerConfigured } from "@/lib/eggai-server";
import { createLocalLogtoSession } from "@/services/api/logto-local-session-server";

export async function GET() {
    if (!isEggAiServerConfigured) return Response.json({ configured: false, authenticated: false, user: null, message: "EggAI 服务端登录尚未配置" }, { status: 503 });
    const context = await getLogtoContext(eggAiLogtoConfig);
    const user = context.claims ? eggAiUserFromClaims(context.claims) : null;
    if (!context.isAuthenticated || !user) return Response.json({ configured: true, authenticated: false, user: null, localSession: null }, { headers: { "Cache-Control": "no-store" } });
    try {
        const localSession = await createLocalLogtoSession(user);
        return Response.json({ configured: true, authenticated: true, user, localSession }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("Failed to provision local Logto account", error);
        return Response.json({ configured: true, authenticated: true, user, localSession: null, localSessionError: error instanceof Error ? error.message : "本地账户初始化失败" }, { headers: { "Cache-Control": "no-store" } });
    }
}
