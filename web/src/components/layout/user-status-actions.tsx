import type { CSSProperties } from "react";
import { useLogto } from "@logto/react";
import { App } from "antd";
import { BookOpen, Keyboard, LogOut, Puzzle, Settings2, UserCircle } from "lucide-react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { DOCS_URL } from "@/constant/env";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const { message } = App.useApp();
    const { isAuthenticated, signOut } = useLogto();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const setNewAPIConfig = useConfigStore((state) => state.setNewAPIConfig);
    const user = useUserStore((state) => state.user);
    const hasPassedEggAiGate = useUserStore((state) => state.hasPassedEggAiGate);
    const revokeEggAiGate = useUserStore((state) => state.revokeEggAiGate);
    const completeEggAiLogout = useUserStore((state) => state.completeEggAiLogout);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const logoutLabel = user ? "退出登录" : "退出本机访问";

    const logout = async () => {
        revokeEggAiGate();
        setNewAPIConfig(null);
        if (isAuthenticated) {
            try {
                await signOut(new URL("/login", window.location.origin).toString());
            } catch (error) {
                completeEggAiLogout();
                message.error(error instanceof Error ? error.message : "退出 EggAi 登录失败");
            }
            return;
        }
        completeEggAiLogout();
        window.location.assign("/login");
    };

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {user ? (
                <span className={naturalIconClass} style={iconStyle} aria-label={user.displayName || user.username} title={user.displayName || user.username}>
                    <UserCircle className="size-4" />
                </span>
            ) : null}
            {onOpenPlugins ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label="节点插件" title="节点插件">
                    <Puzzle className="size-4" />
                </button>
            ) : null}
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                <BookOpen className="size-4" />
            </a>
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {user || hasPassedEggAiGate ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => void logout()} aria-label={logoutLabel} title={logoutLabel}>
                    <LogOut className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
