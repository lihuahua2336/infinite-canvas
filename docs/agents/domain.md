# Domain Docs

## 探索代码前

- 阅读根目录的 `CONTEXT.md`。
- 如果存在 `CONTEXT-MAP.md`，按其中索引读取相关上下文。
- 阅读 `docs/adr/` 中与当前工作相关的 ADR。
- 文件不存在时继续工作，不主动创建空文档。

## 布局

本仓库采用 single-context：

```text
/
├── CONTEXT.md
└── docs/adr/
```

`CONTEXT.md` 和 ADR 由 `domain-modeling` 在形成真实术语或决策时按需创建。

## 领域语言

Issue、规格、测试和代码应使用 `CONTEXT.md` 中定义的术语，避免改用已明确排除的同义词。

## ADR 冲突

若工作内容与现有 ADR 冲突，必须明确指出冲突及重新讨论该决策的理由。
