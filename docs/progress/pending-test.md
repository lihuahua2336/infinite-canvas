---
title: 待测试
description: 当前版本已实现但仍需人工验证的变更项
---

# 待测试

- 合并上游 `dd5519f` 后验证素材分类与标签筛选、Agent 流式响应、Skills/Codex 面板及音视频编辑功能
- 验证上游新版 Agent 发送消息仍触发 EggAI 按需登录，工作流草稿仍使用 EggAI 文本渠道直连
- 验证云存储自动同步与本地图片保存共同工作，批量图片元数据和刷新恢复正常

- 尚无 Logto 管理员认领记录时，首个完成 Logto 登录的用户自动创建本地管理员账户，后续 Logto 用户默认创建为普通用户
- Logto 管理员进入 `/admin` 不再循环跳转登录，普通用户访问后台会返回主页
- Logto 本地账户初始化失败时后台显示重试提示，不会继续登录循环或沿用其他用户的旧 JWT
- 退出登录同时清除 Logto Cookie、EggAI 浏览器状态和本地权限 JWT
- EggAI Logto 登录、退出登录及登录后 New API 渠道自动配置流程
- 匿名访问主页、画布和创作页面，发起聊天或生图时才进入 EggAI 授权流程
- 退出 EggAI 后返回匿名主页，不再自动重新登录
- 同一会话不重复获取 EggAI 渠道，刷新后重新同步首个令牌和模型列表
- Logto 官方 Next.js App Router 服务端登录、HttpOnly Cookie 会话和退出登录流程
- Next.js 服务端使用 EggAI access token 获取 New API models/tokens，不再依赖浏览器 CORS
- 浏览器直连及后端任务生图完成后自动保存图片 Blob，刷新页面后工作台历史、工作流结果和画布图片仍可查看
- 工作流创建 Agent 在 EggAI 按需登录后使用当前文本模型和 EggAI 本地渠道直接生成草稿，不再要求旧项目账号登录
- 视频生成完成后自动保存视频 Blob，刷新页面后历史视频仍可播放
