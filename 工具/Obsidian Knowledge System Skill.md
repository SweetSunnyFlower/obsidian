---
title: Obsidian Knowledge System Skill
aliases:
  - 主题知识体系 Skill
  - obsidian-knowledge-system
tags:
  - skill
  - obsidian
  - knowledge-system
created: 2026-10-27
updated: 2026-10-27
---

# Obsidian Knowledge System Skill

返回：[[开发知识库]]

## 用途

在没有对话上下文时，根据一个主题或外部资料，生成一套相互链接的 Obsidian 知识体系。

它和 [[Obsidian Session Notes Skill]] 的分工：

| Skill | 输入 | 输出 |
|---|---|---|
| [[Obsidian Session Notes Skill]] | 当前对话 | 会话纪要 |
| Obsidian Knowledge System Skill | 主题、URL、PDF、仓库 | MOC + 原子知识笔记 |

## 调用方式

```text
用 obsidian-knowledge-system 在 /Users/gao/sweetsunnyflower 建一套 Docker 知识体系
```

或：

```text
/obsidian-knowledge-system
$obsidian-knowledge-system
```

## 支持的模式

- 主题模式：直接给主题，例如 Docker、Kubernetes；
- 资料模式：根据官方文档、URL、PDF、GitHub 仓库整理；
- 混合模式：对话 + 外部资料一起整理。

## 默认输出

```text
/Users/gao/sweetsunnyflower/<Topic>/
  <Topic> 知识地图.md
  <Topic> 基础概念.md
  ...
```

它会把主题 MOC 链接到 [[开发知识库]]，并检查断链。

## 质量约束

- 先查当前官方文档，不凭记忆编版本相关命令；
- 默认 6–12 篇核心笔记，避免碎成大量空笔记；
- 每篇笔记包含心智模型、示例、常见误区和来源；
- 所有笔记回到 MOC，所有链接必须通过检查。

## Skill 文件

```text
/Users/gao/.agents/skills/obsidian-knowledge-system/
├── SKILL.md
├── assets/
│   ├── moc-template.md
│   ├── concept-note-template.md
│   ├── how-to-template.md
│   └── troubleshooting-template.md
├── references/
│   ├── vault-conventions.md
│   ├── topic-blueprint.md
│   └── source-policy.md
├── scripts/check_links.py
└── evals/evals.json
```
