import { signIn } from "@logto/next/server-actions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { safeRedirectPath } from "@/lib/eggai";
import { eggAiBaseUrl, eggAiLogtoConfig, isEggAiServerConfigured } from "@/lib/eggai-server";

export async function GET(request: NextRequest) {
    if (!isEggAiServerConfigured) return NextResponse.redirect(new URL("/login?error=EggAI%20服务端登录尚未配置", eggAiBaseUrl));
    const redirect = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
    await signIn(eggAiLogtoConfig, {
        redirectUri: `${eggAiBaseUrl}/callback`,
        postRedirectUri: new URL(redirect, eggAiBaseUrl),
    });
}
