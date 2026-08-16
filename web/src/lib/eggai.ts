import type { IdTokenClaims, LogtoConfig } from "@logto/react";

export type EggAiUser = {
    id: string;
    username: string;
    displayName: string;
    email: string;
    avatarUrl: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const EGG_AI_ISSUER = (process.env.NEXT_PUBLIC_LOGTO_ISSUER || "").trim().replace(/\/+$/, "");
export const EGG_AI_CLIENT_ID = (process.env.NEXT_PUBLIC_LOGTO_CLIENT_ID || "").trim();
export const EGG_AI_SCOPE = (process.env.NEXT_PUBLIC_LOGTO_SCOPE || "openid profile email").trim();
export const NEW_API_BASE_URL = (process.env.NEXT_PUBLIC_NEW_API_BASE_URL || "").trim().replace(/\/+$/, "");
export const NEW_API_PUBLIC_URL = (process.env.NEXT_PUBLIC_NEW_API_PUBLIC_URL || "").trim().replace(/\/+$/, "");
export const NEW_API_DISPLAY_NAME = (process.env.NEXT_PUBLIC_NEW_API_DISPLAY_NAME || "New API").trim();
export const NEW_API_LOGTO_AUDIENCE = (process.env.NEXT_PUBLIC_NEW_API_LOGTO_AUDIENCE || "").trim();
export const NEW_API_LOGTO_SCOPE = (process.env.NEXT_PUBLIC_NEW_API_LOGTO_SCOPE || "ecosystem:me ecosystem:models:read ecosystem:tokens:read").trim();
export const isEggAiConfigured = Boolean(EGG_AI_ISSUER && EGG_AI_CLIENT_ID);

export const eggAiConfig: LogtoConfig = {
    endpoint: EGG_AI_ISSUER.replace(/\/oidc$/i, "") || "http://localhost",
    appId: EGG_AI_CLIENT_ID || "missing-logto-client-id",
    scopes: Array.from(new Set(`${EGG_AI_SCOPE} ${NEW_API_LOGTO_SCOPE}`.split(/\s+/).filter(Boolean))),
    resources: NEW_API_LOGTO_AUDIENCE ? [NEW_API_LOGTO_AUDIENCE] : undefined,
};

export function eggAiCallbackUrl() {
    return `${window.location.origin}/callback`;
}
export function eggAiUserFromClaims(claims: IdTokenClaims): EggAiUser {
    const profile = claims as IdTokenClaims & Record<string, unknown>;
    const id = text(profile.sub) || "eggai-user";
    const email = text(profile.email);
    const username = first(profile, "preferred_username", "username", "nickname", "name", "email") || id;
    return {
        id,
        username,
        displayName: first(profile, "name", "nickname", "preferred_username", "username", "email") || username,
        email,
        avatarUrl: first(profile, "picture", "avatar_url"),
    };
}

function first(profile: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        const value = text(profile[key]);
        if (value) return value;
    }
    return "";
}
