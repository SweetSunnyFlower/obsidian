---
title: "Harness 第二十三课 - 事件日志、可观测性与故障诊断"
aliases:
  - "Harness 第二十三课 - 事件日志、可观测性与故障诊断"
tags:
  - harness
  - ai-agent
  - verbatim
  - observability
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "3bb4f9b7-ecab-4307-84d9-f08c575c30bf"
source_user_message_id: "dc15e19c-4780-4ea2-9ec4-84c8c7f590ec"
source_content_sha256: "3e3981f43c4fdab959a75ec0e030c13c72748d1121d16fbbc22b3fcd45a3de1a"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：23  
> 原始章节：Harness 第二十三课：事件日志、可观测性与故障诊断  
> 合并消息 ID：`3bb4f9b7-ecab-4307-84d9-f08c575c30bf`  
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

上一课我们学习了 Harness 的任务并发、资源调度与多 Agent 协作，知道了独立 Git Worktree、任务依赖 DAG、资源锁和集成验收分别解决什么问题。

这一课，我们继续把系统往生产环境推进一步：**当 Agent 出现卡死、重复调用工具、任务状态不一致、成本突然飙升时，Harness 如何快速定位问题？**

# Harness 第二十三课：事件日志、可观测性与故障诊断

## 一、先理解一个核心问题：Agent 为什么特别难排查？

传统后端接口通常有比较明确的执行路径：

```text
HTTP 请求
   ↓
业务逻辑
   ↓
数据库查询
   ↓
返回响应
```

而 Coding Harness 的执行过程更复杂：

```text
用户任务
   ↓
模型分析
   ↓
调用工具
   ↓
工具执行
   ↓
返回结果
   ↓
模型再次分析
   ↓
修改文件
   ↓
运行测试
   ↓
继续修复
   ↓
验收任务
```

一个任务可能包含几十次模型调用、上百次工具调用，以及多个并发子任务。

如果最终任务失败，只看到一条日志：

```text
Task failed
```

那么你几乎无法回答以下问题：

- 是模型没有生成正确的工具调用，还是工具执行失败？
- 工具执行失败后，为什么没有重试？
- 工具其实已经执行成功，为什么 Harness 又执行了一次？
- Agent 为什么一直循环修改同一个文件？
- 哪次模型调用消耗了最多 Token？
- 任务明明显示完成，为什么代码并没有通过测试？

所以，生产级 Harness 必须具备一套完整的**可观测性系统（Observability）**。

## 二、可观测性到底是什么？

可观测性通常分成三个部分。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="file-text" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **1. Logs：日志**

      <text color="secondary" size="sm">回答：发生了什么？</text>

      例如，某次 `go test ./...` 执行失败，退出码为 1，错误输出是什么。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="chart-no-axes-combined" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **2. Metrics：指标**

      <text color="secondary" size="sm">回答：整体运行得怎么样？</text>

      例如，任务成功率、平均执行时长、模型调用次数、Token 消耗、工具超时率。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="git-branch" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **3. Traces：调用链追踪**

      <text color="secondary" size="sm">回答：一次任务经过了哪些步骤？</text>

      例如，从用户请求到模型调用、工具执行、测试验收，完整还原执行链路。
    </box>
  </row>
</box>

这三个部分不是相互替代的。

假设任务耗时突然从 30 秒增加到 3 分钟：

- Metrics 告诉你：平均执行时长上升了。
- Traces 告诉你：时间主要花在某次工具调用上。
- Logs 告诉你：这个工具为什么一直等待。

**指标发现异常，调用链定位位置，日志解释原因。**

## 三、先设计统一的 ID：让所有事件能够关联起来

这是整个可观测性系统的基础。

你之前学习过 Task、Run、Tool Call、Session 等概念。现在我们要把它们真正串联起来。

建议使用以下标识：

| ID | 用途 | 示例 |
|---|---|---|
| `session_id` | 一段持续的用户交互 | `sess_001` |
| `task_id` | 用户希望完成的任务 | `task_101` |
| `run_id` | 一次实际执行过程 | `run_202` |
| `turn_id` | 一轮模型交互 | `turn_003` |
| `model_call_id` | 一次模型请求 | `mc_004` |
| `tool_call_id` | 一次工具调用 | `tc_005` |
| `trace_id` | 整条调用链 | `trace_abc` |
| `span_id` | 调用链中的一个操作 | `span_def` |

为什么需要这么多 ID？

因为它们描述的是不同层级。

例如，用户要求修复一个 Bug，这个 `task_id` 可以保持不变，但 Harness 可能执行两次 `run_id`：第一次因为测试失败而中断，第二次从持久化状态恢复。

同一次运行中，又可能有十几次模型请求，每次模型请求还可能产生多个工具调用。

如果只使用一个 `task_id`，你就很难准确定位某次工具调用及其耗时。

### 一条完整的关联链

<box border radius="xl" padding={3} gap={1} align="center">
  <box border radius="md" padding={2} width="100%" align="center">
    **Task**
    <text color="secondary" size="xs">task_id = task_101</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="md" padding={2} width="100%" align="center">
    **Run**
    <text color="secondary" size="xs">run_id = run_202</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="md" padding={2} width="100%" align="center">
    **Model Call**
    <text color="secondary" size="xs">model_call_id = mc_004</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="md" padding={2} width="100%" align="center">
    **Tool Call**
    <text color="secondary" size="xs">tool_call_id = tc_005</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box background="surface-secondary" radius="md" padding={2} width="100%" align="center">
    **Tool Result**
    <text color="secondary" size="xs">exit_code = 1 · duration_ms = 2300</text>
  </box>
</box>

注意：模型调用和工具调用不一定是简单的一对一关系。一次模型响应可能产生多个工具调用，工具执行结果也可能在下一次模型请求中被共同处理。因此，实际追踪系统应当支持父子 Span 和多个关联事件，而不是只设计一条固定的线性链路。

---

## 四、Harness 应该记录哪些事件？

不要只在代码里随意打印 `fmt.Println()`。更好的做法是建立一套统一的领域事件模型。

例如：

```go
type Event struct {
    ID        string         `json:"id"`
    Type      string         `json:"type"`
    Timestamp time.Time      `json:"timestamp"`

    SessionID string         `json:"session_id,omitempty"`
    TaskID    string         `json:"task_id,omitempty"`
    RunID     string         `json:"run_id,omitempty"`
    TraceID   string         `json:"trace_id,omitempty"`
    SpanID    string         `json:"span_id,omitempty"`

    Data      map[string]any `json:"data,omitempty"`
}
```

这个结构可以作为入门示例。生产环境中，最好为核心事件设计明确的类型，而不是把所有字段都塞进一个无约束的 `map[string]any`。

### 1. 任务生命周期事件

```text
task.created
task.queued
task.claimed
task.started
task.waiting_approval
task.retry_scheduled
task.recovering
task.verifying
task.completed
task.failed
task.cancelled
```

这些事件用于还原任务状态变化。

例如，任务长时间没有完成，并不一定代表模型卡住了。它可能正等待用户批准，或者正在等待 Worker 租约到期。

### 2. 模型调用事件

```text
model.requested
model.started
model.stream_chunk
model.completed
model.failed
model.cancelled
```

建议记录：

- 模型名称和供应商。
- 请求开始和结束时间。
- 输入、输出 Token 数量（如果供应商提供）。
- 请求延迟、重试次数。
- 是否返回工具调用。
- 结束原因，例如正常结束或达到输出限制。

模型原始输入和输出可能包含敏感数据，不应该默认完整写入生产日志。

### 3. 工具调用事件

```text
tool.requested
tool.validated
tool.approval_required
tool.started
tool.completed
tool.failed
tool.timed_out
tool.cancelled
tool.outcome_unknown
```

特别值得注意的是 `tool.outcome_unknown`。

假设 Agent 调用一个外部 API 创建资源，服务端已经执行成功，但响应在网络中丢失。

Harness 不能简单地认为操作失败。它应该记录结果未知，之后根据工具的幂等能力、查询接口和对账策略决定如何恢复。

### 4. 验收事件

```text
verification.started
verification.check_passed
verification.check_failed
verification.completed
```

例如：

```json
{
  "type": "verification.check_failed",
  "task_id": "task_101",
  "data": {
    "check": "go_test",
    "command": "go test ./...",
    "exit_code": 1,
    "reason": "test assertion failed"
  }
}
```

这样，你就能明确知道任务没有完成，是因为测试验收未通过，而不是仅仅看到一个模糊的 `Task failed`。

---

## 五、用 Go 实现结构化日志

Go 的标准库 `log/slog` 已经能够很好地支持结构化日志，不必一开始就引入复杂的日志框架。

下面实现一个可以贯穿 Harness 各个模块的日志记录器。

```go
package observability

import (
    "context"
    "log/slog"
    "os"
)

type LogContext struct {
    SessionID string
    TaskID    string
    RunID     string
    TraceID   string
}

type Logger struct {
    base *slog.Logger
}

func NewLogger() *Logger {
    handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
        Level: slog.LevelInfo,
    })

    return &Logger{
        base: slog.New(handler),
    }
}

func (l *Logger) ForTask(
    ctx LogContext,
) *slog.Logger {
    return l.base.With(
        "session_id", ctx.SessionID,
        "task_id", ctx.TaskID,
        "run_id", ctx.RunID,
        "trace_id", ctx.TraceID,
    )
}

func (l *Logger) ToolStarted(
    ctx context.Context,
    toolCallID string,
    toolName string,
) {
    l.base.InfoContext(
        ctx,
        "tool.started",
        "tool_call_id", toolCallID,
        "tool_name", toolName,
    )
}
```

调用示例：

```go
logger := NewLogger()

taskLogger := logger.ForTask(LogContext{
    SessionID: "sess_001",
    TaskID:    "task_101",
    RunID:     "run_202",
    TraceID:   "trace_abc",
})

taskLogger.Info(
    "task.started",
    "attempt", 1,
    "agent_type", "coding",
)

taskLogger.Error(
    "task.failed",
    "reason", "verification_failed",
)
```

实际开发时，可以进一步把 `LogContext` 绑定到 `context.Context` 中，让任务执行链路自动继承关联 ID。

上面 `ToolStarted` 为了演示简洁，直接使用基础 Logger；生产实现应当让它使用当前任务的 Logger，并保证工具调用事件与对应的 Trace、Span 正确关联。

另外，日志不是任务状态的替代品。关键状态变更需要持久化到数据库或事件存储中，不能因为日志已经打印就认为任务状态一定已经保存成功。

---

## 六、Tracing：如何知道时间究竟花在哪里？

这是本课最实用的部分之一。

假设某次任务的调用链如下：

<box border radius="xl" padding={3} gap={3}>
  **一次任务的耗时分布**

  {@body const spans = [{name:"模型请求 1",start:0,duration:1.2},{name:"读取文件",start:1.2,duration:0.1},{name:"模型请求 2",start:1.3,duration:1.0},{name:"执行测试",start:2.3,duration:8.0},{name:"模型请求 3",start:10.3,duration:1.1}]}
  {#each spans as s}
    <box gap={1} key={s.name}>
      <row align="center" justify="between">
        <text size="sm">{s.name}</text>
        <text color="secondary" size="sm">{s.duration.toFixed(1)} 秒</text>
      </row>
      <box background="surface-tertiary" radius="sm" height="12px" clip>
        <box background={s.name === "执行测试" ? "rgba(234, 153, 65, 0.9)" : "rgba(75, 145, 210, 0.85)"} height="12px" radius="sm" width={`${s.duration / 11.4 * 100}%`} />
      </box>
    </box>
  {/each}
  <divider color="subtle" />
  <row align="center" justify="between">
    **总耗时**
    <title size="lg">11.4 秒</title>
  </row>
  <text color="secondary" size="sm">这是用于说明 Span 耗时分布的示例数据，不是实际运行结果。</text>
</box>

从这个例子可以看出，执行测试耗时 8 秒，是主要瓶颈。

如果你只记录模型 Token 消耗，就会忽略真正影响任务时延的因素。

Tracing 中通常使用 Span 表示一个操作：

```text
Trace: task_101
│
├── Span: orchestrator.run
│   ├── Span: model.generate
│   ├── Span: tool.read_file
│   ├── Span: model.generate
│   ├── Span: tool.run_tests
│   └── Span: verification.check
```

每个 Span 通常应记录：

- 开始时间与结束时间。
- 操作名称。
- 父 Span ID。
- 成功或失败状态。
- 关键属性，例如工具名、模型名。
- 错误类型与可安全记录的错误摘要。

有了这些数据，你可以计算：

- 模型调用的 P50、P95、P99 延迟。
- 工具调用的失败率。
- 任务端到端耗时。
- 不同阶段的耗时占比。
- 并行执行中的等待时间。

对于 Go 项目，生产级实现可以采用 OpenTelemetry，把 Trace 导出到支持 OTLP 的后端。需要注意，Span 的父子关系应遵循真实执行关系，并行子任务不能强行拼成虚假的顺序调用链。

---

## 七、Metrics：用指标发现系统正在退化

日志适合调查具体问题，但如果每次都要逐条搜索日志，排查成本会很高。

因此需要建立指标。

建议 Coding Harness 至少包含以下指标：

| 指标 | 类型 | 主要用途 |
|---|---|---|
| `harness_tasks_total` | Counter | 任务数量及成功、失败分布 |
| `harness_task_duration_seconds` | Histogram | 任务耗时分布 |
| `harness_active_tasks` | Gauge | 当前活动任务数 |
| `harness_model_calls_total` | Counter | 模型请求次数 |
| `harness_tool_calls_total` | Counter | 工具调用数量及结果 |
| `harness_tool_duration_seconds` | Histogram | 工具耗时分布 |
| `harness_retries_total` | Counter | 重试次数 |
| `harness_tokens_total` | Counter | Token 消耗量 |
| `harness_queue_wait_seconds` | Histogram | 任务排队等待时间 |

### 为什么必须关注 P95，而不只是平均值？

假设两组任务的耗时如下：

- A 组：大部分任务 10 秒完成。
- B 组：大部分任务 10 秒完成，但少数任务卡住 5 分钟。

两组平均值可能看起来差不多，但用户体验明显不同。

P95 表示约 95% 的观测值不超过这个耗时，能帮助你发现慢任务。

同时还需要关注指标的标签设计。不要把 `task_id`、`trace_id` 或用户输入等高基数字段直接作为 Prometheus 指标标签，否则可能产生海量时间序列。它们更适合放在日志和 Trace 中。

---

## 八、如何诊断一个真实的 Harness 故障？

假设线上出现以下现象：

> 一批 Coding 任务没有完成，部分任务耗时超过 10 分钟，模型 API 仍然正常。

推荐按照下面的顺序排查。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="chart-no-axes-combined" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **第一步：确认异常范围**

      查看任务成功率、P95 延迟、活动任务数和队列等待时间。

      如果活动任务很多但完成数没有增加，可能存在执行阻塞或 Worker 饱和。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="git-branch" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **第二步：打开异常任务的 Trace**

      查看时间主要消耗在哪个 Span：模型请求、资源锁等待、工具执行、测试验收，还是任务调度。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="file-search" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **第三步：检查关联事件和日志**

      根据 `task_id`、`run_id`、`tool_call_id` 追踪工具失败、重试、锁等待、Worker 租约和状态持久化事件。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="shield-check" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **第四步：确定恢复策略**

      先区分任务是否仍在执行、是否已经失去租约，以及工具的外部副作用是否确定发生。

      只有确认恢复方式安全之后，才取消、重试或重新领取任务。
    </box>
  </row>
</box>

这里有一个非常重要的原则：

**发现异常后，不要把“重新运行任务”当成默认修复方法。**

例如，任务卡在支付、部署、邮件发送或其他有副作用的工具调用上时，盲目重试可能重复执行操作。应该先判断结果是确定失败还是未知，再决定如何恢复。

---

## 九、日志、指标和 Trace 应该存在哪里？

这取决于你的系统规模。

| 阶段 | 推荐方案 |
|---|---|
| 本地开发 | `slog` 结构化日志 + 本地 JSON 文件 |
| 单机服务 | 结构化日志 + 数据库任务状态 + 基础 Metrics |
| 多 Worker | 集中日志、Prometheus 类指标系统、分布式 Trace |
| 生产级平台 | OpenTelemetry 采集、日志与 Trace 后端、告警和任务审计 |

需要特别区分两类数据：

**运行可观测性数据**用于分析性能和故障；**业务状态数据**用于决定任务现在处于什么状态、能否恢复、是否可以宣布完成。

比如：

```text
日志：worker lease expired
任务状态：recovering
工具状态：outcome_unknown
```

三者可能同时存在，但意义不同。

任务状态和工具副作用状态必须通过可靠的持久化机制管理，不能只依靠日志推断。

### 安全方面还需要注意什么？

Coding Harness 的日志可能包含代码片段、文件路径、命令参数、模型输入和工具输出。

因此应该：

- 对 API Key、访问令牌和密码进行脱敏。
- 限制原始模型输入、工具输出的记录范围。
- 为日志和 Trace 设置访问权限与保留周期。
- 对敏感操作记录审计事件。
- 防止工具输出中的换行符等内容伪造日志事件。
- 让高风险操作即使没有详细日志，也必须经过权限策略和执行边界控制。

可观测性帮助你发现问题，但它本身不能替代权限控制、安全隔离和验收机制。

---

## 十、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  一个 Coding Harness 的任务耗时突然增加。Metrics 显示任务 P95 延迟明显上升，但模型 API 的延迟正常。

  你需要判断时间究竟花在工具执行、资源锁等待、任务排队还是其他环节。最合理的做法是什么？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 直接提高模型调用并发数，通常就能降低任务耗时。</radio>
    <radio value="B">B. 通过 Trace 找到耗时较长的 Span，再关联任务和工具日志定位原因，并检查相关状态与指标。</radio>
    <radio value="C">C. 只增加日志打印，不需要记录关联 ID 或调用链。</radio>
    <radio value="D">D. 自动重试所有超时任务，直到它们完成。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！Metrics 负责发现异常，Trace 用于定位耗时阶段，日志和持久化状态帮助解释原因。排查完成后，再根据副作用和任务状态决定是否恢复。
      {:else}
        题目的关键是先定位瓶颈，而不是直接调整并发或盲目重试。模型 API 正常并不能证明其他执行阶段没有问题。
      {/if}
    </box>
  {/if}
</box>

## 本课总结

这一课要掌握的不是某一个日志库，而是建立完整的诊断思维：

1. 用统一 ID 把 Session、Task、Run、Model Call 和 Tool Call 关联起来。
2. 用结构化事件还原任务生命周期。
3. 用 Trace 定位调用链中的耗时和失败节点。
4. 用 Metrics 发现成功率、延迟、资源使用和成本异常。
5. 用持久化状态和副作用记录决定如何安全恢复任务。
6. 用脱敏、权限和保留策略保护可观测性数据。

下一课进入第二十四课：**Harness 的生产部署、配置管理、健康检查与优雅关闭**。我们将进一步解决进程重启、Worker 退出、配置变更、资源清理和服务上线后的稳定性问题。
