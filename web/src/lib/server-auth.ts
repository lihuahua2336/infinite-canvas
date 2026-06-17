import type { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    email?: string;
};

export type NewAPITokenSession = {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresAt: number;
    scope: string;
    audience: string;
};

export type AuthSession = {
    user: AuthUser;
    newAPIToken: NewAPITokenSession | null;
    createdAt: number;
    updatedAt: number;
};

type LogtoPendingAuth = {
    state: string;
    nonce: string;
    codeVerifier: string;
    redirect: string;
    createdAt: number;
};

type OIDCDiscovery = {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
    jwks_uri: string;
};

type OIDCTokenResponse = {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
};

type OIDCProfile = {
    sub?: string;
    email?: string;
    name?: string;
    nickname?: string;
    preferred_username?: string;
    username?: string;
    picture?: string;
    avatar_url?: string;
};

const SESSION_COOKIE = "infinite_canvas_session";
const LOGTO_PENDING_COOKIE = "infinite_canvas_logto";
const COOKIE_CHUNK_SIZE = 3500;
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const PENDING_MAX_AGE = 60 * 10;
const CLOCK_SKEW_SECONDS = 60;

let discoveryCache: { issuer: string; value: OIDCDiscovery; expiresAt: number } | null = null;
const jwksCache = new Map<string, { keys: JsonWebKey[]; expiresAt: number }>();

export function getAuthConfig() {
    const issuer = trimTrailingSlash(process.env.LOGTO_ISSUER || "");
    const internalIssuer = trimTrailingSlash(process.env.LOGTO_INTERNAL_ISSUER || "");
    const clientId = (process.env.LOGTO_CLIENT_ID || "").trim();
    const clientSecret = (process.env.LOGTO_CLIENT_SECRET || "").trim();
    const sessionSecret = (process.env.SESSION_SECRET || "").trim();
    const missing = [
        ["LOGTO_ISSUER", issuer],
        ["LOGTO_CLIENT_ID", clientId],
        ["LOGTO_CLIENT_SECRET", clientSecret],
        ["SESSION_SECRET", sessionSecret],
    ]
        .filter(([, value]) => !value)
        .map(([key]) => key);
    return { issuer, internalIssuer, clientId, clientSecret, sessionSecret, missing };
}

export function safeRedirectPath(value: string | null | undefined) {
    const cleaned = (value || "/").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) return "/";
    return cleaned;
}

export function requestOrigin(request: NextRequest) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
    const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
    const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "http";
    return `${proto}://${host}`;
}

export function logtoRedirectUri(request: NextRequest) {
    return `${requestOrigin(request)}/api/auth/logto/callback`;
}

export async function getOIDCDiscovery(issuer: string) {
    if (discoveryCache && discoveryCache.issuer === issuer && discoveryCache.expiresAt > Date.now()) return discoveryCache.value;
    const response = await fetch(serverLogtoURL(`${trimTrailingSlash(issuer)}/.well-known/openid-configuration`), { cache: "no-store" });
    if (!response.ok) throw new Error("Logto 发现配置读取失败");
    const value = publicLogtoDiscovery((await response.json()) as OIDCDiscovery);
    if (!value.authorization_endpoint || !value.token_endpoint || !value.jwks_uri) throw new Error("Logto 发现配置不完整");
    discoveryCache = { issuer, value, expiresAt: Date.now() + 1000 * 60 * 10 };
    return value;
}

export function buildLogtoScopes() {
    const scopeSet = new Set((process.env.LOGTO_SCOPE || "openid profile email").split(/\s+/).filter(Boolean));
    scopeSet.add("openid");
    const audience = (process.env.NEW_API_LOGTO_AUDIENCE || "").trim();
    if (audience) {
        for (const scope of (process.env.NEW_API_LOGTO_SCOPE || "").split(/\s+/).filter(Boolean)) scopeSet.add(scope);
        scopeSet.add("offline_access");
    }
    return Array.from(scopeSet).join(" ");
}

export function newAPIAudience() {
    return (process.env.NEW_API_LOGTO_AUDIENCE || "").trim();
}

export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}

export function codeChallenge(verifier: string) {
    return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function setLogtoPendingCookie(response: NextResponse, pending: LogtoPendingAuth, request?: NextRequest) {
    response.cookies.set(LOGTO_PENDING_COOKIE, encryptJSON(pending), {
        ...cookieOptions(request),
        maxAge: PENDING_MAX_AGE,
    });
}

export function readLogtoPendingCookie(request: NextRequest) {
    const value = request.cookies.get(LOGTO_PENDING_COOKIE)?.value;
    const pending = value ? decryptJSON<LogtoPendingAuth>(value) : null;
    if (!pending || Date.now() - pending.createdAt > PENDING_MAX_AGE * 1000) return null;
    return pending;
}

export function clearLogtoPendingCookie(response: NextResponse) {
    response.cookies.set(LOGTO_PENDING_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export function readSession(request: NextRequest) {
    const encrypted = readChunkedCookie(request, SESSION_COOKIE);
    const session = encrypted ? decryptJSON<AuthSession>(encrypted) : null;
    if (!session?.user?.id || Date.now() - session.createdAt > SESSION_MAX_AGE * 1000) return null;
    return session;
}

export function setSessionCookie(response: NextResponse, session: AuthSession, request?: NextRequest) {
    const encrypted = encryptJSON({ ...session, updatedAt: Date.now() });
    clearSessionCookie(response);
    if (encrypted.length <= COOKIE_CHUNK_SIZE) {
        response.cookies.set(SESSION_COOKIE, encrypted, { ...cookieOptions(request), maxAge: SESSION_MAX_AGE });
        return;
    }
    const chunks = encrypted.match(new RegExp(`.{1,${COOKIE_CHUNK_SIZE}}`, "g")) || [];
    response.cookies.set(SESSION_COOKIE, `chunks:${chunks.length}`, { ...cookieOptions(request), maxAge: SESSION_MAX_AGE });
    chunks.forEach((chunk, index) => {
        response.cookies.set(`${SESSION_COOKIE}.${index}`, chunk, { ...cookieOptions(request), maxAge: SESSION_MAX_AGE });
    });
}

export function clearSessionCookie(response: NextResponse) {
    response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    for (let index = 0; index < 12; index += 1) {
        response.cookies.set(`${SESSION_COOKIE}.${index}`, "", { ...cookieOptions(), maxAge: 0 });
    }
}

export async function exchangeLogtoCode(request: NextRequest, discovery: OIDCDiscovery, code: string, verifier: string) {
    const config = getAuthConfig();
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: logtoRedirectUri(request),
        code_verifier: verifier,
    });
    const audience = newAPIAudience();
    if (audience) body.set("resource", audience);
    return fetchOIDCToken(discovery.token_endpoint, body);
}

export async function refreshNewAPIToken(session: AuthSession) {
    const token = session.newAPIToken;
    if (!token?.refreshToken) return { session, refreshed: false, ok: Boolean(token?.accessToken) };
    if (token.expiresAt && Date.now() < token.expiresAt - 60_000) return { session, refreshed: false, ok: true };

    const config = getAuthConfig();
    if (config.missing.length) return { session, refreshed: false, ok: false };
    const discovery = await getOIDCDiscovery(config.issuer);
    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: token.refreshToken,
    });
    const audience = newAPIAudience();
    if (audience) body.set("resource", audience);
    const nextToken = await fetchOIDCToken(discovery.token_endpoint, body);
    if (!nextToken.access_token) return { session, refreshed: false, ok: false };
    return {
        session: {
            ...session,
            newAPIToken: tokenFromResponse(nextToken, token.refreshToken),
            updatedAt: Date.now(),
        },
        refreshed: true,
        ok: true,
    };
}

export async function sessionFromLogtoToken(discovery: OIDCDiscovery, token: OIDCTokenResponse, nonce: string) {
    if (!token.access_token || !token.id_token) throw new Error("Logto 登录失败：缺少令牌");
    const idProfile = await verifyIDToken(token.id_token, discovery, nonce);
    const userInfo = await fetchUserInfo(discovery.userinfo_endpoint, token.access_token);
    const profile = mergeProfile(idProfile, userInfo);
    const subject = (profile.sub || "").trim();
    if (!subject) throw new Error("Logto 用户信息无效");
    return {
        user: {
            id: subject,
            username: usernameFromProfile(profile),
            displayName: firstNonEmpty(profile.name, profile.nickname, profile.preferred_username, profile.username, profile.email, subject),
            avatarUrl: firstNonEmpty(profile.picture, profile.avatar_url),
            email: profile.email || "",
        },
        newAPIToken: tokenFromResponse(token),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    } satisfies AuthSession;
}

function tokenFromResponse(token: OIDCTokenResponse, fallbackRefreshToken = ""): NewAPITokenSession | null {
    if (!token.access_token) return null;
    return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token || fallbackRefreshToken,
        tokenType: token.token_type || "Bearer",
        expiresAt: Date.now() + Math.max(30, Number(token.expires_in) || 3600) * 1000,
        scope: token.scope || process.env.NEW_API_LOGTO_SCOPE || "",
        audience: newAPIAudience(),
    };
}

async function fetchOIDCToken(endpoint: string, body: URLSearchParams) {
    const response = await fetch(serverLogtoURL(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as OIDCTokenResponse;
    if (!response.ok || payload.error) {
        throw new Error(payload.error_description || payload.error || "Logto 令牌交换失败");
    }
    return payload;
}

async function verifyIDToken(idToken: string, discovery: OIDCDiscovery, nonce: string) {
    const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Logto ID Token 格式无效");
    const header = parseBase64UrlJSON<{ alg?: string; kid?: string }>(encodedHeader);
    const payload = parseBase64UrlJSON<OIDCProfile & { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; nonce?: string }>(encodedPayload);
    if (!header.alg) throw new Error("Logto ID Token 缺少签名算法");
    if (payload.iss !== discovery.issuer) throw new Error("Logto ID Token Issuer 无效");
    const clientId = getAuthConfig().clientId;
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud || ""];
    if (!audience.includes(clientId)) throw new Error("Logto ID Token Audience 无效");
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || now > payload.exp + CLOCK_SKEW_SECONDS) throw new Error("Logto 登录状态已过期");
    if (payload.nbf && now + CLOCK_SKEW_SECONDS < payload.nbf) throw new Error("Logto ID Token 尚未生效");
    if (payload.nonce !== nonce) throw new Error("Logto 登录状态校验失败");
    const key = await findJWK(discovery.jwks_uri, header.kid);
    const valid = verifyJWTSignature(header.alg, key, `${encodedHeader}.${encodedPayload}`, encodedSignature);
    if (!valid) throw new Error("Logto ID Token 签名无效");
    return payload;
}

async function findJWK(jwksUri: string, kid?: string) {
    const cached = jwksCache.get(jwksUri);
    let keys = cached && cached.expiresAt > Date.now() ? cached.keys : [];
    if (!keys.length) {
        const response = await fetch(serverLogtoURL(jwksUri), { cache: "no-store" });
        if (!response.ok) throw new Error("Logto JWKS 读取失败");
        const payload = (await response.json()) as { keys?: JsonWebKey[] };
        keys = payload.keys || [];
        jwksCache.set(jwksUri, { keys, expiresAt: Date.now() + 1000 * 60 * 10 });
    }
    const key = keys.find((item) => !kid || item.kid === kid);
    if (!key) throw new Error("Logto JWKS 缺少匹配密钥");
    return key;
}

function verifyJWTSignature(alg: string, jwk: JsonWebKey, input: string, signatureText: string) {
    const signature = Buffer.from(signatureText, "base64url");
    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const data = Buffer.from(input);
    if (alg === "RS256") return crypto.verify("RSA-SHA256", data, key, signature);
    if (alg === "RS384") return crypto.verify("RSA-SHA384", data, key, signature);
    if (alg === "RS512") return crypto.verify("RSA-SHA512", data, key, signature);
    if (alg === "PS256") return crypto.verify("RSA-SHA256", data, { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, signature);
    if (alg === "PS384") return crypto.verify("RSA-SHA384", data, { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 }, signature);
    if (alg === "PS512") return crypto.verify("RSA-SHA512", data, { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 }, signature);
    if (alg === "ES256") return crypto.verify("SHA256", data, { key, dsaEncoding: "ieee-p1363" }, signature);
    if (alg === "ES384") return crypto.verify("SHA384", data, { key, dsaEncoding: "ieee-p1363" }, signature);
    if (alg === "ES512") return crypto.verify("SHA512", data, { key, dsaEncoding: "ieee-p1363" }, signature);
    throw new Error(`Logto ID Token 不支持 ${alg} 签名`);
}

async function fetchUserInfo(endpoint: string | undefined, accessToken: string) {
    if (!endpoint) return {};
    try {
        const response = await fetch(serverLogtoURL(endpoint), {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
        });
        if (!response.ok) return {};
        return (await response.json()) as OIDCProfile;
    } catch {
        return {};
    }
}

function mergeProfile(base: OIDCProfile, extra: OIDCProfile): OIDCProfile {
    return {
        sub: firstNonEmpty(base.sub, extra.sub),
        email: firstNonEmpty(extra.email, base.email),
        name: firstNonEmpty(extra.name, base.name),
        nickname: firstNonEmpty(extra.nickname, base.nickname),
        preferred_username: firstNonEmpty(extra.preferred_username, base.preferred_username),
        username: firstNonEmpty(extra.username, base.username),
        picture: firstNonEmpty(extra.picture, base.picture),
        avatar_url: firstNonEmpty(extra.avatar_url, base.avatar_url),
    };
}

function usernameFromProfile(profile: OIDCProfile) {
    const base = firstNonEmpty(profile.preferred_username, profile.username, profile.email?.split("@")[0] || "", profile.nickname, profile.name, profile.sub);
    return base.replace(/\s+/g, "-").replace(/[^\w.@-]/g, "").slice(0, 64) || "logto-user";
}

function encryptJSON(value: unknown) {
    const secret = sessionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

function decryptJSON<T>(value: string) {
    try {
        const [version, ivText, tagText, dataText] = value.split(".");
        if (version !== "v1" || !ivText || !tagText || !dataText) return null;
        const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey(), Buffer.from(ivText, "base64url"));
        decipher.setAuthTag(Buffer.from(tagText, "base64url"));
        const data = Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]);
        return JSON.parse(data.toString("utf8")) as T;
    } catch {
        return null;
    }
}

function sessionKey() {
    const secret = (process.env.SESSION_SECRET || "").trim();
    if (!secret) throw new Error("SESSION_SECRET 未配置");
    return crypto.createHash("sha256").update(secret).digest();
}

function readChunkedCookie(request: NextRequest, name: string) {
    const value = request.cookies.get(name)?.value || "";
    const match = value.match(/^chunks:(\d+)$/);
    if (!match) return value;
    const count = Math.min(12, Number(match[1]) || 0);
    let result = "";
    for (let index = 0; index < count; index += 1) {
        const chunk = request.cookies.get(`${name}.${index}`)?.value;
        if (!chunk) return "";
        result += chunk;
    }
    return result;
}

function cookieOptions(request?: NextRequest) {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: request ? requestOrigin(request).startsWith("https://") : process.env.COOKIE_SECURE === "true",
        path: "/",
    };
}

function parseBase64UrlJSON<T>(value: string) {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function firstNonEmpty(...values: Array<string | undefined>) {
    return values.find((value) => value && value.trim())?.trim() || "";
}

function trimTrailingSlash(value: string) {
    return value.trim().replace(/\/+$/, "");
}

function serverLogtoURL(url: string) {
    const config = getAuthConfig();
    if (!config.internalIssuer || !config.issuer || !url.startsWith(config.issuer)) return url;
    return `${config.internalIssuer}${url.slice(config.issuer.length)}`;
}

function publicLogtoDiscovery(discovery: OIDCDiscovery) {
    const config = getAuthConfig();
    if (!config.internalIssuer || !config.issuer) return discovery;
    const replace = (value?: string) => (value && value.startsWith(config.internalIssuer) ? `${config.issuer}${value.slice(config.internalIssuer.length)}` : value);
    return {
        ...discovery,
        issuer: replace(discovery.issuer) || discovery.issuer,
        authorization_endpoint: replace(discovery.authorization_endpoint) || discovery.authorization_endpoint,
        token_endpoint: replace(discovery.token_endpoint) || discovery.token_endpoint,
        userinfo_endpoint: replace(discovery.userinfo_endpoint),
        jwks_uri: replace(discovery.jwks_uri) || discovery.jwks_uri,
    };
}
