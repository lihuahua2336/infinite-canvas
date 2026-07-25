# Issue Tracker: GitHub

本仓库的 Issue 和 PRD 记录在 GitHub Issues 中，统一使用 `gh` CLI 操作。

## 约定

- 创建：`gh issue create --title "..." --body "..."`
- 阅读：`gh issue view <number> --comments`
- 列表：`gh issue list --state open --json number,title,body,labels,comments`
- 评论：`gh issue comment <number> --body "..."`
- 标签：`gh issue edit <number> --add-label "..."` 或 `--remove-label "..."`
- 关闭：`gh issue close <number> --comment "..."`

在仓库目录内运行命令，由 `gh` 根据 Git remote 自动识别仓库。

## Pull Request 作为 Triage 入口

**PRs as a request surface: no.**

GitHub 的 Issue 和 PR 共用编号；遇到 `#42` 时，先运行 `gh pr view 42`，失败后再运行 `gh issue view 42`。

## 技能操作规则

- “发布到 issue tracker”：创建 GitHub Issue。
- “读取相关 ticket”：运行 `gh issue view <number> --comments`。
- Wayfinder map 使用 `wayfinder:map` 标签。
- 子任务优先使用 GitHub sub-issue，必要时回退为任务列表。
- 阻塞关系优先使用 GitHub 原生 issue dependencies。
- 领取任务时运行 `gh issue edit <number> --add-assignee @me`。
