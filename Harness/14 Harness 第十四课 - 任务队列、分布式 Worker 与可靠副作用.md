---
title: "Harness 第十四课 - 任务队列、分布式 Worker 与可靠副作用"
aliases:
  - "Harness 第十四课 - 任务队列、分布式 Worker 与可靠副作用"
tags:
  - harness
  - ai-agent
  - verbatim
  - distributed-systems
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "eb2f0051-117f-44bb-a917-10b60ab578b6"
source_user_message_id: "fede821d-dd3f-42a2-89b0-d71efde0e59e"
source_content_sha256: "8b4242dd07bfa651104d58a903b00b57212b1e4a72adc603ab9b0ac8ff497166"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：14  
> 原始章节：Harness 第十四课：任务队列、分布式 Worker 与可靠副作用  
> 合并消息 ID：`eb2f0051-117f-44bb-a917-10b60ab578b6`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 继续
> ~~~

返回：[[Harness 知识地图]]

---

好，我们继续！上一课讲了状态机、事件驱动和多 Worker 并发调度。这一课我们把它们落到更实际的问题上：**如何让 Harness 在工具执行失败、进程崩溃、网络超时和重复消费的情况下，依然可靠地完成任务。**

# Harness 第十四课：任务队列、分布式 Worker 与可靠副作用

本课的核心目标是设计一个能够恢复、能够重试、不会轻易重复产生副作用的任务执行系统。

## 一、先理解一个关键问题：任务只执行一次，可能吗？

假设你的 Coding Harness 要调用一个远程 API，创建一个代码仓库。

执行过程如下：

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **Worker 调用远程 API**
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **远程服务成功创建仓库**
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **Worker 写入成功状态之前崩溃**
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border={{size:1,color:"#D97706"}} radius="lg" padding={3} align="center" gap={1}>
    <icon name="circle-help" size="xl" color="#D97706" />
    **恢复后，Harness 不知道仓库是否已经创建**
    <text color="secondary" size="sm">盲目重试，可能创建第二个仓库。</text>
  </box>
</box>

这不是简单的异常捕获问题，而是分布式系统中的经典问题：

**外部操作已经发生，但本地没有可靠地记录结果。**

你无法通过数据库事务把本地数据库与任意远程 API 自动变成一个原子事务。

因此，Harness 需要明确区分三个目标：

- **At-most-once**：至多执行一次，可能因为故障而没有完成。
- **At-least-once**：至少尝试执行一次，可能发生重复执行。
- **Effectively-once**：允许重复投递或调用，但通过幂等机制，让业务效果表现得像只发生一次。

生产级任务队列通常会选择可靠投递，并结合幂等性实现 effectively-once 的业务效果，而不是假设网络和进程永远不会出问题。

## 二、设计 Harness 的任务队列

首先区分三个对象：

| 对象 | 职责 |
|---|---|
| Task | 用户交给 Agent 的完整任务 |
| Job | 可以被队列调度的一次执行工作 |
| Tool Call | Agent 执行过程中的一次具体工具调用 |

一个 Task 可能包含多个 Job，而一个 Job 也可能产生多次 Tool Call。

例如：

```text
Task: 修复登录 Bug
  ├── Job 1: 分析代码
  ├── Job 2: 修改代码
  ├── Job 3: 运行测试
  └── Job 4: 检查 Git diff
```

这里有个重要细节：这些 Job 并不一定能并行执行。修改代码通常必须先于测试，测试又通常必须先于最终验收。

所以，**任务队列负责调度执行工作，Harness 的计划和依赖系统负责决定哪些工作可以执行。**

### 1. Job 的状态

我们给 Job 设计一个状态机：

<box border radius="xl" padding={3} gap={2}>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
        <icon name="clock" size="lg" />
        **queued**
        <text size="xs" color="secondary">等待执行</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
        <icon name="loader" size="lg" />
        **running**
        <text size="xs" color="secondary">执行中</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} align="center" gap={1}>
        <icon name="timer" size="lg" />
        **retry_wait**
        <text size="xs" color="secondary">等待重试</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} align="center" gap={1}>
        <icon name="check-circle" size="lg" />
        **succeeded**
        <text size="xs" color="secondary">执行成功</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} align="center" gap={1}>
        <icon name="circle-x" size="lg" />
        **dead**
        <text size="xs" color="secondary">最终失败，等待排查</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} align="center" gap={1}>
        <icon name="ban" size="lg" />
        **cancelled**
        <text size="xs" color="secondary">已取消</text>
      </box>
    </grid-item>
  </grid>
  <text color="secondary" size="sm">Job 的状态与 Task 的状态相互关联，但不能混为一谈。一个 Job 失败，不一定意味着整个 Task 必须失败。</text>
</box>

例如，一个 Job 运行测试失败，Agent 可能修改代码后重新创建测试 Job；也可能按照策略重试原 Job。

两种行为都可以成立，但需要明确记录重试次数、执行版本和失败原因。

### 2. 任务表应该存储什么？

一个可落地的 MySQL 表可以从下面的结构开始：

```sql
CREATE TABLE harness_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id VARCHAR(64) NOT NULL,
    job_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',

    payload JSON NOT NULL,
    result JSON NULL,
    last_error JSON NULL,

    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_run_at DATETIME(3) NULL,

    lease_owner VARCHAR(128) NULL,
    lease_until DATETIME(3) NULL,
    lease_epoch BIGINT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,

    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,

    INDEX idx_dispatch (status, next_run_at, created_at),
    INDEX idx_task (task_id)
);
```

这张表负责调度和恢复，不应该承担所有执行历史。

生产实现通常还需要独立的 Tool Call 表、事件日志和必要的唯一约束，以保存调用参数摘要、幂等键、外部请求 ID、执行结果以及结果未知时的核对信息。

另外，`payload` 和 `result` 不宜无约束地存储完整的模型上下文或敏感凭证。

## 三、重试不是简单地再执行一次

我们在第八课学过错误分类。现在把它应用到任务队列。

假设一个 Job 运行失败：

| 错误类型 | 合理策略 |
|---|---|
| 网络暂时不可用 | 在预算允许且操作安全时重试 |
| HTTP 429 | 遵守服务端限流提示，延迟重试 |
| 参数校验失败 | 修正参数或结束，不要原样无限重试 |
| 权限不足 | 请求授权或直接失败 |
| 超时，结果明确未产生 | 可根据策略重试 |
| 超时，但副作用结果未知 | 先核对结果，不能盲目重试 |
| 达到重试上限 | 转入最终失败和排查流程 |

**重试策略必须由错误语义、副作用风险和幂等能力共同决定。**

### 1. 指数退避与随机抖动

一个常见的退避策略：

\[
d_n = \min(d_{\max},d_0 \times 2^n)
\]

其中：

- \(d_0\)：初始延迟。
- \(n\)：重试次数。
- \(d_{\max}\)：最大延迟。

再加入 Full Jitter：

\[
delay \sim U(0,d_n)
\]

这样可以减少大量 Worker 同时重试造成的流量尖峰。

例如，初始延迟 1 秒，最大延迟 30 秒：

```go
func retryDelay(attempt int) time.Duration {
    const (
        base = time.Second
        max  = 30 * time.Second
    )

    capDelay := base

    for i := 0; i < attempt && capDelay < max; i++ {
        capDelay *= 2
        if capDelay > max {
            capDelay = max
        }
    }

    // 生产实现应使用并发安全的随机源，
    // 生成 [0, capDelay] 范围内的随机延迟。
    return time.Duration(rand.Int64N(int64(capDelay) + 1))
}
```

需要注意：这只是计算延迟的示例。实际调度时，应该把下一次执行时间持久化到 `next_run_at`，让 Worker 释放执行槽位，而不是一直 `sleep` 占用 Worker。

同时还要设置任务总 Deadline、最大重试次数和整体预算，防止某个 Job 无限消耗资源。

## 四、幂等键：可靠副作用的关键

现在回到最初的问题：远程 API 已经成功，但 Worker 崩溃了。

假设远程服务支持幂等键，那么每个逻辑操作可以生成一个稳定的 key：

```text
task_id = task-1001
tool_call_id = call-2001

idempotency_key = task-1001:call-2001
```

首次调用：

```http
POST /repositories
Idempotency-Key: task-1001:call-2001
```

网络超时后再次调用时，仍然使用相同的 key。

如果远程服务正确实现了幂等性，并且仍处于其幂等键的有效期内，第二次请求可以返回第一次操作的结果，而不是再次创建仓库。

这里有四个必须明确的条件：

1. 同一个逻辑操作的重试必须使用相同的幂等键。
2. 不同的逻辑操作不能意外共享同一个键。
3. 服务端必须真正实现幂等语义；客户端自行添加 Header 并不能保证幂等。
4. 幂等记录的保留时间、请求参数冲突处理和并发请求行为，都需要遵守服务端契约。

如果远程 API 不支持幂等键，就需要考虑业务唯一约束、操作结果查询、对账接口，或者将 Tool Call 标记为 `unknown` 并交由恢复流程处理。

## 五、Harness 如何处理未知结果？

建议把一次 Tool Call 的结果分成以下几种：

```go
type ToolOutcome string

const (
    OutcomeSucceeded ToolOutcome = "succeeded"
    OutcomeFailed    ToolOutcome = "failed"
    OutcomeUnknown   ToolOutcome = "unknown"
)
```

其中 `unknown` 很重要。

它不代表调用失败，也不代表调用成功，而是说明 Harness 暂时没有足够证据判断真实结果。

例如：

```text
1. 持久化 Tool Call 为 running
2. 发起远程请求
3. 服务端可能已经执行成功
4. 客户端读取响应时超时
5. 将 Tool Call 转入结果核对流程
6. 根据幂等键或查询接口确定结果
7. 确定成功后记录 succeeded
8. 确定未执行且可以安全重试时才重新调用
```

如果核对接口本身也不可用，Harness 应继续保留未知状态或安排后续核对，而不是为了让任务状态看起来整齐，就随意改成 `failed`。

## 六、Go 中的 Job 执行骨架

把任务领取、工具执行、结果持久化与重试分开：

```go
func (w *Worker) ExecuteJob(
    ctx context.Context,
    job Job,
) error {
    lease, err := w.store.Claim(ctx, job.ID, w.ID)
    if err != nil {
        return err
    }

    // 先恢复此前结果未知的调用。
    if err := w.reconcileUnknownCalls(ctx, lease); err != nil {
        return err
    }

    // 这里执行前还应检查取消状态、预算、权限和 Deadline。
    result, err := w.executor.Execute(ctx, job.Payload)

    if err != nil {
        classified := classifyError(err)

        switch classified.Kind {
        case ErrorOutcomeUnknown:
            // 不假定副作用未发生。
            return w.store.MarkUnknown(ctx, lease, err)

        case ErrorTransient:
            if !classified.SafeToRetry {
                return w.store.MarkUnknown(ctx, lease, err)
            }

            return w.store.ScheduleRetry(
                ctx,
                lease,
                retryDelay(job.Attempts),
                err,
            )

        default:
            return w.store.MarkFailed(ctx, lease, err)
        }
    }

    // 状态更新必须验证租约代数或版本，
    // 防止旧 Worker 覆盖新 Worker 的执行结果。
    return w.store.MarkSucceeded(ctx, lease, result)
}
```

这里的 `Claim`、`reconcileUnknownCalls` 和 `MarkSucceeded` 等属于需要实现的存储层接口；`classifyError` 也必须结合具体工具的副作用语义，而不能仅仅判断错误字符串。

尤其要注意：如果工具已经执行成功，但 `MarkSucceeded` 因数据库连接中断而失败，也不能简单把工具再执行一次。应该先查询已持久化的调用记录和外部业务状态，再决定如何恢复。

## 七、死信队列（Dead Letter Queue）

如果一个 Job 连续失败五次，就应该永远删除吗？

通常不应该。

可以将达到重试上限、无法自动恢复的任务标记为 `dead`，保留：

- 原始任务与调用标识。
- 已经尝试的次数。
- 最近的错误和时间。
- 最后一次已知状态。
- 外部请求 ID 和幂等键。
- 是否存在尚未确认的副作用。

之后由人工或专门的恢复流程检查。

但不要把所有失败都塞进死信队列。权限错误、用户取消、参数校验错误和未知副作用具有不同的业务含义，应有清晰的终态和处理路径。

## 八、本课的架构总结

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **持久化任务队列**
    <text color="secondary" size="sm">状态、重试次数、下次执行时间</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Worker + Lease**
    <text color="secondary" size="sm">原子领取、续租、Fencing Token</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Tool Runtime**
    <text color="secondary" size="sm">权限、执行、超时、幂等键</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="check-circle" size="lg" />
        **确定成功**
        <text color="secondary" size="sm">持久化结果</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="refresh-cw" size="lg" />
        **结果未知**
        <text color="secondary" size="sm">核对、恢复或人工介入</text>
      </box>
    </grid-item>
  </grid>
</box>

请记住这一句：

**可靠的 Harness 不是保证每一步永远不失败，而是保证失败后仍然知道发生了什么，以及接下来可以安全地做什么。**

## 第十四课小测

{@body const [answer, setAnswer] = DIL.useState("C")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景：**

  Agent 调用远程 API 创建资源，客户端等待响应时超时。远程服务没有明确返回失败，也不支持幂等键。Harness 无法确认资源是否已经创建。

  你应该如何处理？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 立即重试，超时就意味着第一次请求失败。</radio>
    <radio value="B">B. 直接把 Tool Call 标记为 succeeded，因为请求已经发出。</radio>
    <radio value="C">C. 标记为 unknown，先查询或对账；在确认未执行且满足安全条件前，不盲目重试。</radio>
    <radio value="D">D. 立即把整个 Task 标记为 failed，并删除所有执行记录。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "C" ? "回答正确！" : "再想一想"}</title>
      {#if answer === "C"}
        正确。超时只说明客户端没有及时得到确定结果，不代表远程操作没有发生。没有幂等键时，盲目重试可能制造重复资源。先核对结果，才是安全的恢复路径。
      {:else}
        关键是区分“请求超时”和“远程操作失败”。当副作用结果未知时，应保留未知状态并尝试核对，而不是凭猜测决定是否重试。
      {/if}
    </box>
  {/if}
</box>

下一课我们将进入第十五课：**Coding Harness 的文件系统、Git 工作区与代码修改安全机制**，把任务执行、沙箱隔离、文件变更追踪和 Git diff 验收整合起来，逐步构建一个真正可落地的 AI 编程 Harness。
