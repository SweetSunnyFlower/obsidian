---
title: Obsidian Session Notes Skill
aliases:
  - 会话笔记 Skill
  - obsidian-session-notes
tags:
  - skill
  - obsidian
  - workflow
created: 2026-10-27
updated: 2026-10-27
---

# Obsidian Session Notes Skill

返回：[[开发知识库]]

## 用途

把当前 Codex 对话整理成一篇可复用的 Obsidian 会话笔记，而不是逐字复制聊天。

它会提取：

- 背景与目标
- 关键决策
- 命令与配置
- 文件与产物
- 问题与修复
- 待办与下一步
- 关联笔记

## 调用方式

在 Codex 中直接说：

```text
用 obsidian-session-notes 总结这次对话
```

或使用 skill 调用名：

```text
/obsidian-session-notes
$obsidian-session-notes
```

## 输出位置

默认：

```text
/Users/gao/sweetsunnyflower/Inbox/
YYYY-MM-DD HHmm <Topic>.md
```

Expo 相关任务可以归档到 `Expo/`，并自动关联 [[Expo 知识地图]]。

## 自动关联

- 默认返回 [[开发知识库]]
- Expo 任务关联 [[Expo 知识地图]]
- 在索引的 `## 会话记录` 下追加链接

## 安全规则

不会写入密码、API Key、Cookie、验证码、私钥等敏感信息；手机号和设备标识会按需脱敏。

## Skill 文件

```text
/Users/gao/.agents/skills/obsidian-session-notes/
├── SKILL.md
├── assets/session-note-template.md
├── references/vault-conventions.md
├── scripts/check_links.py
└── evals/evals.json
```
