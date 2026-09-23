---
title: EggAI 登录与 New API 配置
description: 使用 Logto 为无限画布接入 EggAI 登录，并自动配置 New API 渠道
---

# EggAI 登录与 New API 配置

本文说明如何为无限画布配置 EggAI（Logto）登录，以及登录后自动获取 New API 模型渠道。

## 工作方式

Next.js 服务端通过 Logto 官方 `@logto/next` SDK 完成 OIDC 登录，并把登录状态和 token 保存在加密的 HttpOnly Cookie 中。登录成功后，服务端会按 Logto `sub` 创建或更新本地账户，并签发本项目 JWT，用于角色、算力点和业务数据归属；本项目服务端同时使用 resource access token 请求 New API 的生态接口，浏览器接收各分组的模型和令牌配置并保存为本地渠道。

用户和管理员统一从 Logto 登录。尚未认领初始 Logto 管理员的部署中，第一个完成 Logto 登录并创建本地账户的用户自动成为管理员，后续用户默认为普通用户，只有管理员在用户管理中调整角色后才能访问 `/admin`。`ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 仅保留为 Logto 不可用时的应急恢复入口，不是正常登录方式。新实例应先由可信人员完成首次登录，再开放公网访问。

主页、画布和创作页面允许匿名浏览。用户实际发起画布聊天或图片生成时，如果尚未登录，页面才会跳转到 EggAI 授权；用户侧不再提供账号密码或 Linux.do 登录入口。

## Logto 配置

在 Logto 控制台创建 Traditional Web Application，并将以下地址加入允许列表：

```text
https://你的站点域名/callback
https://你的站点域名/
```

本地开发时使用：

```text
http://localhost:3000/callback
http://localhost:3000/
```

使用 Docker Compose 部署时，在项目根目录 `.env` 中设置：

```dotenv
LOGTO_ISSUER=https://你的租户.logto.app/oidc
LOGTO_INTERNAL_ISSUER=
LOGTO_CLIENT_ID=你的应用 ID
LOGTO_CLIENT_SECRET=你的应用密钥
LOGTO_SCOPE=openid profile email
SESSION_SECRET=随机生成的长字符串
APP_PUBLIC_URL=http://localhost:3000
COOKIE_SECURE=false
```

`LOGTO_ISSUER` 可以填写带 `/oidc` 的 Issuer，服务端会转换为 Logto endpoint。`LOGTO_INTERNAL_ISSUER` 仅用于容器需要通过内部地址访问 Logto 的场景。`SESSION_SECRET` 至少 32 个字符，同时用于 Cookie 加密和 Next.js 到 Go 的内部身份桥接，两个进程必须读取同一个值；本地 HTTP 必须使用 `COOKIE_SECURE=false`，生产 HTTPS 使用 `true`。

所有变量都由 Next.js 服务端在运行时读取，不使用 `NEXT_PUBLIC_*`，Client Secret 和 access token 不会进入浏览器构建产物。

## New API 自动渠道

登录后自动获得模型渠道需要补充：

```dotenv
NEW_API_BASE_URL=https://你的-new-api.example.com
NEW_API_PUBLIC_URL=https://你的-new-api.example.com
NEW_API_LOGTO_AUDIENCE=https://你的-new-api.example.com/api
NEW_API_LOGTO_SCOPE=ecosystem:me ecosystem:models:read ecosystem:tokens:read ecosystem:groups:read
NEW_API_DISPLAY_NAME=EggAI
```

`NEW_API_BASE_URL` 是 Next.js 服务端请求地址，`NEW_API_PUBLIC_URL` 是保存到本地渠道的浏览器可访问地址。Audience 和 scope 必须与 Logto API Resource、New API 服务端配置完全一致。

New API 需要允许该 Logto 应用请求对应 audience 和 scope，并且用户已有可用模型和生态令牌。Next.js 服务端会读取：

- `/api/ecosystem/tokens`
- 使用各分组首个令牌请求 `/v1/models`

系统将令牌的 `group` 视为平台，每个分组按返回顺序取第一把令牌，并将其专属模型列表配置到对应的本地渠道。已有同名且 Base URL、API Key、模型完整的渠道不会被默认值覆盖。如果没有可用模型或令牌，登录会停留在授权提示页，并显示 New API 返回的错误信息。

同一页面运行期间已有 EggAI 本地渠道时不会重复请求。浏览器刷新后会重新获取各分组首个令牌及其模型列表，补充缺失或未配置完整的渠道。

## 部署步骤

1. 在 Logto 中创建应用并配置 `/callback` 回调地址。
2. 在 New API 中配置对应的 Logto 资源、scope 和用户令牌。
3. 将上述变量写入部署环境的 `.env`。
4. 首次执行 `docker compose up -d --build`；以后只修改认证变量时重启容器即可。
5. 匿名打开主页、画布或创作页面，发起聊天或图片生成时进入 EggAI 授权；也可以从 `/login` 手动开始登录。
6. 首位用户登录后进入 `/admin` 确认管理员权限；后续用户默认只能访问普通功能。
7. 登录完成后返回触发登录前的页面，检查配置弹窗中的本地渠道和模型列表。

## 安全说明

`LOGTO_CLIENT_SECRET` 和 EggAI access token 只在 Next.js 服务端使用。`SESSION_SECRET` 由 Next.js 和同一应用内的 Go 服务共享，Go 仅接受携带该密钥的本地账户桥接请求；该接口即使经代理暴露也不能信任浏览器提交的身份。New API 返回的生态令牌仍会保存到当前浏览器的本地渠道配置中；请使用权限受限、可撤销的令牌，并避免在公共设备上保持登录状态。

浏览器不再直接请求 New API，因此 models/tokens 获取不依赖 New API 对画布域名开放 CORS。生产环境仍需保证 Next.js 容器可以通过 HTTPS 访问 Logto 和 New API。

## 常见问题

### 登录后提示回调地址错误

检查 Logto 允许的 Redirect URI 是否与当前访问地址完全一致，包括协议、域名、端口和 `/callback` 路径。

### 提示缺少 `NEW_API_LOGTO_AUDIENCE`

配置了 `NEW_API_PUBLIC_URL` 后，必须同时配置 New API 在 Logto 中对应的 audience。

### 提示没有可用模型或令牌

检查 New API 中的模型渠道和生态令牌，确认当前 EggAI 用户具有读取 `ecosystem:models:read` 和 `ecosystem:tokens:read` 的权限。

### 修改环境变量后没有生效

认证变量由 Next.js 服务端运行时读取，修改后需要重新创建或重启整个应用容器。
