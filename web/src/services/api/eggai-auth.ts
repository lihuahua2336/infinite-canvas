import type { EggAiUser } from "@/lib/eggai";
import type { AuthSession } from "@/services/api/auth";

export type EggAiSessionResponse = {
    configured: boolean;
    authenticated: boolean;
    user: EggAiUser | null;
    localSession: AuthSession | null;
    localSessionError?: string;
};

export async function fetchEggAiSession(): Promise<EggAiSessionResponse> {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as EggAiSessionResponse & { message?: string };
    if (!response.ok) throw new Error(payload.message || "EggAI 会话检查失败");
    return payload;
}
