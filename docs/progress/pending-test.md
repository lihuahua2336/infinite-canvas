---
title: 待测试
description: 当前版本已实现但仍需人工验证的变更项
---

# 待测试

- EggAI Logto 登录、退出登录及登录后 New API 渠道自动配置流程
- 未登录访问业务页面、聊天或生图时自动进入 EggAI 授权流程
- 同一会话不重复获取 EggAI 渠道，刷新后重新同步首个令牌和模型列表
- Docker Compose 从 `.env` 注入 EggAI 公开构建配置，重建后登录页可识别 Logto 配置
