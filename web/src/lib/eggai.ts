export type EggAiUser = {
    id: string;
    username: string;
    displayName: string;
    email: string;
    avatarUrl: string;
};

export function safeRedirectPath(value: string | null | undefined) {
    const redirect = (value || "/").replace(/[\t\n\r]/g, "");
    if (!redirect.startsWith("/") || redirect.startsWith("//") || redirect.startsWith("/\\")) return "/";
    return redirect;
}
