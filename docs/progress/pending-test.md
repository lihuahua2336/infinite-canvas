---
title: 待测试
description: 当前版本已实现但仍需人工验证的变更项
---

# 待测试

- EggAI Logto 登录、退出登录及登录后 New API 渠道自动配置流程
- 未登录访问业务页面、聊天或生图时自动进入 EggAI 授权流程
- 同一会话不重复获取 EggAI 渠道，刷新后重新同步首个令牌和模型列表
- Logto 官方 Next.js App Router 服务端登录、HttpOnly Cookie 会话和退出登录流程
- Next.js 服务端使用 EggAI access token 获取 New API models/tokens，不再依赖浏览器 CORS
