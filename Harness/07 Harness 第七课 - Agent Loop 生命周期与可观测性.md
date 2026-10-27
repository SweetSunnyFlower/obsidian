---
title: "07 Harness 第七课 - Agent Loop 生命周期与可观测性"
aliases:
  - "Harness 第七课 - Agent Loop 生命周期与可观测性"
tags:
  - harness
  - ai-agent
  - verbatim
  - context-state
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "961a70b1-a476-4f41-9a03-65e33f5a11e3"
source_turn_id: "d6befde6-0bd1-4a90-8b11-db572e2854ab"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：07  
> 原始章节：原回答完整内容  
> 合并消息 ID：`961a70b1-a476-4f41-9a03-65e33f5a11e3`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 第六课小测我选 B，正确。请继续第七课。
> ~~~

返回：[[Harness 知识地图]]

---

第六课小测，**B，完全正确！** 🎯

你抓住了任务恢复中最重要的原则：**外部操作的执行结果不确定时，先对账，再决定是否重试。** 这比简单地保存聊天记录、重新调用模型可靠得多。

现在进入第七课。这一课我们把之前学到的 Tool Runtime、Context Engineering、Session、Checkpoint 串起来，开始思考一个真正的 Coding Agent 应该如何运行、如何排错，以及如何回答“它刚才到底做了什么”。

# 第七课：Agent Loop 的完整生命周期与可观测性

## 一、本课目标

学完这一课，你应该能够：

- 画出一个完整的 Agent 执行生命周期。
- 区分模型调用、工具调用、任务状态转换和用户交互。
- 设计统一的事件与追踪机制。
- 定位模型不回复、工具超时、任务卡死等问题。
- 在 Go 或 TypeScript 中实现一个可观测的 Agent Loop。

先记住一句话：

**Agent Loop 负责推进任务，可观测性负责解释任务为什么这样推进。**

没有可观测性，Agent 出错时你只能看到“任务失败”；有了可观测性，你才能知道是模型没返回工具调用、工具执行失败、权限检查阻止了操作，还是任务状态机出了问题。

## 二、先建立完整的生命周期

一个 Coding Agent 并不只是下面这段循环：

```ts
while (true) {
  const response = await model.generate(messages);
  const result = await executeTools(response.toolCalls);
  messages.push(result);
}
```

这段代码忽略了很多生产环境必须处理的事情：任务取消、权限审批、模型超时、工具并发、持久化、Token 预算、重试和恢复。

完整的生命周期更接近下面这样：

<CodeBlock language="mermaid" editable>
flowchart TD
    A[接收用户请求] --> B[创建或恢复 Session / Task]
    B --> C[加载 Task State 与 Checkpoint]
    C --> D[构建 Model Context]
    D --> E[调用模型]
    E --> F{模型响应类型}
    F -->|文本或最终答案| G[验证完成条件]
    G -->|已满足| H[持久化并结束任务]
    G -->|未满足| D
    F -->|工具调用| I[验证参数与权限]
    I -->|需要审批| J[等待用户批准]
    J -->|批准| K[持久化执行意图]
    J -->|拒绝| L[记录拒绝结果]
    I -->|允许| K
    K --> M[执行工具]
    M --> N[记录工具结果与事件]
    N --> O[更新 Task State / Checkpoint]
    O --> P{预算、取消与错误检查}
    P -->|允许继续| D
    P -->|停止或失败| Q[保存终态或暂停状态]
    L --> D
</CodeBlock>

这张图揭示了一个重要事实：**模型调用只是生命周期中的一个阶段，而不是整个 Harness。**

模型负责提出下一步行动；Harness 决定这一步是否允许执行、怎样执行、怎样记录，以及执行完成后是否继续。

## 三、区分四种不同的执行对象

这部分是后续实现和排查问题的基础。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="list-checks" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **1. Task（任务）**

      <text color="secondary" size="sm">用户最终希望完成什么？</text>
      示例：给 Go 项目增加 JWT 登录接口。任务可能经历多个模型调用、几十次工具调用和多次恢复。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="brain-circuit" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **2. Model Call（模型调用）**

      <text color="secondary" size="sm">模型基于当前上下文，提出什么响应？</text>
      示例：模型决定先读取 `internal/auth/handler.go`。一次模型调用也可能返回普通文本、多个工具调用，或错误。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="wrench" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **3. Tool Call（工具调用）**

      <text color="secondary" size="sm">Harness 实际执行了什么操作？</text>
      示例：读取文件、修改代码、执行测试。一次模型响应可能包含多个工具调用，它们各自有独立状态。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="activity" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **4. Event / Span（事件与追踪跨度）**

      <text color="secondary" size="sm">执行过程中发生了什么？</text>
      示例：`model.started`、`tool.started`、`tool.succeeded`、`task.resumed`。它们用来排障、审计和统计。
    </box>
  </row>
</box>

不要把这四个概念混成一张聊天消息列表。

比如，用户发出一个 Task，Harness 调用一次模型；模型返回两个工具调用，Harness 执行后又调用模型一次。这个过程可能对应：

- 1 个 Task
- 2 次 Model Call
- 2 个 Tool Call
- 多条 Event
- 多个用于关联这些操作的 Trace / Span

数量并不相等，这正是为什么需要独立的执行标识。

## 四、设计统一的 ID 与关联关系

建议在 Harness 中为关键对象分配稳定的 ID。

| 标识 | 用途 |
|---|---|
| `session_id` | 关联同一会话 |
| `task_id` | 关联同一任务 |
| `run_id` | 区分不同执行尝试 |
| `turn_id` | 标识一轮 Agent 推进 |
| `model_call_id` | 标识一次模型请求 |
| `tool_call_id` | 标识一次工具调用 |
| `trace_id` | 关联一次端到端执行追踪 |
| `span_id` | 标识追踪中的某个阶段 |

例如：

```text
session_01
└── task_42
    └── run_03
        ├── turn_01
        │   ├── model_call_01
        │   └── tool_call_01
        └── turn_02
            ├── model_call_02
            ├── tool_call_02
            └── tool_call_03
```

注意：这是逻辑关联关系的示意，不意味着数据库一定要采用这样的树形结构。

还有一个非常重要的实现细节：

**`tool_call_id` 不应该在恢复时随意重新生成。**

如果一个工具调用已经持久化，恢复时应该继续使用原来的 ID。否则系统很难判断它是不是之前执行过的那一次操作。

`trace_id` 则可以根据你的追踪策略，选择贯穿整个 Task，或为每次 Run 创建新的 Trace 并通过 `task_id` 关联。关键是定义清楚，不要混用。

## 五、可观测性到底包括什么？

通常可以分成三部分：Logs、Metrics、Traces。

<box gap={3}>
  <row align="start" gap={3}>
    <AsyncImage query="structured application logs terminal dark interface software observability" aspectRatio="4:3" maxWidth="112px" />
    <box flex="1" gap={1}>
      **Logs：日志**

      回答“发生了什么？”

      例如：工具 `run_tests` 因超时失败，任务进入 `waiting_retry`。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <AsyncImage query="software monitoring dashboard latency error rate metrics charts dark interface" aspectRatio="4:3" maxWidth="112px" />
    <box flex="1" gap={1}>
      **Metrics：指标**

      回答“整体运行得怎么样？”

      例如：模型调用失败率、工具超时率、任务成功率、P95 执行时长。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <AsyncImage query="distributed tracing waterfall spans timeline observability dashboard" aspectRatio="4:3" maxWidth="112px" />
    <box flex="1" gap={1}>
      **Traces：追踪**

      回答“一次任务具体经过了哪些步骤？”

      例如：模型调用用了 2 秒、工具执行用了 8 秒、权限审批等待了 30 秒。
    </box>
  </row>
</box>

三者解决的问题不同。

只有日志，你可以查到某个错误，但很难快速判断整个系统是不是普遍变慢。只有指标，你知道错误率上升，却不一定知道是哪一类工具造成的。只有追踪，你可以分析单个请求，但不容易判断一周内的整体趋势。

实际开发中，三者应该使用统一的关联 ID。

### 1. 统一事件格式

先定义一个通用事件结构：

```ts
type HarnessEvent = {
  eventId: string;
  type: string;

  sessionId: string;
  taskId: string;
  runId: string;
  traceId: string;

  timestamp: string;
  durationMs?: number;

  status?: "started" | "succeeded" | "failed";
  errorCode?: string;

  attributes?: Record<string, unknown>;
};
```

实际项目中还可以增加 `spanId`、`parentSpanId`、`toolCallId`、模型名称、Token 用量等字段。

比如一次工具调用：

```json
{
  "eventId": "evt_104",
  "type": "tool.completed",
  "sessionId": "ses_01",
  "taskId": "task_42",
  "runId": "run_03",
  "traceId": "trace_09",
  "timestamp": "2026-10-27T03:30:00.000Z",
  "durationMs": 820,
  "status": "succeeded",
  "attributes": {
    "toolName": "read_file",
    "toolCallId": "call_18"
  }
}
```

这类结构化事件可以写入数据库、发送到日志系统，或者通过 OpenTelemetry 转换为 Trace。

注意两点：

- `timestamp` 用于记录发生时间；如果要准确计算单进程内的耗时，优先使用单调时钟，而不是简单相减两个可能发生时钟漂移的系统时间。
- 不要把 API Key、访问令牌、用户隐私、整个文件内容或未经处理的敏感模型上下文直接写进日志。日志系统也需要权限控制和保留期限。

## 六、用代码给 Agent Loop 加上追踪能力

我们先写一个小型的 TypeScript 示例。目标不是一次写完所有生产级功能，而是建立可复用的观测边界。

### 1. 先实现统一的事件接口

```ts
type EventFields = {
  sessionId: string;
  taskId: string;
  runId: string;
  traceId: string;
};

interface EventSink {
  emit(
    event: EventFields & {
      type: string;
      timestamp: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<void>;
}
```

`EventSink` 是一个抽象接口，可以有不同实现：

- `ConsoleEventSink`：本地开发时打印结构化日志。
- `DatabaseEventSink`：持久化执行事件。
- `OpenTelemetryEventSink`：把执行阶段映射到追踪系统。

这里有一个容易忽略的点：如果事件写入数据库失败，Harness 应该如何处理？

对于普通调试日志，可以允许丢失部分日志；但如果事件同时承担恢复依据、审计记录或任务状态转换的职责，就不能简单地忽略写入失败。关键状态和事件最好在同一个数据库事务中保存。

### 2. 为每次模型调用创建观测边界

```ts
interface ModelClient {
  generate(input: {
    messages: unknown[];
  }): Promise<{
    text?: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      args: unknown;
    }>;
  }>;
}

type AgentContext = {
  messages: unknown[];
  ids: EventFields;
};

async function callModelObserved(
  model: ModelClient,
  sink: EventSink,
  context: AgentContext,
) {
  const startedAt = Date.now();

  await sink.emit({
    ...context.ids,
    type: "model.started",
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await model.generate({
      messages: context.messages,
    });

    await sink.emit({
      ...context.ids,
      type: "model.completed",
      timestamp: new Date().toISOString(),
      attributes: {
        durationMs: Date.now() - startedAt,
        toolCallCount: response.toolCalls?.length ?? 0,
        hasText: Boolean(response.text),
      },
    });

    return response;
  } catch (error) {
    await sink.emit({
      ...context.ids,
      type: "model.failed",
      timestamp: new Date().toISOString(),
      attributes: {
        durationMs: Date.now() - startedAt,
        errorType:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
    });

    throw error;
  }
}
```

这段代码展示了一个关键习惯：模型调用无论成功还是失败，都要留下对应的观测记录。

不过，示例仍有简化之处：

- `Date.now()` 的耗时计算可能受到系统时钟调整影响，生产环境应使用单调计时。
- 如果记录失败导致原始模型错误被覆盖，就会影响排障。生产实现应该明确区分业务执行错误与观测系统错误。
- 还应记录模型名称、请求 ID、输入输出 Token 数量、结束原因和重试次数；但不要默认记录全部 Prompt 和模型输出。

### 3. 为什么需要 Span？

`model.started` 和 `model.completed` 两条日志可以表示开始和结束，但它们不天然构成一个完整的追踪跨度。

Span 通常包含：

- `trace_id`
- `span_id`
- `parent_span_id`
- 开始时间
- 结束时间
- 状态
- 属性与异常信息

例如，一次完整执行可以是：

```text
Task Span
├── Context Build Span
├── Model Call Span
│   ├── Request Serialization Span
│   └── Provider Request Span
├── Tool Execution Span
│   ├── Permission Check Span
│   └── Shell Execution Span
└── State Persistence Span
```

这里可以直接使用 OpenTelemetry 的 Trace、Span 和 Attribute 概念，不必自己从零实现整套追踪协议。

如果你的 Go 后端已经有 HTTP 服务和 Worker，OpenTelemetry 还可以把 HTTP 请求、数据库操作和 Agent 内部执行关联起来。这样，排查“用户提交任务后为什么卡了 20 秒”时，就不需要在多个日志系统之间手工猜测。

## 七、用可观测性定位真实问题

假设用户反馈：

> 我让 Agent 修改代码，它一直转圈，最后也没有给我答案。

如果只看最终状态 `failed`，你几乎无法判断原因。

但如果记录了模型调用、工具调用和任务状态转换，就可以沿着执行链逐步排查。

<box border radius="xl" padding={3} gap={3}>
  <title size="lg">故障排查：Agent 一直转圈</title>
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="check-circle" color="success" />
      **检查 1：模型调用是否结束？**
    </row>
    <text color="secondary" size="sm">没有结束事件？检查请求超时、网络连接、流式响应是否关闭。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="check-circle" color="success" />
      **检查 2：模型是否持续请求工具？**
    </row>
    <text color="secondary" size="sm">工具调用次数持续增加？检查循环终止条件、工具错误反馈和最大步数。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="check-circle" color="success" />
      **检查 3：工具是否卡住？**
    </row>
    <text color="secondary" size="sm">工具开始了却没有结束事件？检查超时、取消传播、子进程和锁等待。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="check-circle" color="success" />
      **检查 4：任务状态是否发生变化？**
    </row>
    <text color="secondary" size="sm">工具已成功，但 Task State 没有更新？检查持久化失败、状态机转换和事件顺序。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="check-circle" color="success" />
      **检查 5：是否已经完成，却没有输出？**
    </row>
    <text color="secondary" size="sm">检查最终响应解析、完成条件判断、SSE 结束事件和前端状态更新。</text>
  </box>
</box>

注意最后一点：**模型没有返回可展示的文本，不等于任务一定失败。**

例如，模型可能只返回工具调用，Harness 应该继续执行；也可能达到步数限制后没有剩余预算生成最终答复；还可能工具执行已经完成，但前端没有收到终止事件。

这些情况在界面上都可能表现为“转圈”，但它们需要完全不同的修复方式。

## 八、必须监控哪些指标？

一开始不必建设庞大的监控平台。下面这组指标已经足够帮助你发现大部分基础问题。

| 指标 | 类型 | 能发现什么 |
|---|---|---|
| `agent_task_success_total` | Counter | 任务成功数量 |
| `agent_task_failure_total` | Counter | 任务失败数量 |
| `agent_task_duration_seconds` | Histogram | 任务整体耗时分布 |
| `agent_model_call_duration_seconds` | Histogram | 模型调用耗时 |
| `agent_tool_call_duration_seconds` | Histogram | 工具执行耗时 |
| `agent_tool_call_failure_total` | Counter | 工具失败数量 |
| `agent_resume_total` | Counter | 任务恢复频率 |
| `agent_unknown_tool_call_total` | Gauge / Counter | 结果不明的工具调用情况 |
| `agent_tokens_total` | Counter | Token 消耗量 |
| `agent_active_tasks` | Gauge | 当前执行中的任务数 |

指标名称只是示例，不是某个标准库规定的固定名称。

实际落地时，建议特别关注三个方向：

1. **可靠性：** 任务成功率、工具失败率、恢复失败率。
2. **性能：** P50、P95、P99 耗时，模型调用和工具执行各自占多少时间。
3. **成本：** 每个 Task 的模型调用次数、Token 消耗、重试次数。

不要直接把 `task_id`、`session_id` 等高基数 ID 当成 Prometheus 指标标签，否则指标时间序列可能急剧膨胀。这类具体 ID 应放在日志和追踪中，指标标签则使用模型类型、工具类型、结果状态等有限集合。

## 九、如何把这一课落地到 Go？

你可以把可观测性作为 Harness 的独立能力，而不是让每个工具都各自写一套日志。

例如：

```go
type Event struct {
    Type      string
    SessionID string
    TaskID    string
    RunID     string
    TraceID   string
    Timestamp time.Time
    Attributes map[string]any
}

type EventSink interface {
    Emit(ctx context.Context, event Event) error
}
```

在 `AgentLoop` 中，每次进入关键阶段时发送事件：

```go
func (a *Agent) Run(
    ctx context.Context,
    taskID string,
) error {
    if err := a.events.Emit(ctx, Event{
        Type: "task.started",
        TaskID: taskID,
        Timestamp: time.Now(),
    }); err != nil {
        return fmt.Errorf("record task start: %w", err)
    }

    // 这里依次执行：
    // 1. 构建 Context
    // 2. 调用模型
    // 3. 校验工具调用
    // 4. 执行工具
    // 5. 持久化结果
    // 6. 判断继续或结束

    return nil
}
```

这里故意没有展开整个循环，因为本课重点是观测接口，而不是重复实现前面几课的执行机制。

生产环境中，你还需要明确事件失败的处理策略：普通调试日志允许降级，但影响恢复、审计或状态一致性的关键事件应通过数据库事务、Outbox 等机制保证可靠写入。

**推荐架构：**

- Agent Loop 负责业务流程。
- Event Sink 负责统一事件出口。
- OpenTelemetry 负责追踪。
- Metrics 系统负责聚合指标。
- 数据库负责持久化任务状态与关键事件。

这些模块各司其职，后面增加并发执行、任务队列或多 Worker 时，也不必推翻 Agent Loop。

## 十、本课总结：把 Harness 看成一台可观察的状态机

今天最重要的不是某个日志 API，而是下面这条完整链路：

<box border radius="xl" padding={3} gap={2}>
  {#each [{n:"01",title:"Task State",desc:"决定任务当前处于什么状态"},{n:"02",title:"Agent Loop",desc:"决定下一步推进哪个阶段"},{n:"03",title:"Model / Tool",desc:"执行推理和具体操作"},{n:"04",title:"Event / Trace",desc:"记录发生了什么、耗时多久"},{n:"05",title:"Persistence",desc:"保存状态与恢复所需的证据"}] as item}
    <row align="center" gap={3}>
      <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
        <title size="sm">{item.n}</title>
      </box>
      <box flex="1" gap={1}>
        **{item.title}**
        <text color="secondary" size="sm">{item.desc}</text>
      </box>
    </row>
  {/each}
</box>

如果你准备自己实现 Coding Harness，我建议始终坚持一个原则：

**每个关键执行阶段都应该有明确的状态、清晰的错误边界、可追踪的关联 ID，以及可验证的恢复路径。**

这会让你的 Agent 从一个“能调用工具的循环”，逐步变成一个可以长期运行、可调试、可恢复的工程系统。

## 第七课小测

{@body const [answer,setAnswer] = DIL.useState("C")}
{@body const [submitted,setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={4}>
  **问题：**

  你发现 Coding Agent 的任务失败率突然上升。监控指标显示整体任务耗时增加，但无法判断是模型变慢还是工具执行变慢。

  哪种设计最有助于定位问题？

  <radio-group value={answer} onChange={(v) => {setAnswer(v);setSubmitted(false)}} direction="col">
    <radio value="A">只记录每个 Task 的最终成功或失败状态。</radio>
    <radio value="B">把所有模型输入、工具参数和结果直接打印到一个文本文件中。</radio>
    <radio value="C">为模型调用、工具执行和持久化阶段建立关联的 Trace / Span，并配合分阶段耗时指标。</radio>
    <radio value="D">每次失败就自动重试三次，不需要记录具体执行阶段。</radio>
  </radio-group>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      {#if answer === "C"}
        <title color="success" size="md">正确！</title>
        关联追踪能定位单次任务的耗时瓶颈，分阶段指标则能判断这是个别问题还是系统性退化。
      {:else}
        <title size="md">再思考一下</title>
        题目要求区分模型、工具和持久化三个阶段。只看最终状态，或只增加重试，都无法定位真正的瓶颈。
      {/if}
    </box>
    <button block onClick={() => GenUI.issueNewTurn(answer === "C" ? "Harness 第七课小测，我选择 C，正确。请批改并继续第八课。" : `Harness 第七课小测，我选择 ${answer}。请批改并继续第八课。`)}>提交并继续第八课</button>
  {:else}
    <button block onClick={() => setSubmitted(true)}>检查答案</button>
  {/if}
</box>

下一课建议进入 **第八课：Harness 的错误处理与重试策略**。我们会系统拆解模型错误、工具错误、权限拒绝、超时、取消和持久化失败，设计统一的错误分类、重试边界、退避策略，以及哪些错误绝对不能自动重试。
