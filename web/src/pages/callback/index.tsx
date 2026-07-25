import { Alert, Spin } from "antd";
import { useHandleSignInCallback } from "@logto/react";
import { Link } from "react-router-dom";

export default function CallbackPage() {
    const { error } = useHandleSignInCallback();

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
            {error ? (
                <Alert type="error" showIcon message="EggAi 登录回调失败" description={<><span>{error.message}</span><Link className="ml-2" to="/login">重新登录</Link></>} />
            ) : (
                <Spin tip="正在完成登录" />
            )}
        </main>
    );
}
