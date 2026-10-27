---
title: ChatGPT Share to Obsidian Skill
aliases:
  - ChatGPT 分享转笔记 Skill
  - chatgpt-share-to-obsidian
tags:
  - skill
  - obsidian
  - chatgpt
  - workflow
created: "2026-10-27"
updated: "2026-10-27"
type: reference
status: active
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
---

# ChatGPT Share to Obsidian Skill

返回：[[开发知识库]]

## 用途

把一个 ChatGPT 分享链接转换成按原始章节编号的 Obsidian 笔记。

正文采用**逐字保留**模式，不做摘要、不改写、不重新组织原章节。

## 调用方式

```text
$chatgpt-share-to-obsidian <ChatGPT分享链接> <存放目录>
```

示例：

```text
$chatgpt-share-to-obsidian https://chatgpt.com/share/... /Users/gao/sweetsunnyflower/Harness
```

## 自动流程

1. 在本机 Chrome 打开分享链接。
2. 获取分享页数据。
3. 选择最终可见或合并后的助手回答。
4. 排除隐藏的流式重复片段。
5. 按原文“第 N 课 / 第 N 章 / 第 N 讲”拆分。
6. 生成编号笔记、知识地图和来源清单。
7. 若目标位于 Vault，接入 [[开发知识库]]。
8. 逐字验证正文、回链和文件哈希。

## 输出

```text
<存放目录>/
├── 00 导论.md
├── 01 第一章.md
├── 02 第二章.md
├── <主题> 知识地图.md
└── .chatgpt-share-notes.json
```

## 安全与更新

- 只处理 `chatgpt.com/share/...` 链接。
- 不读取或保存 Cookie、密码、Token。
- 不覆盖清单之外的同名文件。
- 同一来源可以安全重跑；只更新该来源生成的笔记。
- 文件名冲突时停止并报告。

## 测试结果

- Harness 分享页：14 篇，正文逐字验证通过。
- 计算机基础分享页：34 篇，正文逐字验证通过。
- 单元与端到端测试：22 项通过。

## Skill 文件

```text
/Users/gao/.agents/skills/chatgpt-share-to-obsidian/
├── SKILL.md
├── scripts/
│   ├── extract_chatgpt_share.js
│   ├── build_obsidian_notes.js
│   ├── verify_notes.js
│   ├── update_obsidian_index.js
│   └── e2e_local.js
├── references/chatgpt-share-format.md
├── tests/
└── evals/evals.json
```
