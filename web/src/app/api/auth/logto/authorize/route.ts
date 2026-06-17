import { NextRequest, NextResponse } from "next/server";

import { buildLogtoScopes, codeChallenge, getAuthConfig, getOIDCDiscovery, logtoRedirectUri, newAPIAudience, randomToken, safeRedirectPath, setLogtoPendingCookie } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const config = getAuthConfig();
    const redirect = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
    if (config.missing.length) return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(redirect)}&error=${encodeURIComponent(`${config.missing.join("、")} 未配置`)}`, request.url));

    try {
        const discovery = await getOIDCDiscovery(config.issuer);
        const state = randomToken();
        const nonce = randomToken();
        const codeVerifier = randomToken(48);
        const url = new URL(discovery.authorization_endpoint);
        url.searchParams.set("client_id", config.clientId);
        url.searchParams.set("redirect_uri", logtoRedirectUri(request));
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", buildLogtoScopes());
        url.searchParams.set("state", state);
        url.searchParams.set("nonce", nonce);
        url.searchParams.set("code_challenge", codeChallenge(codeVerifier));
        url.searchParams.set("code_challenge_method", "S256");
        const audience = newAPIAudience();
        if (audience) url.searchParams.set("resource", audience);

        const response = NextResponse.redirect(url);
        setLogtoPendingCookie(response, { state, nonce, codeVerifier, redirect, createdAt: Date.now() }, request);
        return response;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Logto 登录初始化失败";
        return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(redirect)}&error=${encodeURIComponent(message)}`, request.url));
    }
}
