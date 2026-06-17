import { NextRequest, NextResponse } from "next/server";

import { appURL, clearLogtoPendingCookie, exchangeLogtoCode, getAuthConfig, getOIDCDiscovery, readLogtoPendingCookie, safeRedirectPath, sessionFromLogtoToken, setSessionCookie } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const pending = readLogtoPendingCookie(request);
    const redirect = safeRedirectPath(pending?.redirect);
    const responseWithError = (message: string) => {
        const response = NextResponse.redirect(appURL(request, `/login?redirect=${encodeURIComponent(redirect)}&error=${encodeURIComponent(message)}`));
        clearLogtoPendingCookie(response);
        return response;
    };

    const error = request.nextUrl.searchParams.get("error_description") || request.nextUrl.searchParams.get("error");
    if (error) return responseWithError(error);
    const code = request.nextUrl.searchParams.get("code") || "";
    const state = request.nextUrl.searchParams.get("state") || "";
    if (!pending || !code || pending.state !== state) return responseWithError("Logto 登录状态校验失败");

    const config = getAuthConfig();
    if (config.missing.length) return responseWithError(`${config.missing.join("、")} 未配置`);

    try {
        const discovery = await getOIDCDiscovery(config.issuer);
        const token = await exchangeLogtoCode(request, discovery, code, pending.codeVerifier);
        const session = await sessionFromLogtoToken(discovery, token, pending.nonce);
        const response = NextResponse.redirect(appURL(request, redirect));
        setSessionCookie(response, session, request);
        clearLogtoPendingCookie(response);
        return response;
    } catch (err) {
        return responseWithError(err instanceof Error ? err.message : "Logto 登录失败");
    }
}
