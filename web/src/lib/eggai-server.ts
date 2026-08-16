import "server-only";

import type { IdTokenClaims, LogtoNextConfig } from "@logto/next";

import type { EggAiUser } from "@/lib/eggai";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const env = (name: string) => text(process.env[name]);
const endpoint = (env("LOGTO_INTERNAL_ISSUER") || env("LOGTO_ISSUER")).replace(/\/+$/, "").replace(/\/oidc$/i, "");

export const eggAiBaseUrl = (env("APP_PUBLIC_URL") || "http://localhost:3000").replace(/\/+$/, "");
export const newApiBaseUrl = (env("NEW_API_BASE_URL") || env("NEW_API_PUBLIC_URL")).replace(/\/+$/, "");
export const newApiPublicUrl = (env("NEW_API_PUBLIC_URL") || env("NEW_API_BASE_URL")).replace(/\/+$/, "");
export const newApiDisplayName = env("NEW_API_DISPLAY_NAME") || "EggAI";
export const newApiAudience = env("NEW_API_LOGTO_AUDIENCE");

const scopes = Array.from(new Set(`${env("LOGTO_SCOPE") || "openid profile email"} ${env("NEW_API_LOGTO_SCOPE")}`.split(/\s+/).filter(Boolean)));

export const isEggAiServerConfigured = Boolean(endpoint && env("LOGTO_CLIENT_ID") && env("LOGTO_CLIENT_SECRET") && env("SESSION_SECRET"));

export const eggAiLogtoConfig: LogtoNextConfig = {
    endpoint: endpoint || "http://localhost",
    appId: env("LOGTO_CLIENT_ID") || "missing-logto-client-id",
    appSecret: env("LOGTO_CLIENT_SECRET") || "missing-logto-client-secret",
    baseUrl: eggAiBaseUrl,
    cookieSecret: env("SESSION_SECRET") || "missing-session-secret-at-least-32-characters",
    cookieSecure: env("COOKIE_SECURE") ? env("COOKIE_SECURE").toLowerCase() === "true" : eggAiBaseUrl.startsWith("https://"),
    scopes,
    resources: newApiAudience ? [newApiAudience] : undefined,
};

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
