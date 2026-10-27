---
title: "00 Harness Engineering 导论与学习路线"
aliases:
  - "Harness Engineering 导论与学习路线"
tags:
  - harness
  - ai-agent
  - verbatim
  - overview
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "6253a897-bed8-4a88-821c-a1e8823d8463"
source_turn_id: "ac8a1a18-aff1-4408-8fcf-e63e62e18554"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：00  
> 原始章节：导论  
> 合并消息 ID：`6253a897-bed8-4a88-821c-a1e8823d8463`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 你来教我harness相关的知识吧
> ~~~

返回：[[Harness 知识地图]]

---

好！咱们这次系统地学一遍 **Harness Engineering（Harness 工程）**，不只停留在概念层面，而是从原理、架构到实际编码，一步步搞清楚它到底怎么工作。

结合你有 Go、Node.js 开发经验，又在研究 Claude Code、Codex、Pi 这类 Agent，我建议咱们直接从 **AI Agent Harness（智能体运行框架与控制系统）** 入手。

这里有一个很重要的认识：

**模型决定 Agent 能够思考什么，Harness 决定 Agent 能够做什么、如何做、什么时候停，以及出错后怎么办。**

## 一、先建立整体认知

<box gap={3}>
  <box border radius="xl" padding={4} gap={2}>
    <row align="center" gap={3}>
      <AsyncImage query="abstract neural network glowing brain artificial intelligence dark background" aspectRatio="1:1" maxWidth="76px"/>
      <box flex="1" gap={1}>
        <title size="lg">1. Model（模型）</title>
        <text color="secondary" size="sm">负责理解、推理、生成下一步决策</text>
        例如 GPT、Claude、DeepSeek。模型通常通过输入上下文，输出文本、工具调用或结构化结果。
      </box>
    </row>
  </box>
  <box align="center">
    <icon name="arrow-down-up" size="xl" color="secondary"/>
  </box>
  <box border radius="xl" padding={4} gap={2}>
    <row align="center" gap={3}>
      <AsyncImage query="software orchestration control flow nodes connected workflow dark developer interface" aspectRatio="1:1" maxWidth="76px"/>
      <box flex="1" gap={1}>
        <title size="lg">2. Harness（运行控制层）</title>
        <text color="secondary" size="sm">负责组织模型与工具之间的整个执行过程</text>
        管理对话循环、工具执行、权限、上下文、状态、异常、终止条件和事件通知。
      </box>
    </row>
  </box>
  <box align="center">
    <icon name="arrow-down" size="xl" color="secondary"/>
  </box>
  <box border radius="xl" padding={4} gap={2}>
    <row align="center" gap={3}>
      <AsyncImage query="terminal coding agent file system tools browser computer automation developer workstation" aspectRatio="1:1" maxWidth="76px"/>
      <box flex="1" gap={1}>
        <title size="lg">3. Environment（执行环境）</title>
        <text color="secondary" size="sm">Agent 真正工作的地方</text>
        例如终端、文件系统、Git、浏览器、数据库、沙箱，以及远程执行服务器。
      </box>
    </row>
  </box>
</box>

举个例子：你对一个编程 Agent 说：

> 帮我修复这个 Go 项目的编译错误，运行测试，并提交修改。

模型可能先决定查看项目，再调用工具。Harness 负责真正执行命令、把结果交回模型、检查权限、控制后续循环，并在满足条件时结束任务。

**所以，Harness 不等于 Prompt，也不等于 Agent 框架。** 它更接近一套让模型可靠地完成任务的运行时和控制系统。

## 二、Harness 和 Agent Framework 有什么区别？

这是初学者最容易混淆的地方。

| 概念 | 主要职责 | 例子 |
|---|---|---|
| LLM | 理解与推理 | GPT、Claude、DeepSeek |
| AI SDK | 提供模型调用、流式输出等 API | Vercel AI SDK |
| Agent Framework | 提供构建 Agent 的抽象和组件 | LangChain、LangGraph |
| Agent Harness | 驱动 Agent 循环，管理工具、上下文、权限与状态 | Codex、Claude Code、Pi |
| Orchestrator | 协调多个 Agent 或任务 | 多 Agent 调度系统 |
| Sandbox | 隔离代码与命令执行 | Docker、隔离运行环境 |

这些分类并不是绝对互斥的。一个产品可能同时承担多种职责。例如，框架可以提供 Agent Loop，Harness 也可以内置工作流协调能力。<Cite refs={["turn164186search1","turn164186search2","turn164186search4"]}/>

## 三、一个 Harness 的核心架构

先记住下面这张图。后续我们会逐个模块拆解。

<box border radius="xl" padding={3} gap={1} align="center">
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **用户任务 / Task**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center" gap={1}>
    **Session & Context Manager**
    <text color="secondary" size="sm">会话、历史消息、系统指令、压缩上下文</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="#173D35" theme="dark" radius="lg" padding={3} width="100%" align="center" gap={1}>
    **Agent Loop / Runtime**
    <text size="sm">请求模型 → 解析结果 → 调用工具 → 判断是否继续</text>
  </box>
  <row align="center" width="100%" gap={2}>
    <box flex="1" align="center" gap={1}>
      <icon name="arrow-down" color="secondary" size="lg"/>
      <box border radius="lg" padding={3} width="100%" align="center" gap={1}>
        **Tool Registry**
        <text color="secondary" size="sm">工具定义与分发</text>
      </box>
      <icon name="arrow-down" color="secondary" size="lg"/>
      <box background="surface" border radius="lg" padding={3} width="100%" align="center" gap={1}>
        <icon name="terminal" size="xl"/>
        **执行环境**
        <text color="secondary" size="sm">Shell / 文件 / Git</text>
      </box>
    </box>
    <box flex="1" align="center" gap={1}>
      <icon name="arrow-down" color="secondary" size="lg"/>
      <box border radius="lg" padding={3} width="100%" align="center" gap={1}>
        **Policy Engine**
        <text color="secondary" size="sm">权限、审批、预算</text>
      </box>
      <icon name="arrow-down" color="secondary" size="lg"/>
      <box background="surface" border radius="lg" padding={3} width="100%" align="center" gap={1}>
        <icon name="activity" size="xl"/>
        **事件与状态**
        <text color="secondary" size="sm">日志、进度、错误、恢复</text>
      </box>
    </box>
  </row>
  <text color="secondary" size="xs">教学用逻辑架构图，实际系统的模块边界会有所不同。</text>
</box>

实际开发时，最重要的并不是先把所有模块都做出来，而是先理解核心循环，再逐步增加可靠性、安全性和长任务支持。

## 四、我们的学习路线

我建议按下面的顺序学习。每一章都会有原理、代码、运行流程和练习。

<box border radius="xl" padding={3} gap={3}>
  {@body const lessons = [
    {n:"01",title:"Harness 基础与 Agent Loop",desc:"模型请求、工具调用、循环控制、结束条件",tag:"现在学习"},
    {n:"02",title:"Tool Runtime",desc:"工具注册、参数校验、并行调用、错误处理"},
    {n:"03",title:"Context Engineering",desc:"消息历史、上下文预算、裁剪与压缩"},
    {n:"04",title:"Session 与状态管理",desc:"会话持久化、任务恢复、事件流与中断"},
    {n:"05",title:"权限与 Sandbox",desc:"命令审批、文件访问、隔离执行与安全边界"},
    {n:"06",title:"Planning 与多步骤执行",desc:"计划、任务分解、重试、循环检测"},
    {n:"07",title:"Skills、MCP 与扩展机制",desc:"技能发现、渐进式加载、外部工具接入"},
    {n:"08",title:"Subagent 与 Orchestration",desc:"子 Agent、任务委派、并行工作与结果汇总"},
    {n:"09",title:"Observability 与 Evaluation",desc:"事件追踪、测试集、执行质量与成本评估"},
    {n:"10",title:"动手实现一个 Coding Harness",desc:"从简单循环逐步构建一个可运行的代码 Agent"}
  ]}
  {#each lessons as lesson}
    <row key={lesson.n} gap={3} align="start">
      <box background="surface-secondary" radius="md" size="42px" align="center" justify="center">
        <title size="lg">{lesson.n}</title>
      </box>
      <box flex="1" gap={1}>
        **{lesson.title}**
        <text color="secondary" size="sm">{lesson.desc}</text>
      </box>
      {#if lesson.n==="01"}
        <badge color="success">当前</badge>
      {/if}
    </row>
  {/each}
</box>

这套路线综合了当前 Coding Harness 的典型设计：执行循环、上下文管理、工具与安全控制、状态恢复，以及工程反馈闭环。OpenAI 在其 Harness Engineering 实践中也特别强调了可验证的工程约束、仓库知识和持续反馈。<Cite refs={["turn164186search0","turn164186search3"]}/>
