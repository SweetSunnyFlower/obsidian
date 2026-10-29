---
title: "Harness 第二十课 - Coding Harness 的完整架构整合"
aliases:
  - "Harness 第二十课 - Coding Harness 的完整架构整合"
tags:
  - harness
  - ai-agent
  - verbatim
  - architecture
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "4fcdb8bb-a4d2-4504-99ae-25121ebdf3a6"
source_user_message_id: "8549df42-5e7f-49af-a98f-603609dc656f"
source_content_sha256: "52a23180d2c3a30033d0f8217ff981306e602fad45a1108aa7ec1e4c99fed21d"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：20  
> 原始章节：Harness 第二十课：Coding Harness 的完整架构整合  
> 合并消息 ID：`4fcdb8bb-a4d2-4504-99ae-25121ebdf3a6`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一节
> ~~~

返回：[[Harness 知识地图]]

---

好，我们进入 **Harness 第二十课：Coding Harness 的完整架构整合**。

前面十九课，我们分别学习了 Agent Loop、Tool Runtime、权限控制、状态机、持久化、Sandbox、模型适配、代码检索和评估系统。今天不再孤立地讲某一个模块，而是把它们组合起来，设计一套真正可以开始编码的 Coding Harness。

这节课的目标是：**给你一个完整的系统架构，明确每个模块的职责、调用顺序、数据流，以及用 Go 实现时的目录结构。**

# 一、先看完整架构

<box border radius="xl" padding={3} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
    <icon name="message-square" size="xl" />
    **用户接口层**
    <text color="secondary" size="sm">CLI / Web UI / API</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} gap={1}>
    <title size="md" textAlign="center">Task Orchestrator</title>
    <text size="sm" textAlign="center" color="secondary">任务创建、调度、取消、恢复与状态管理</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface" border radius="lg" padding={3} gap={2}>
    <title size="lg" textAlign="center">Agent Runtime</title>
    <grid columns={2} gap={2}>
      <grid-item>
        <box background="surface-secondary" radius="md" padding={2} align="center">
          **Agent Loop**
          <text color="secondary" size="xs">执行循环</text>
        </box>
      </grid-item>
      <grid-item>
        <box background="surface-secondary" radius="md" padding={2} align="center">
          **Context Builder**
          <text color="secondary" size="xs">上下文构建</text>
        </box>
      </grid-item>
      <grid-item>
        <box background="surface-secondary" radius="md" padding={2} align="center">
          **Model Router**
          <text color="secondary" size="xs">模型路由</text>
        </box>
      </grid-item>
      <grid-item>
        <box background="surface-secondary" radius="md" padding={2} align="center">
          **Completion Gate**
          <text color="secondary" size="xs">完成判定</text>
        </box>
      </grid-item>
    </grid>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box border radius="lg" padding={3} gap={1}>
        <icon name="wrench" size="lg" />
        **Tool Runtime**
        <text size="sm" color="secondary">工具注册、参数校验、授权、执行、结果封装</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} gap={1}>
        <icon name="shield-check" size="lg" />
        **Safety Layer**
        <text size="sm" color="secondary">审批、Sandbox、资源限制、路径保护</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} gap={1}>
        <icon name="database" size="lg" />
        **Persistence**
        <text size="sm" color="secondary">任务状态、事件日志、Checkpoint</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} gap={1}>
        <icon name="search" size="lg" />
        **Code Intelligence**
        <text size="sm" color="secondary">文件搜索、符号索引、上下文检索</text>
      </box>
    </grid-item>
  </grid>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
    <icon name="git-branch" size="xl" />
    **Workspace Manager**
    <text color="secondary" size="sm">Git Worktree、文件变更、测试、Diff 与验收</text>
  </box>
</box>

这张图展示的是逻辑架构，不代表所有模块必须运行在同一个进程里。

初期完全可以使用单个 Go 进程和 SQLite；当任务量、并发量或可靠性要求上升时，再把任务调度、Worker 和持久化拆分。

## 二、一次 Coding 任务究竟怎么运行？

假设用户输入：

> 修复登录接口中 Token 过期后仍然允许访问的问题，并补充测试。

Harness 不是简单地把这句话发给模型，然后等待回答。它需要组织一个完整的执行流程。

<box border radius="xl" padding={3} gap={2}>
  <list connector="solid" marker="number" gap={3}>
    <list-item>
      **创建任务**

      持久化用户需求、仓库路径、任务 ID、权限策略和预算。
    </list-item>
    <list-item>
      **准备工作区**

      创建独立 Git Worktree，检查初始状态，避免覆盖用户已有修改。
    </list-item>
    <list-item>
      **构建上下文**

      读取项目约定，搜索 Token 验证代码、调用方和相关测试。
    </list-item>
    <list-item>
      **调用模型**

      Model Router 选择满足能力与预算要求的模型，Adapter 负责协议转换。
    </list-item>
    <list-item>
      **处理工具调用**

      验证参数、检查权限和资源冲突，再交给 Tool Runtime 执行。
    </list-item>
    <list-item>
      **观察与更新状态**

      保存工具结果、事件日志和必要的恢复信息，更新任务进度。
    </list-item>
    <list-item>
      **验证修改**

      检查 Git Diff，运行相关测试和必要的完整验证，检查是否触碰禁止修改的文件。
    </list-item>
    <list-item>
      **完成或继续**

      根据验收结果决定继续修复、重新规划、等待审批、失败或完成。
    </list-item>
  </list>
</box>

注意，完成任务不等于模型说“修复完成”，也不等于某个工具返回成功。

**任务只有在规定的验收条件通过，并且安全与持久化要求满足后，才能进入 completed 状态。**

---

# 三、核心模块之间应该如何划分职责？

这是架构整合最重要的一部分。

| 模块 | 负责什么 | 不应该负责什么 |
|---|---|---|
| Agent Loop | 决定下一步行动 | 绕过权限直接执行工具 |
| Model Adapter | 转换模型协议 | 自行执行模型请求的工具 |
| Tool Runtime | 校验、调度、执行工具 | 自行判断整个任务是否完成 |
| Policy Engine | 判断操作是否被允许 | 依赖模型口头保证安全 |
| State Machine | 管理合法状态转换 | 仅凭内存变量恢复任务 |
| Persistence | 保存状态和事件 | 把日志写入当作业务成功 |
| Workspace Manager | 管理工作区和变更 | 擅自覆盖用户已有改动 |
| Completion Gate | 检查验收条件 | 仅相信模型的完成声明 |

举个例子：模型提出执行 `rm -rf`。

Model Adapter 不应该负责判断这条命令是否安全；它只负责将模型输出转换为内部 Tool Call。

随后，Policy Engine 判断操作是否允许，Tool Runtime 在授权范围内执行，Persistence 记录状态。最后，Agent Loop 根据结果决定下一步。

这样每个模块的职责才不会混在一起。

# 四、用 Go 定义核心接口

我们先不实现所有细节，而是先确定模块之间的契约。

建议项目结构如下：

```text
coding-harness/
├── cmd/
│   └── harness/
│       └── main.go
├── internal/
│   ├── task/
│   │   ├── types.go
│   │   └── state_machine.go
│   ├── agent/
│   │   ├── loop.go
│   │   └── completion.go
│   ├── model/
│   │   ├── types.go
│   │   ├── router.go
│   │   └── adapter.go
│   ├── tool/
│   │   ├── registry.go
│   │   ├── executor.go
│   │   └── policy.go
│   ├── workspace/
│   │   ├── manager.go
│   │   └── git.go
│   ├── retrieval/
│   │   └── search.go
│   ├── persistence/
│   │   ├── repository.go
│   │   └── events.go
│   └── evaluation/
│       └── evaluator.go
└── go.mod
```

### 1. Agent Runtime 的模型接口

文件：`internal/model/adapter.go`

```go
package model

import "context"

type Adapter interface {
    Generate(
        ctx context.Context,
        request Request,
    ) (Response, error)
}
```

这里的 `Request` 和 `Response` 是 Harness 内部定义的类型，不应直接使用某个供应商的 SDK 类型。

这样将来更换模型，只需要实现新的 Adapter，而不是修改整个 Agent Loop。

### 2. 工具执行接口

文件：`internal/tool/executor.go`

```go
package tool

import "context"

type Call struct {
    ID        string
    Name      string
    Arguments []byte
}

type Result struct {
    CallID string
    Status string
    Output string
    Error  string
}

type Executor interface {
    Execute(
        ctx context.Context,
        call Call,
    ) (Result, error)
}
```

这是一个最小接口示例。真实实现中，最好明确区分工具业务执行失败与执行器自身错误，并增加超时、截断、审计、结果未知等状态。

另外，不能因为 `Execute` 返回了错误，就直接假定工具没有产生副作用。对于外部 API、文件操作或其他非事务性操作，需要结合持久化记录和对账机制判断真实结果。

### 3. 任务持久化接口

文件：`internal/persistence/repository.go`

```go
package persistence

import (
    "context"

    "coding-harness/internal/task"
)

type TaskRepository interface {
    Create(
        ctx context.Context,
        t task.Task,
    ) error

    Get(
        ctx context.Context,
        id string,
    ) (task.Task, error)

    Save(
        ctx context.Context,
        t task.Task,
    ) error
}
```

这里有一个工程上的关键点：仅仅定义 `Save` 还不够。

多个 Worker 同时处理同一个任务时，需要版本号、乐观锁或其他并发控制手段，防止旧 Worker 覆盖新状态。

例如，可以给 Task 增加 `Version` 字段，保存时要求数据库中的版本与预期版本一致。

对于需要可靠恢复的工具调用，还应单独记录调用状态和事件，而不能只保存任务的最终状态。

---

# 五、Agent Loop：整个系统的控制中心

前面几课我们学习过 Agent Loop，现在把它放回完整架构中。

核心逻辑可以概括为：

```text
while task is not terminal:
    1. 检查取消信号、Deadline 和预算
    2. 读取当前任务状态
    3. 构建上下文
    4. 调用模型
    5. 解析模型响应
    6. 如果有 Tool Call：
         校验参数与权限
         执行或等待审批
         持久化结果
         继续循环
    7. 如果模型返回最终回答：
         执行 Completion Gate
         通过则完成
         否则继续、重规划或失败
```

这个循环必须由 Harness 控制，而不是由模型自由决定所有执行细节。

尤其要处理这些情况：

- 模型连续调用无关工具。
- 模型反复提出相同的失败操作。
- 工具调用超时但结果未知。
- 任务预算已经耗尽。
- 用户要求取消任务。
- 测试通过，但 Git Diff 出现越权修改。
- 进程崩溃后任务需要恢复。

每一种情况都应该有明确的状态转换和处理策略。

## 六、Completion Gate：统一完成判定

我们可以将任务完成判定设计成独立模块。

```go
type AcceptanceResult struct {
    Passed   bool
    Evidence []string
    Reason   string
}

type CompletionGate interface {
    Verify(
        ctx context.Context,
        taskID string,
    ) (AcceptanceResult, error)
}
```

这个接口只是一个入口。真实的验收器可能需要检查：

1. 必需的测试是否通过。
2. 代码是否满足静态检查要求。
3. 是否存在未授权修改。
4. 必需的工具调用是否已经明确结束。
5. 任务状态是否已持久化。
6. 验收证据是否可追溯。

注意：某些任务本来就不需要运行测试，例如只修改文档。因此验收条件应该由任务类型和策略决定，而不是机械地要求所有任务都执行同一套命令。

另外，`Passed: false` 不一定意味着永久失败。它可能意味着当前还不能完成，需要继续修复。只有在预算耗尽、不可恢复错误或其他终止条件满足时，才应进入最终失败状态。

---

# 七、先做单进程版本，再演进到分布式

这是我特别建议你采用的开发顺序。

不要一开始就引入消息队列、多个 Worker、分布式调度和复杂的微服务。

先实现一个单进程 Harness：

<box border radius="lg" padding={3} gap={2}>
  <row align="center" gap={2}>
    <icon name="check-circle" color="success" size="lg" />
    <box flex="1" gap={1}>
      **第一阶段：可用的本地 Harness**
      <text color="secondary" size="sm">Go + 单个进程 + SQLite + Git Worktree + 模型 Adapter + 基础工具。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="center" gap={2}>
    <icon name="layers" size="lg" />
    <box flex="1" gap={1}>
      **第二阶段：可靠性增强**
      <text color="secondary" size="sm">事件日志、Checkpoint、任务恢复、工具调用审计、独立验收。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="center" gap={2}>
    <icon name="network" size="lg" />
    <box flex="1" gap={1}>
      **第三阶段：并发任务系统**
      <text color="secondary" size="sm">任务队列、多个 Worker、租约、版本控制、幂等与对账。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="center" gap={2}>
    <icon name="chart-no-axes-combined" size="lg" />
    <box flex="1" gap={1}>
      **第四阶段：工程化与优化**
      <text color="secondary" size="sm">代码索引、模型路由、评估基准、成本控制、可观测性。</text>
    </box>
  </row>
</box>

原因很简单：如果连单任务执行、权限检查和任务恢复都没有设计好，那么引入更多 Worker，只会让问题更难定位。

---

# 八、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题：**

  你已经完成 Coding Harness 的第一版。现在 Agent 能调用模型、执行工具，并且在测试通过后返回成功。

  但某次执行中，Agent 修改了禁止修改的配置文件，测试仍然通过，系统也返回了 `completed`。

  下一步最应该怎么做？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 增加模型提示词，反复强调不要修改禁止文件。</radio>
    <radio value="B">B. 在独立的 Policy Engine 和 Completion Gate 中实施变更审计与硬性约束，确保未授权修改无法通过验收。</radio>
    <radio value="C">C. 只要测试通过，就继续优化模型路由，不必调整执行架构。</radio>
    <radio value="D">D. 让模型在最终回答中承诺以后不再修改这些文件。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！模型提示词只能引导行为，不能替代系统级约束。Harness 必须检查真实变更，并由独立验收机制阻止不符合策略的任务进入 `completed`。
      {:else}
        问题出在系统控制层，而不是模型是否记住了要求。真正可靠的方案必须检查实际操作结果，并在验收阶段执行不可绕过的策略。
      {/if}
    </box>
  {/if}
</box>

## 下一课预告

第二十一课，我们将学习 **Coding Harness 的安全边界、威胁建模与纵深防御**，重点分析提示词注入、恶意仓库文件、工具越权、密钥泄露，以及为什么只使用 Docker 或只依赖模型提示词都不足以构建完整的安全体系。
