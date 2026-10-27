---
title: "06 Harness 第六课 - Session、持久化与任务恢复"
aliases:
  - "Harness 第六课 - Session、持久化与任务恢复"
tags:
  - harness
  - ai-agent
  - verbatim
  - context-state
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "b6b4a5be-2f6e-4588-9ea1-7324c2173d34"
source_turn_id: "bbb21b1b-da1a-4d24-bc01-47cf65c329f8"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：06  
> 原始章节：原回答完整内容  
> 合并消息 ID：`b6b4a5be-2f6e-4588-9ea1-7324c2173d34`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第五课小测，我选择 C。请批改，并继续下一课：Session、持久化与任务恢复。
> ~~~

返回：[[Harness 知识地图]]

---

答对了！🎯 **第五课选择 C，完全正确。**

你的答案是：

> 保留关键约束和任务状态，压缩低价值历史，保留必要近期交互，并按需重新检索证据。

这就是 Context Engineering 的核心思想：**不是尽可能多地保存对话，而是让模型在有限的上下文里，始终拿到完成当前任务所需的信息。**

为什么其他选项不合适？

- **A：直接删除历史** —— 可能丢掉关键需求、设计决策和失败原因。
- **B：压缩成一句话** —— 丢失的信息太多，模型可能不知道已经做过什么、哪些方案已经失败。
- **D：一直发送全部历史** —— 会遇到上下文限制，也会浪费 Token 和推理成本。
- **C：分层保留、压缩、按需检索** —— 兼顾上下文成本、任务连续性和证据完整性。

到这里，我们已经建立了三个重要概念：

| Runtime | 解决的问题 |
|---|---|
| Execution Runtime | 工具应该如何安全地执行？ |
| Context Runtime | 模型应该知道什么？ |
| State Runtime | 任务已经进行到哪里？ |

接下来进入第六课。它会把前面几课串起来：**如果 Coding Agent 执行到第 30 步时突然崩溃，重新启动后，怎样从正确的位置继续，而不是把前 29 步全部重做？**

---

# 第六课：Session、持久化与任务恢复

## 一、先理解一个真实的问题

假设你正在开发一个 Coding Agent，让它帮你给 Go 项目增加用户登录功能。

Agent 的执行过程可能是这样的：

<box border radius="xl" padding={3} gap={2}>
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="clipboard-list" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 1 步：制定计划**

      <text color="secondary" size="sm">创建任务，确定需要修改的文件。</text>
    </box>
    <badge>完成</badge>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="file-code" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 2～10 步：修改代码**

      <text color="secondary" size="sm">创建 Handler、Service、Repository。</text>
    </box>
    <badge>完成</badge>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="terminal" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 11～29 步：执行工具**

      <text color="secondary" size="sm">安装依赖、运行测试、修复编译错误。</text>
    </box>
    <badge>完成</badge>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="alert-triangle" size="xl" color="danger" />
    </box>
    <box flex="1" gap={1}>
      **第 30 步：进程崩溃**

      <text color="secondary" size="sm">服务器重启、进程被杀，或机器突然断电。</text>
    </box>
    <badge color="danger">中断</badge>
  </row>
</box>

如果 Agent 只把对话保存在内存里，进程退出后，任务进度就可能全部丢失。

即使把完整对话写进数据库，也不代表任务一定能恢复：它可能不知道某个文件是否已修改、某条命令是否已经执行，甚至可能重复执行有副作用的操作。

因此，我们要设计的不是简单的“聊天记录保存功能”，而是一套**可恢复的任务执行系统**。

## 二、Session、Task、Message 到底是什么关系？

先把这几个容易混淆的概念分开。

<box border radius="xl" padding={3} gap={3}>
  <box border radius="lg" padding={3} gap={1}>
    <title size="md">Session（会话）</title>
    <text color="secondary" size="sm">一次持续的交互上下文。可以包含用户消息、模型回复、工具调用和多个任务。</text>
    例如：用户与 Agent 一起维护 `my-go-project`。
  </box>
  <box padding={{left:4}} gap={1}>
    <row align="center" gap={2}>
      <icon name="corner-down-right" color="secondary" />
      <title size="md">Task（任务）</title>
    </row>
    <text color="secondary" size="sm">一个有目标、状态和完成条件的工作单元。</text>
    例如：为项目添加登录接口。
  </box>
  <box padding={{left:8}} gap={1}>
    <row align="center" gap={2}>
      <icon name="corner-down-right" color="secondary" />
      <title size="md">Run / Attempt（执行轮次）</title>
    </row>
    <text color="secondary" size="sm">某一次实际尝试执行任务。失败后可以创建新的 Attempt 继续处理。</text>
  </box>
  <box padding={{left:12}} gap={1}>
    <row align="center" gap={2}>
      <icon name="corner-down-right" color="secondary" />
      <title size="md">Tool Call（工具调用）</title>
    </row>
    <text color="secondary" size="sm">一次具体操作，例如读取文件、修改文件、运行测试。</text>
  </box>
</box>

可以把它们理解成：

- **Session** 管理长期交互。
- **Task** 管理工作目标和完成状态。
- **Run** 管理一次执行尝试。
- **Tool Call** 管理具体操作及其执行结果。

注意：不同 Agent 框架对 Session、Run、Turn 的命名不完全一样。这里是为了自己构建 Harness 而采用的一套清晰划分，不是所有框架都必须遵循的标准。

## 三、为什么保存聊天记录还不够？

这是本课最关键的知识点。

假设 Agent 要执行下面这个工具调用：

```ts
await tools.writeFile({
  path: "internal/auth/handler.go",
  content: sourceCode,
});
```

如果进程在执行期间崩溃，会发生什么？

<box border radius="xl" padding={3} gap={3}>
  <title size="md">崩溃时的三种情况</title>
  <row align="start" gap={3}>
    <icon name="check-circle" color="success" size="xl" />
    <box flex="1" gap={1}>
      **情况 A：执行前崩溃**

      <text size="sm" color="secondary">文件还没写入。恢复后可以重新执行。</text>
    </box>
  </row>
  <row align="start" gap={3}>
    <icon name="check-circle" color="success" size="xl" />
    <box flex="1" gap={1}>
      **情况 B：执行成功，结果已持久化**

      <text size="sm" color="secondary">文件已写入，数据库也记录了成功。恢复后跳过这个调用。</text>
    </box>
  </row>
  <row align="start" gap={3}>
    <icon name="alert-triangle" color="danger" size="xl" />
    <box flex="1" gap={1}>
      **情况 C：文件已经写入，但成功结果尚未保存**

      <text size="sm" color="secondary">恢复后，数据库看起来像是没执行过，但文件实际上已经变了。</text>
    </box>
  </row>
</box>

情况 C 就是分布式系统里很经典的问题：**外部副作用已经发生，但执行结果没有可靠地记录下来。**

数据库事务无法自动把本地文件写入、Shell 命令、远程 HTTP 请求等所有操作一起纳入同一个原子事务。

所以，Harness 不能只记录“模型想做什么”，还必须记录“工具执行到什么程度，以及当前结果是否可信”。

## 四、设计持久化模型

我们先用关系型数据库设计一版最小模型。MySQL、PostgreSQL 都可以实现。

### 1. 核心数据表

| 表 | 主要职责 |
|---|---|
| `sessions` | 会话元信息 |
| `tasks` | 目标、约束、任务状态 |
| `runs` | 执行尝试、开始时间、结束时间 |
| `tool_calls` | 工具参数、执行状态、执行结果 |
| `events` | 按顺序记录任务执行事件 |
| `checkpoints` | 保存可恢复的任务快照 |

这几张表不需要一开始就全部做得很复杂。对于最小可用版本，可以先实现 `sessions`、`tasks`、`tool_calls` 和 `events`，再逐步加入 Checkpoint。

### 2. 任务状态机

先定义任务状态：

<box border radius="xl" padding={3} align="center" gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} width="190px" align="center">
    **pending**

    <text color="secondary" size="sm">等待执行</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg" />
  <box background="surface" border radius="lg" padding={3} width="190px" align="center">
    **running**

    <text color="secondary" size="sm">正在执行</text>
  </box>
  <row align="center" justify="center" gap={2}>
    <icon name="arrow-down" color="success" size="lg" />
    <icon name="arrow-down" color="danger" size="lg" />
  </row>
  <row gap={3} align="start">
    <box background="surface-secondary" radius="lg" padding={3} flex="1" align="center">
      **completed**

      <text color="secondary" size="sm">成功完成</text>
    </box>
    <box background="surface-secondary" radius="lg" padding={3} flex="1" align="center">
      **failed**

      <text color="secondary" size="sm">执行失败</text>
    </box>
  </row>
  <text color="secondary" size="xs">还可以增加 cancelled、waiting_approval 等状态。</text>
</box>

但是，生产级任务状态机还要考虑两个问题：

- 用户取消任务时，不能只修改数据库状态，还要尽可能取消正在执行的工具。
- 进程崩溃时，`running` 不能被直接当成 `failed`，因为工具可能已经产生副作用。

这就是为什么任务状态和工具调用状态必须分开管理。

### 3. Tool Call 状态机

建议至少支持以下状态：

| 状态 | 含义 | 恢复策略 |
|---|---|---|
| `pending` | 已记录，尚未开始执行 | 可以调度执行 |
| `running` | 已开始，结果尚未确定 | 先判断执行结果是否可确认 |
| `succeeded` | 执行成功且结果已持久化 | 不重复执行 |
| `failed` | 已确认执行失败 | 根据错误类型决定是否重试 |
| `unknown` | 无法确定是否产生副作用 | 先对账，不能盲目重试 |

`unknown` 特别重要。

例如，Agent 调用一个支付 API，服务器已经扣款，但响应在网络中丢失。如果直接重试，就可能扣款两次。

对于写文件工具，可以通过检查文件内容、版本或哈希值来辅助恢复；对于远程 API，优先使用对方支持的幂等键；对于无法核实的副作用，应暂停并要求人工处理。

**不要把“没有拿到成功响应”误认为“操作没有成功”。**

## 五、Event Log：记录执行过程

只有当前状态还不够。

例如，某个任务当前状态是 `running`，但我们不知道它为什么停在这里、上一次执行了什么、最后一个工具调用是什么。

因此，可以使用事件日志记录任务过程：

```ts
type TaskEvent =
  | {
      type: "task.created";
      taskId: string;
      goal: string;
    }
  | {
      type: "plan.updated";
      taskId: string;
      steps: string[];
    }
  | {
      type: "tool.started";
      taskId: string;
      callId: string;
      toolName: string;
    }
  | {
      type: "tool.succeeded";
      taskId: string;
      callId: string;
      result: unknown;
    }
  | {
      type: "tool.failed";
      taskId: string;
      callId: string;
      error: string;
    }
  | {
      type: "task.completed";
      taskId: string;
    };
```

这些事件应该在关键执行边界及时写入持久化存储，而不是等整个任务完成后才一次性保存。

事件日志能帮助你回答：

- 任务做过哪些事情？
- 最后一次确认成功的工具调用是什么？
- 哪些操作可能正在执行或结果不明？
- 任务为什么失败？
- 恢复时应该从哪里开始？

不过，事件日志不是完整答案。我们还需要一个恢复速度更快的机制。

## 六、Checkpoint：任务检查点

Event Log 记录过程，Checkpoint 则保存某一时刻的任务快照。

例如：

```ts
interface TaskCheckpoint {
  taskId: string;
  eventSequence: number;

  goal: string;
  status: "running" | "completed" | "failed";

  plan: Array<{
    id: string;
    description: string;
    status: "pending" | "completed" | "failed";
  }>;

  completedSteps: string[];
  pendingSteps: string[];

  // 当前任务状态，不等于完整聊天记录
  decisions: string[];

  // 需要重新检查的操作
  unresolvedToolCalls: string[];

  createdAt: string;
}
```

假设一个任务已经执行了 200 个事件：

- 最近的 Checkpoint 对应事件 150。
- 恢复时加载事件 150 的快照。
- 再读取事件 151～200，重建最新状态。
- 对仍然处于 `running` 或 `unknown` 的工具调用进行核查。

这样不需要每次都从最初的事件开始重放。

<box border radius="xl" padding={3} gap={2}>
  <title size="md">Checkpoint + Event Log</title>
  <row gap={1} align="center">
    <box background="surface-secondary" radius="md" padding={2} flex="1" align="center">
      <text size="sm">事件 1～100</text>
    </box>
    <icon name="arrow-right" color="secondary" />
    <box border radius="md" padding={2} flex="1" align="center">
      <text size="sm" weight="medium">Checkpoint 100</text>
    </box>
  </row>
  <row justify="center">
    <icon name="arrow-down" color="secondary" />
  </row>
  <row gap={1} align="center">
    <box background="surface-secondary" radius="md" padding={2} flex="1" align="center">
      <text size="sm">事件 101～200</text>
    </box>
    <icon name="arrow-right" color="secondary" />
    <box border radius="md" padding={2} flex="1" align="center">
      <text size="sm" weight="medium">Checkpoint 200</text>
    </box>
  </row>
  <row justify="center">
    <icon name="arrow-down" color="secondary" />
  </row>
  <box border radius="md" padding={3} align="center">
    **恢复任务**

    <text color="secondary" size="sm">加载最新有效快照 + 重放后续事件 + 核查未决工具调用</text>
  </box>
</box>

这里有一个容易踩的坑：**不能只恢复任务状态，还必须恢复工具调用与事件之间的关联。** 否则模型可能重新发起已经成功的工具调用。

另外，代码文件、数据库等外部资源本身也可能已经变化。因此 Checkpoint 不是整个世界的快照，恢复时仍然需要验证实际环境。

## 七、实现一个最小的可恢复 Harness

下面用 TypeScript 展示关键设计。为了把重点放在恢复机制上，这里先不绑定具体数据库或 AI SDK。

### 1. 定义持久化接口

```ts
type ToolCallStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "unknown";

interface ToolCallRecord {
  id: string;
  taskId: string;
  toolName: string;
  args: unknown;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
}

interface TaskRepository {
  getTask(taskId: string): Promise<{
    id: string;
    status: "pending" | "running" | "completed" | "failed";
  } | null>;

  getToolCall(callId: string): Promise<ToolCallRecord | null>;

  createToolCall(
    call: ToolCallRecord,
  ): Promise<void>;

  updateToolCall(
    callId: string,
    update: Partial<ToolCallRecord>,
  ): Promise<void>;

  appendEvent(event: {
    taskId: string;
    type: string;
    payload: unknown;
  }): Promise<void>;
}
```

接口把业务执行和存储实现分开。后续你可以使用 MySQL + GORM、PostgreSQL、SQLite 或其他存储实现它。

### 2. 执行工具时，先记录意图

```ts
interface ToolExecutor {
  execute(
    toolName: string,
    args: unknown,
  ): Promise<unknown>;
}

async function executeDurably(
  repo: TaskRepository,
  executor: ToolExecutor,
  call: ToolCallRecord,
): Promise<unknown> {
  // 1. 先查询持久化状态
  const existing = await repo.getToolCall(call.id);

  if (existing?.status === "succeeded") {
    // 已确认成功，直接复用结果
    return existing.result;
  }

  if (existing?.status === "unknown") {
    throw new Error(
      `Tool call ${call.id} requires reconciliation`,
    );
  }

  if (existing?.status === "running") {
    // 不确定前一次执行是否已经产生副作用
    await repo.updateToolCall(call.id, {
      status: "unknown",
    });

    throw new Error(
      `Tool call ${call.id} may have executed; reconcile first`,
    );
  }

  // 2. 在执行之前持久化工具调用记录
  if (!existing) {
    await repo.createToolCall({
      ...call,
      status: "pending",
    });
  }

  await repo.updateToolCall(call.id, {
    status: "running",
  });

  await repo.appendEvent({
    taskId: call.taskId,
    type: "tool.started",
    payload: {
      callId: call.id,
      toolName: call.toolName,
    },
  });

  try {
    // 3. 执行实际工具
    const result = await executor.execute(
      call.toolName,
      call.args,
    );

    // 4. 持久化结果，再通知上层成功
    await repo.updateToolCall(call.id, {
      status: "succeeded",
      result,
    });

    await repo.appendEvent({
      taskId: call.taskId,
      type: "tool.succeeded",
      payload: {
        callId: call.id,
        result,
      },
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    // 只有能够确认没有产生未决副作用时，
    // 才适合直接记录为 failed。
    await repo.updateToolCall(call.id, {
      status: "failed",
      error: message,
    });

    throw error;
  }
}
```

这段代码展示了基本原则，但**还不是可以直接用于生产环境的完整实现**。尤其是最后的 `catch`：真实系统必须知道工具失败意味着什么。如果工具可能在产生副作用后才抛出异常，就不能一律标记为 `failed`，应该标记为 `unknown`，或者由工具适配器返回更明确的执行结果。

另外，工具结果和事件日志最好通过同一个数据库事务一起写入。上面的接口为了讲解简化了事务处理。

### 3. 为什么有了这段代码还不能保证 exactly-once？

考虑下面的执行顺序：

1. 数据库把工具状态写成 `running`。
2. 工具成功修改文件。
3. 进程突然崩溃。
4. 数据库还没有记录 `succeeded`。
5. 恢复程序发现状态仍是 `running`。

如果重新执行，可能重复操作；如果直接跳过，又可能把没有真正执行成功的操作遗漏。

这说明：

**仅靠本地状态记录，通常无法保证任意外部工具的 exactly-once（恰好执行一次）。**

更可靠的方案是根据工具类型设计恢复能力：

| 工具类型 | 推荐策略 |
|---|---|
| 读取文件、查询数据库 | 通常可以安全重试，但要考虑读取结果是否过期 |
| 写入文件 | 原子写入、版本检查、内容哈希、目标状态核验 |
| 数据库写操作 | 事务、唯一约束、幂等键 |
| 远程 HTTP 写操作 | 服务端支持的幂等键、操作状态查询 |
| Shell 命令 | 记录命令和副作用，必要时人工确认 |
| 发送邮件、支付、发布部署 | 优先对账；不要盲目重试 |

**幂等（Idempotency）** 的意思是：对同一个逻辑操作重复执行，不会造成额外的业务影响。

例如，将某个文件设置为确定的目标内容，通常比“在文件末尾追加一段内容”更容易做成幂等操作。

对于远程 API，可以生成稳定的操作 ID，并在服务端把这个 ID 与执行结果关联起来。但这只有在对方服务真正实现幂等语义时才可靠。

---

## 八、进程重启后，恢复流程应该是什么？

恢复不是简单地重新调用模型，而是先恢复任务状态，再决定是否需要模型参与。

推荐流程如下：

<CodeBlock language="mermaid" editable>
flowchart TD
    A[进程启动] --> B[查询未完成的任务]
    B --> C[加载最新 Checkpoint]
    C --> D[重放后续 Event Log]
    D --> E[检查未完成的 Tool Calls]
    E --> F{执行结果是否明确?}
    F -->|已成功| G[记录成功并跳过重执行]
    F -->|已确认未执行| H[安全重新调度]
    F -->|结果未知| I[对账或人工介入]
    G --> J[恢复 Task State]
    H --> J
    I --> K[暂停任务等待处理]
    J --> L[重建 Model Context]
    L --> M[继续 Agent Loop]
</CodeBlock>

有几个设计细节值得记住：

1. **不要恢复一份过期的内存对象。** 从持久化状态重建任务。
2. **不要默认重放所有工具调用。** 先核对每次调用的状态。
3. **不要把全部历史直接塞回模型。** 使用第 5 课的 Context Engineering，重建当前需要的上下文。
4. **不要在同一任务上无控制地启动多个恢复 Worker。** 使用租约、心跳或数据库锁，避免并发执行。
5. **恢复过程也要记录事件。** 例如 `task.resumed`、`tool.reconciled`，方便排障和审计。

还有一个重要问题：如果模型在调用工具之前已经返回了一份计划，而进程恰好在保存计划之前崩溃，那么恢复时可能重新请求模型生成计划。模型可能产生不同的计划。这通常没关系，但如果你需要严格延续原计划，就应该在执行前先持久化模型产生的计划与待执行的工具调用。

---

## 九、再进阶一步：租约与防止重复 Worker

如果你的 Harness 未来要部署在服务器上，任务恢复很可能不止发生在单进程内。

例如，两个 Worker 同时启动，都发现 `task-123` 处于 `running`，然后都开始恢复它。

这时就需要任务租约（Lease）或其他并发协调机制。

一种常见设计是给任务保存：

```ts
interface TaskLease {
  taskId: string;
  workerId: string;
  leaseExpiresAt: string;
  version: number;
}
```

Worker 领取任务时，通过数据库原子操作获得租约；执行过程中定期续租。如果 Worker 崩溃，租约过期后其他 Worker 才可以接管。

`version` 可以用于乐观并发控制：更新任务时要求版本仍然匹配，防止旧 Worker 在失去租约后继续覆盖新 Worker 的状态。

不过，**租约只能减少重复执行，不能单独消除外部副作用重复的风险**。旧 Worker 可能在网络分区后继续运行，所以关键写操作仍然需要幂等性和结果核验。

## 十、Go 版 Harness 应该怎样落地？

考虑到你主要使用 Go 开发后端，可以把同样的设计映射到 Go：

- `context.Context`：控制取消和超时，不承担持久化职责。
- `TaskRepository`：使用 GORM 实现任务、工具调用、事件和 Checkpoint 的读写。
- `ToolExecutor`：注册并执行具体工具。
- `RecoveryWorker`：扫描待恢复任务，获取租约，重建任务状态。
- `CheckpointService`：定期保存任务快照。
- `EventStore`：按任务序号记录事件，保证顺序和可追踪性。

推荐的目录结构：

```text
internal/
├── agent/
│   ├── loop.go
│   ├── context_builder.go
│   └── planner.go
├── task/
│   ├── model.go
│   ├── service.go
│   └── state_machine.go
├── tool/
│   ├── registry.go
│   ├── executor.go
│   ├── policy.go
│   └── recovery.go
├── persistence/
│   ├── task_repository.go
│   ├── event_store.go
│   └── checkpoint_store.go
└── worker/
    ├── runner.go
    └── recovery_worker.go
```

第一版不必急着上消息队列、复杂事件溯源或分布式工作流引擎。先把以下能力做可靠：

1. 任务状态能持久化。
2. 工具调用有稳定 ID。
3. 工具执行前先记录意图。
4. 工具成功后持久化结果。
5. 崩溃后能区分已成功、可重试、结果未知。
6. 恢复时重建 Context，而不是盲目重放所有历史。

这就已经具备一个实用 Coding Harness 的基础。

---

## 十一、本课小测

{@body const [answer,setAnswer] = DIL.useState("B")}
{@body const [submitted,setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={4}>
  **问题：**

  Agent 调用一个远程 API 创建资源。API 已经成功创建资源，但进程在收到响应、保存成功状态之前崩溃。重启后，数据库中的工具调用仍然是 `running`。

  哪种处理方式最合理？

  <radio-group value={answer} onChange={(v) => {setAnswer(v);setSubmitted(false)}} direction="col">
    <radio value="A">
      直接把状态改成 `failed`，然后重新调用 API。
    </radio>
    <radio value="B">
      将调用标记为结果未知，优先通过幂等键或 API 查询接口核对执行结果，再决定是否重试。
    </radio>
    <radio value="C">
      只要 Session 和聊天记录保存完整，就能判断 API 是否成功。
    </radio>
    <radio value="D">
      删除当前 Task，从头创建一个新任务，避免旧状态影响。
    </radio>
  </radio-group>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      {#if answer === "B"}
        <title size="md" color="success">回答正确！</title>
        关键是区分“执行失败”和“执行结果未知”。先核对远端状态，可以避免重复创建资源。
      {:else}
        <title size="md">再想一想</title>
        重点不是聊天记录是否完整，而是外部操作已经发生、但本地还没记录结果时，如何避免重复副作用。
      {/if}
    </box>
    <button block onClick={() => GenUI.issueNewTurn(answer === "B" ? "第六课小测我选 B，正确。请继续第七课。" : `第六课小测我选 ${answer}，请讲解后继续。`)}>提交并继续</button>
  {:else}
    <button block onClick={() => setSubmitted(true)}>检查答案</button>
  {/if}
</box>

下一课我们将进入第七课：**Agent Loop 的完整生命周期与可观测性**。届时会把模型调用、Tool Call、事件日志、状态转换、错误恢复和执行追踪连接起来，逐步形成一个真正可调试、可恢复的 Coding Harness。
