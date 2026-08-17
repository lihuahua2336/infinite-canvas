import "server-only";

import type { EggAiUser } from "@/lib/eggai";
import type { AuthSession } from "@/services/api/auth";

type ApiResponse<T> = { code: number; data: T; msg: string };

export async function createLocalLogtoSession(user: EggAiUser): Promise<AuthSession> {
    const secret = process.env.SESSION_SECRET?.trim();
    if (!secret) throw new Error("SESSION_SECRET 未配置");
    const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/auth/logto/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Auth-Bridge-Secret": secret },
        body: JSON.stringify(user),
        cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<AuthSession> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "本地账户初始化失败");
    return payload.data;
}
