---
title: EggAI 登录与 New API 配置
description: 使用 Logto 为无限画布接入 EggAI 登录，并自动配置 New API 渠道
---

# EggAI 登录与 New API 配置

本文说明如何为无限画布配置 EggAI（Logto）登录，以及登录后自动获取 New API 模型渠道。

## 工作方式

浏览器中的 Logto SDK 负责完成 OIDC 登录。登录成功后，前端读取 ID Token 中的用户资料，并使用 access token 请求 New API 的生态接口，获取模型和令牌，然后把选中的令牌保存到浏览器本地渠道配置中。

未配置 Logto 时，项目仍使用原有的账号密码和 Linux.do 登录流程。New API 配置也是可选的；只配置 Logto 时可以登录，但不会自动创建模型渠道。

## Logto 配置

在 Logto 控制台创建一个 Web 应用，并将以下回调地址加入允许列表：

```text
https://你的站点域名/callback
```

本地开发时使用：

```text
http://localhost:3000/callback
```

在部署环境的 `.env` 中设置：

```dotenv
NEXT_PUBLIC_LOGTO_ISSUER=https://你的租户.logto.app/oidc
NEXT_PUBLIC_LOGTO_CLIENT_ID=你的应用 ID
NEXT_PUBLIC_LOGTO_SCOPE=openid profile email
```

`NEXT_PUBLIC_LOGTO_ISSUER` 可以填写带 `/oidc` 的 Issuer 地址，前端会自动去掉末尾路径后初始化 Logto SDK。

## New API 自动渠道

如果希望登录后自动获得模型渠道，再补充：

```dotenv
NEXT_PUBLIC_NEW_API_PUBLIC_URL=https://你的-new-api.example.com
NEXT_PUBLIC_NEW_API_LOGTO_AUDIENCE=https://你的-new-api.example.com
NEXT_PUBLIC_NEW_API_LOGTO_SCOPE=ecosystem:me ecosystem:models:read ecosystem:tokens:read
NEXT_PUBLIC_NEW_API_DISPLAY_NAME=New API
```

New API 需要允许该 Logto 应用请求对应 audience 和 scope，并且用户在 New API 中已有可用模型和生态令牌。前端登录后会读取：

- `/api/ecosystem/models`
- `/api/ecosystem/tokens`

如果没有可用模型或令牌，登录会停留在授权提示页，并显示 New API 返回的错误信息。

## 部署步骤

1. 在 Logto 中创建应用并配置 `/callback` 回调地址。
2. 在 New API 中配置对应的 Logto 资源、scope 和用户令牌。
3. 将上述变量写入部署环境的 `.env`。
4. 重新构建并启动前端，使 `NEXT_PUBLIC_*` 变量进入浏览器构建产物。
5. 打开 `/login`，点击“使用 EggAI 登录”。
6. 登录完成后返回画布，检查配置弹窗中的本地渠道和模型列表。

## 安全说明

`NEXT_PUBLIC_*` 变量会暴露给浏览器，因此不能在其中放置管理员密钥或 New API 的服务端密钥。New API 生态令牌也会被保存到当前浏览器的本地配置中；请为用户创建权限受限、可撤销的令牌，并避免在公共设备上保持登录状态。

当前实现由浏览器直接请求 Logto 和 New API，服务端不会代替浏览器保存 EggAI access token。生产环境需要确保 New API 的 CORS、HTTPS 和 Logto 资源配置允许该站点访问。

## 常见问题

### 登录后提示回调地址错误

检查 Logto 允许的 Redirect URI 是否与当前访问地址完全一致，包括协议、域名、端口和 `/callback` 路径。

### 提示缺少 `NEW_API_LOGTO_AUDIENCE`

配置了 `NEXT_PUBLIC_NEW_API_PUBLIC_URL` 后，必须同时配置 New API 在 Logto 中对应的 audience。

### 提示没有可用模型或令牌

检查 New API 中的模型渠道和生态令牌，确认当前 EggAI 用户具有读取 `ecosystem:models:read` 和 `ecosystem:tokens:read` 的权限。

### 修改环境变量后没有生效

`NEXT_PUBLIC_*` 变量在 Next.js 构建阶段注入。修改后需要重新构建前端并清理旧容器，而不是只重启 Go 后端。
