---
title: "08 Harness 第八课 - 错误处理与重试策略"
aliases:
  - "Harness 第八课 - 错误处理与重试策略"
tags:
  - harness
  - ai-agent
  - verbatim
  - reliability
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "5af3412c-5807-4b7d-8d7f-fd1c85cbfceb"
source_turn_id: "cf022bdb-f862-479a-86c9-3600e3ef2a8c"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：08  
> 原始章节：原回答完整内容  
> 合并消息 ID：`5af3412c-5807-4b7d-8d7f-fd1c85cbfceb`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第七课小测，我选择 C，正确。请批改并继续第八课。
> ~~~

返回：[[Harness 知识地图]]

---

第七课小测，**C，完全正确！** 🎯

你选的是：为模型调用、工具执行和持久化阶段建立关联的 Trace / Span，并配合分阶段耗时指标。

这道题的关键是区分两种能力：

- **Metrics（指标）**告诉你：整个系统是不是变慢了、失败率是不是上升了。
- **Traces（追踪）**告诉你：某一个任务究竟慢在哪个阶段、经历了哪些调用。

例如，任务总耗时从 5 秒上升到 20 秒，只有整体耗时指标还不够。如果追踪显示模型调用仍然是 2 秒，而工具执行从 1 秒变成了 16 秒，你就可以把排查重点放在工具上，而不是盲目更换模型。

现在我们继续第八课。这一课很重要，因为真实的 Agent 不可能永远顺利执行：模型会超时，工具会报错，网络会中断，数据库也可能写入失败。**Harness 的价值，不仅在于让任务跑起来，更在于出错时能够做出正确的决策。**

# 第八课：Harness 的错误处理与重试策略

## 一、本课目标

学完这一课，你应该能够：

1. 对 Agent 中的错误进行分类，而不是统一 `catch` 后重试。
2. 区分可以重试、需要修正、需要审批和必须停止的错误。
3. 设计指数退避、随机抖动和重试预算。
4. 理解模型重试与工具重试为什么不能使用完全相同的策略。
5. 在 Go 中设计统一的错误类型和重试边界。

## 二、先纠正一个常见错误：失败不等于重试

先看一段很常见、但很危险的代码：

```go
for i := 0; i < 3; i++ {
    err := executeTool(ctx, call)
    if err == nil {
        break
    }
}
```

这段代码把所有错误都当成同一种情况。

假设 `executeTool` 执行的是：

- 读取文件：重试通常问题不大。
- 调用模型：遇到临时网络错误，可以考虑重试。
- 修改文件：要先确认上一次是否已经成功写入。
- 删除数据库记录：不能不加判断地重复执行。
- 发布生产部署：失败后可能需要核查外部系统状态。
- 权限检查：用户没有授权时，重试三次也不会突然获得授权。

所以，正确的问题不是“失败后重试几次”，而是：

**这个错误意味着什么？再次执行是否安全？重试有没有可能改变结果？**

## 三、建立统一的错误分类

在 Harness 中，我建议把错误分成六类。分类的目的不是给错误起名字，而是让 Runtime 知道下一步应该怎么做。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="refresh-cw" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **1. Transient Error：临时错误**

      <badge color="success">可能重试</badge>

      <text size="sm">例如临时网络中断、服务端限流、部分 5xx 错误。需要检查错误是否可重试，并考虑退避时间。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="file-warning" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **2. Validation Error：参数错误**

      <badge>先修正</badge>

      <text size="sm">例如工具缺少必填参数、JSON 格式错误、文件路径不合法。应该修正输入，而不是原样重试。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="shield-alert" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **3. Permission Error：权限错误**

      <badge color="danger">停止或审批</badge>

      <text size="sm">例如用户拒绝执行 Shell 命令、工具无权访问某个目录。不能通过反复重试绕过权限控制。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="clock-alert" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **4. Timeout / Cancellation：超时与取消**

      <badge>区分处理</badge>

      <text size="sm">超时可能允许重试；用户主动取消则通常不应自动重新启动。两者都需要考虑底层操作是否已经产生副作用。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="database" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **5. Persistence Error：持久化错误**

      <badge color="danger">谨慎处理</badge>

      <text size="sm">例如工具已执行成功，但结果无法写入数据库。此时不能简单地重新执行工具，应优先修复记录问题并核实实际执行结果。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="circle-help" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **6. Unknown Outcome：结果未知**

      <badge color="danger">先对账</badge>

      <text size="sm">例如远程 API 已收到请求，但响应丢失。必须先查询执行状态，或使用服务端支持的幂等机制。</text>
    </box>
  </row>
</box>

注意，这六类不是完全互斥的。例如一次 HTTP 请求可能既超时，又属于结果未知。实际实现中最好把错误原因、是否可重试、是否有副作用、是否需要人工介入分开表达，而不是仅靠一个错误字符串判断。

## 四、把错误分类变成可执行的策略

如果只定义错误类型，却没有统一的处理策略，Agent 依然会在不同地方各自写一套 `if/else`。

我们可以先定义一个决策结果：

```go
type ErrorKind string

const (
    ErrorTransient    ErrorKind = "transient"
    ErrorValidation   ErrorKind = "validation"
    ErrorPermission   ErrorKind = "permission"
    ErrorTimeout      ErrorKind = "timeout"
    ErrorCancelled    ErrorKind = "cancelled"
    ErrorPersistence  ErrorKind = "persistence"
    ErrorUnknown      ErrorKind = "unknown_outcome"
)

type Action string

const (
    ActionRetry       Action = "retry"
    ActionRepair      Action = "repair"
    ActionAskApproval Action = "ask_approval"
    ActionReconcile   Action = "reconcile"
    ActionStop        Action = "stop"
)

type ErrorInfo struct {
    Kind              ErrorKind
    Message           string
    Retryable         bool
    SideEffectPossible bool
    RetryAfterSeconds int
}

func Decide(err ErrorInfo) Action {
    if err.Kind == ErrorCancelled {
        return ActionStop
    }

    if err.Kind == ErrorPermission {
        return ActionAskApproval
    }

    if err.SideEffectPossible ||
        err.Kind == ErrorUnknown {
        return ActionReconcile
    }

    if err.Kind == ErrorValidation {
        return ActionRepair
    }

    if err.Retryable {
        return ActionRetry
    }

    return ActionStop
}
```

这只是一个教学用的基础策略，生产实现还要把审批是否已经拒绝、任务剩余预算、重试次数、幂等能力和错误来源纳入判断。

特别注意：这里把 `SideEffectPossible` 放在普通重试之前，是因为**安全性优先于可用性**。如果一次操作可能已经改变了外部世界，应该先核实，而不是因为错误看起来“像临时错误”就再次执行。

## 五、指数退避：不要让重试变成攻击

假设模型服务发生故障，1000 个 Agent 同时收到错误。

如果每个 Agent 都立刻重试，服务压力会更大，故障甚至可能持续恶化。

这就是为什么重试通常要采用指数退避（Exponential Backoff）。

常见计算方式：

\[
d_n = \min(d_{\max},d_0 \times 2^n)
\]

其中：

- \(d_0\)：初始等待时间。
- \(n\)：已经重试的次数，从 0 开始。
- \(d_{\max}\)：最大等待时间。

例如，初始等待 500 毫秒，最大等待 8 秒：

| 重试序号 | 不含随机抖动的等待时间 |
|---|---:|
| 第 1 次 | 0.5 秒 |
| 第 2 次 | 1 秒 |
| 第 3 次 | 2 秒 |
| 第 4 次 | 4 秒 |
| 第 5 次 | 8 秒 |

这里还要加入 **Jitter（随机抖动）**，避免大量请求在同一时刻再次冲击服务。

常见的 Full Jitter 策略是：

\[
d_n = U(0,\min(d_{\max},d_0 \times 2^n))
\]

也就是从 0 到当前退避上限之间随机选择等待时间。

### Go 实现

```go
package retry

import (
    "context"
    "math/rand/v2"
    "time"
)

type Policy struct {
    MaxAttempts int
    BaseDelay   time.Duration
    MaxDelay    time.Duration
}

func (p Policy) Delay(retryIndex int) time.Duration {
    delay := p.BaseDelay

    for i := 0; i < retryIndex; i++ {
        if delay >= p.MaxDelay/2 {
            delay = p.MaxDelay
            break
        }
        delay *= 2
    }

    if delay > p.MaxDelay {
        delay = p.MaxDelay
    }

    // Full Jitter：在 [0, delay) 中随机选择。
    if delay <= 0 {
        return 0
    }

    return time.Duration(rand.Int64N(int64(delay)))
}

func Sleep(
    ctx context.Context,
    delay time.Duration,
) error {
    timer := time.NewTimer(delay)
    defer timer.Stop()

    select {
    case <-ctx.Done():
        return ctx.Err()
    case <-timer.C:
        return nil
    }
}
```

这段代码展示了退避算法，但还没有执行任何重试。把重试策略和业务执行分开很重要：退避组件只负责计算等待时间，是否重试应由错误分类和任务策略决定。

真实项目中还要注意：

- 如果服务端返回 `Retry-After`，应按协议处理，并与本地退避、总截止时间协调。
- `MaxAttempts` 必须有明确语义：是总尝试次数，还是失败后的重试次数。不要在不同组件里混用。
- 等待时间不能超过剩余任务截止时间。
- 随机抖动不能把服务端要求的最短等待时间缩短。

## 六、真正的重试边界应该在哪里？

这是本课最容易在实际开发中犯错的地方。

假设你的 Agent Loop 是：

```text
调用模型
  → 模型要求执行工具
  → 执行工具
  → 把工具结果交给模型
```

如果工具失败，你应该重试工具，还是重试整个 Agent Loop？

答案是：**优先在最小的、可以安全重试的失败边界处理错误。**

<box border radius="xl" padding={3} gap={3}>
  <title size="md">情况 A：模型 API 临时返回 503</title>
  <text color="secondary" size="sm">如果请求没有产生需要核对的外部副作用，可以在模型调用层重试。成功后继续原有流程。</text>
  <box background="surface-secondary" radius="md" padding={2}>
    <text size="sm">Model Call → Retry → Model Response</text>
  </box>
  <divider color="subtle" />
  <title size="md">情况 B：工具参数不合法</title>
  <text color="secondary" size="sm">不要重复执行同一组错误参数。将明确的校验错误反馈给模型，允许模型修正参数，但要限制修正次数。</text>
  <box background="surface-secondary" radius="md" padding={2}>
    <text size="sm">Tool Validation → Error Feedback → Model Repair</text>
  </box>
  <divider color="subtle" />
  <title size="md">情况 C：工具执行超时，结果不确定</title>
  <text color="secondary" size="sm">不要直接重放工具调用。先查询执行状态、检查副作用，或使用已设计好的幂等恢复机制。</text>
  <box background="surface-secondary" radius="md" padding={2}>
    <text size="sm">Tool Timeout → Reconcile → Retry or Resume</text>
  </box>
  <divider color="subtle" />
  <title size="md">情况 D：模型持续循环但没有完成任务</title>
  <text color="secondary" size="sm">这可能不是临时故障。应该检查循环预算、工具结果质量、任务状态和完成条件，而不是无限重试模型。</text>
  <box background="surface-secondary" radius="md" padding={2}>
    <text size="sm">Loop Budget → Diagnose → Continue, Pause or Fail</text>
  </box>
</box>

为什么不能在最外层简单地写：

```go
for retry := 0; retry < 3; retry++ {
    err := agent.Run(ctx, taskID)
    if err == nil {
        return nil
    }
}
```

因为 `agent.Run` 可能已经修改了 20 个文件、执行了若干 Shell 命令，甚至发布了某个服务。整个任务从头执行三次，可能产生完全不同的副作用。

如果要恢复整个任务，应该调用第六课设计的 Recovery Runtime，让它从持久化状态恢复，而不是把任务当成一次普通函数调用。

## 七、模型重试与工具重试，为什么不一样？

| 维度 | 模型调用 | 工具调用 |
|---|---|---|
| 主要失败 | 网络错误、限流、服务端错误、输出格式错误 | 权限错误、执行错误、超时、副作用不确定 |
| 常见恢复 | 退避后重试、调整请求、修复输出 | 核验状态、修正参数、幂等重试、人工审批 |
| 结果是否确定 | 通常要检查请求是否完成、响应是否可用 | 必须考虑外部操作是否已经生效 |
| 重复调用的风险 | 额外费用、不同响应、重复请求 | 文件重复修改、重复创建资源、重复部署等 |
| 关键 ID | `model_call_id`、请求 ID | `tool_call_id`、幂等键 |

特别提醒：即使模型调用本身是只读的，重复请求也可能产生额外费用，并返回不同结果。模型重试最好有独立的调用预算，并且不要把一次模型调用失败误认为整个任务已经失败。

另一个常见问题是重试嵌套。

假设：

- HTTP 客户端自动重试 3 次。
- Model Provider 再重试 3 次。
- Agent Loop 又重试 3 次。

最坏情况下，底层请求可能达到 \(3 \times 3 \times 3 = 27\) 次。

因此，重试策略要在各层协调：明确谁负责重试、总尝试次数是多少、整个任务的截止时间是什么，以及底层 SDK 是否已经启用了自动重试。

## 八、除了重试，还需要预算和熔断

一个可靠的 Harness 至少应该有三道限制。

<box gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="repeat" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **Retry Budget：重试预算**

      限制同一调用或任务可以重试多少次，防止单个故障不断消耗资源。
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="timer" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **Deadline：总截止时间**

      单次调用即使没有超时，也不能无限占用整个任务。所有重试和退避时间都必须计入总预算。
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="shield-check" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **Circuit Breaker：熔断器**

      当某个下游服务持续失败时，暂时阻止新的调用，避免持续施压。经过冷却时间后，再允许有限的探测请求。
    </box>
  </row>
</box>

三者并不互相替代：

- 重试预算限制单个请求的重试行为。
- Deadline 限制任务可以消耗的总时间。
- 熔断器保护整个系统免受持续故障的影响。

举个例子：某个模型服务连续返回 503。每个任务即使只重试两次，如果同时有一万个任务运行，也可能对故障服务造成巨大压力。熔断器可以在服务明显异常时阻止大量新请求，而不是让所有任务各自重复尝试。

对于 Coding Agent，还应该设置任务级预算，例如最大模型调用次数、最大工具调用次数、最大 Token 消耗和最大执行时间。否则，即使每次调用都成功，Agent 也可能因为逻辑循环而一直消耗资源。

## 九、把重试策略放进 Harness 的统一执行层

建议不要让每个工具各自写一套重试循环，而是提供统一的 Retry Runtime。

下面是一个可复用的 Go 骨架：

```go
package retry

import (
    "context"
    "errors"
    "fmt"
    "time"
)

type Decision func(error) bool

type Policy struct {
    MaxAttempts int
    BaseDelay   time.Duration
    MaxDelay    time.Duration
    ShouldRetry Decision
    RetryAfter  func(error) time.Duration
}

func Do(
    ctx context.Context,
    policy Policy,
    operation func(context.Context) error,
) error {
    if policy.MaxAttempts < 1 {
        return errors.New("max attempts must be >= 1")
    }

    if operation == nil {
        return errors.New("operation is nil")
    }

    for attempt := 0; attempt < policy.MaxAttempts; attempt++ {
        if err := ctx.Err(); err != nil {
            return err
        }

        err := operation(ctx)
        if err == nil {
            return nil
        }

        // 不重试已取消的任务。
        if ctx.Err() != nil {
            return ctx.Err()
        }

        // 最后一次尝试失败，直接返回。
        if attempt+1 >= policy.MaxAttempts {
            return fmt.Errorf(
                "all %d attempts failed: %w",
                policy.MaxAttempts,
                err,
            )
        }

        // 未配置策略时默认不重试。
        if policy.ShouldRetry == nil ||
            !policy.ShouldRetry(err) {
            return err
        }

        delay := policy.BaseDelay
        for i := 0; i < attempt; i++ {
            if delay >= policy.MaxDelay/2 {
                delay = policy.MaxDelay
                break
            }
            delay *= 2
        }

        if policy.MaxDelay > 0 &&
            delay > policy.MaxDelay {
            delay = policy.MaxDelay
        }

        // 如果错误携带服务端建议等待时间，
        // 应由策略统一决定最终延迟。
        if policy.RetryAfter != nil {
            if d := policy.RetryAfter(err); d > delay {
                delay = d
            }
        }

        if err := sleep(ctx, delay); err != nil {
            return err
        }
    }

    return errors.New("unreachable")
}

func sleep(
    ctx context.Context,
    delay time.Duration,
) error {
    timer := time.NewTimer(delay)
    defer timer.Stop()

    select {
    case <-ctx.Done():
        return ctx.Err()
    case <-timer.C:
        return nil
    }
}
```

这个骨架的重点是职责划分：

- `operation` 负责实际操作。
- `ShouldRetry` 负责判断当前错误是否可以重试。
- `RetryAfter` 负责处理服务端给出的等待建议。
- `Policy` 控制总尝试次数和退避。
- `ctx` 控制取消。

它还不是生产级实现：需要补充随机抖动、输入参数校验、Deadline 协调，以及对“可能已经产生副作用”的错误进行强制拦截。尤其是写操作，不能仅因为 `ShouldRetry` 返回 `true` 就认为重试一定安全。

**最重要的一条：通用重试组件只能执行已经被业务策略判定为安全的重试，不能自行推断任意工具是否幂等。**

## 十、本课总结

把今天的知识压缩成一张决策表：

| 遇到的问题 | Harness 应采取的动作 |
|---|---|
| 临时网络错误，且操作可安全重试 | 退避后重试 |
| 参数校验失败 | 修正输入，必要时请求模型重新生成 |
| 权限被拒绝 | 停止或请求授权 |
| 用户主动取消 | 终止执行并传播取消信号 |
| 工具超时，执行结果未知 | 先对账，不盲目重试 |
| 工具成功，但持久化失败 | 恢复记录与核验结果，避免重复副作用 |
| 下游服务持续失败 | 限流、熔断，必要时暂停任务 |
| Agent 无限循环 | 检查任务预算、终止条件和状态转换 |

真正成熟的 Harness，不会只有一个 `retry()` 函数，而会有一套清晰的错误分类、执行策略、预算控制和恢复机制。

## 第八课小测

{@body const [answer,setAnswer] = DIL.useState("B")}
{@body const [submitted,setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={4}>
  **场景：**

  Coding Agent 调用远程 API 创建一个部署任务。客户端等待超时，但服务端可能已经成功创建任务。工具执行器返回了一个 timeout 错误。

  Harness 应该怎么做？

  <radio-group value={answer} onChange={(v) => {setAnswer(v);setSubmitted(false)}} direction="col">
    <radio value="A">所有 timeout 都属于临时错误，立即重试三次。</radio>
    <radio value="B">判断操作是否可能已经生效；如果结果未知，先用幂等键或查询接口核实，再决定是否重试。</radio>
    <radio value="C">直接把整个 Task 标记为失败，要求用户重新提交。</radio>
    <radio value="D">让模型重新生成一个工具调用 ID，再次调用 API。</radio>
  </radio-group>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      {#if answer === "B"}
        <title color="success" size="md">回答正确！</title>
        Timeout 描述的是等待没有按时完成，并不证明远程操作失败。先核实结果，才能安全决定后续动作。
      {:else}
        <title size="md">再想一想</title>
        关键是区分请求超时与操作失败。服务端可能已经创建了资源，盲目重试可能导致重复部署任务。
      {/if}
    </box>
    <button block onClick={() => GenUI.issueNewTurn(answer === "B" ? "Harness 第八课小测，我选择 B，正确。请批改并继续第九课。" : `Harness 第八课小测，我选择 ${answer}。请批改并继续第九课。`)}>提交并继续第九课</button>
  {:else}
    <button block onClick={() => setSubmitted(true)}>检查答案</button>
  {/if}
</box>

下一课我们将学习 **第九课：权限系统与 Human-in-the-Loop（人在回路中）**，重点包括工具权限模型、自动批准与人工审批的边界、审批状态持久化，以及如何防止模型通过改变参数或重复调用工具绕过安全策略。
