import type { IdTokenClaims, LogtoConfig } from "@logto/react";

import { LOGTO_CLIENT_ID, LOGTO_ISSUER, LOGTO_SCOPE, NEW_API_LOGTO_AUDIENCE, NEW_API_LOGTO_SCOPE } from "@/constant/runtime-config";
import type { LocalUser } from "@/stores/use-user-store";

const endpoint = LOGTO_ISSUER.replace(/\/oidc$/i, "") || window.location.origin;
const scopes = Array.from(new Set(`${LOGTO_SCOPE} ${NEW_API_LOGTO_SCOPE}`.split(/\s+/).filter(Boolean)));

export const isLogtoConfigured = Boolean(LOGTO_ISSUER && LOGTO_CLIENT_ID);

export const logtoConfig: LogtoConfig = {
    endpoint,
    appId: LOGTO_CLIENT_ID || "missing-logto-client-id",
    scopes,
    resources: NEW_API_LOGTO_AUDIENCE ? [NEW_API_LOGTO_AUDIENCE] : undefined,
};

export function logtoCallbackUri() {
    return new URL("/callback", window.location.origin).toString();
}

export function safeRedirectPath(value: string | null | undefined) {
    const redirect = (value || "/").replace(/[\t\n\r]/g, "");
    if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.startsWith("/\\")) return "/";
    return redirect;
}

export function userFromClaims(claims: IdTokenClaims): LocalUser {
    const profile = claims as IdTokenClaims & Record<string, unknown>;
    const id = textClaim(profile.sub) || "logto-user";
    const email = textClaim(profile.email);
    const username = firstClaim(profile, "preferred_username", "username", "nickname", "name", "email") || id;
    return {
        id,
        username,
        displayName: firstClaim(profile, "name", "nickname", "preferred_username", "username", "email") || username,
        avatarUrl: firstClaim(profile, "picture", "avatar_url"),
        email,
    };
}

function firstClaim(profile: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        const value = textClaim(profile[key]);
        if (value) return value;
    }
    return "";
}

function textClaim(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
