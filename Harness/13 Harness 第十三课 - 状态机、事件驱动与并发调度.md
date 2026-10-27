---
title: "13 Harness 第十三课 - 状态机、事件驱动与并发调度"
aliases:
  - "Harness 第十三课 - 状态机、事件驱动与并发调度"
tags:
  - harness
  - ai-agent
  - verbatim
  - verification-planning
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "47bbae35-28a4-4bcb-abbb-d83498de077e"
source_turn_id: "94288a48-d119-400a-b3aa-9d5a63e75976"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：13  
> 原始章节：原回答完整内容  
> 合并消息 ID：`47bbae35-28a4-4bcb-abbb-d83498de077e`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第十二课小测，我选择 C。请批改答案，并继续下一课。
> ~~~

返回：[[Harness 知识地图]]

---

# Harness 第十二课批改：答案 C，正确！✅

你抓住了 Harness 工程中一个非常重要的原则：**模型说任务完成，不代表任务真的完成。**

回顾一下题目：代码修改完成、测试通过，但 Git diff 发现 Agent 修改了用户明确要求不要碰的配置文件。模型却声称任务已经完成。

你选择的 C 是正确答案。

为什么？

- **测试通过不等于验收通过。** 测试只能证明某些行为符合预期，不能证明没有违反修改范围约束。
- **验收标准必须由 Harness 强制执行。** 不能只依赖模型自己的判断。
- **失败后应该修复，而不是掩盖问题。** Harness 应记录具体违规文件，要求 Agent 修复，再重新检查 diff 和必要的测试。
- **不能直接重置整个仓库。** 这可能破坏用户原有的未提交修改。

我们可以把这个原则写成一条规则：

```go
if !acceptance.AllPassed() {
    task.Status = "failed" // 或进入修复流程
    return
}

task.Status = "completed"
```

实际工程中，发现问题后通常先进入修复流程；只有修复失败、预算耗尽或达到终止条件时，才最终标记为 `failed`。

到这里，你已经学完了 Harness 的任务规划、执行循环和完成判定。接下来，我们进入更接近真实生产环境的架构设计。

---

# Harness 第十三课：状态机、事件驱动与并发调度

本课要解决一个核心问题：

**当多个 Worker 同时执行任务，期间又发生崩溃、审批等待、重复消费或任务取消时，Harness 如何保证状态正确？**

这也是从单机 Agent Loop 迈向真正的 Coding Harness 的关键一步。

## 一、为什么 Harness 必须使用状态机？

先看一个看似简单的任务：

> 修改 `user.go`，运行测试，检查 Git diff，最后告诉用户结果。

如果只用一个大循环，代码很容易逐渐变成这样：

```go
for {
    if task.Cancelled {
        // 取消任务
    }

    if task.WaitingApproval {
        // 等待审批
    }

    if task.ToolFailed {
        // 重试工具
    }

    if task.TestsPassed && task.DiffPassed {
        // 完成任务
    }

    // 调用模型，执行工具……
}
```

一开始没问题，但功能不断增加之后，你会遇到这些问题：

- 一个已完成的任务还能不能重新执行？
- 等待用户审批时，Worker 崩溃了怎么办？
- 任务取消后，某个工具却返回了成功结果怎么办？
- 两个 Worker 同时把一个任务标记为完成怎么办？
- 旧 Worker 恢复运行后，会不会覆盖新 Worker 的结果？

问题的根源是：**任务的状态、状态转换规则和副作用处理散落在各个分支中。**

解决方案是建立显式状态机。

## 二、设计任务状态机

先明确一个容易混淆的概念：Task、Step 和 Tool Call 应该分别管理状态。

<box border radius="xl" padding={3} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
    <icon name="workflow" size="xl" />
    **Task：整个任务**
    <text color="secondary" size="sm">目标、预算、取消状态、验收结果</text>
  </box>
  <box align="center">
    <icon name="arrow-down" size="lg" color="secondary" />
  </box>
  <box background="surface" border radius="lg" padding={3} align="center" gap={1}>
    **Step：计划中的步骤**
    <text color="secondary" size="sm">修改代码、运行测试、检查 diff</text>
  </box>
  <box align="center">
    <icon name="arrow-down" size="lg" color="secondary" />
  </box>
  <box background="surface" border radius="lg" padding={3} align="center" gap={1}>
    **Tool Call：具体的一次工具调用**
    <text color="secondary" size="sm">调用 shell、读取文件、执行测试命令</text>
  </box>
</box>

举个例子：

Task 处于 `running`，Step 处于 `running`，但某次 Tool Call 已经处于 `unknown`。

这并不矛盾。它意味着整个任务仍然可以继续推进，但某次工具执行的真实结果尚未确定，需要先核实。

### 1. 定义 Task 状态

我们先使用以下状态：

| 状态 | 含义 |
|---|---|
| `queued` | 等待 Worker 领取 |
| `running` | 正在执行 |
| `waiting_approval` | 等待用户授权 |
| `waiting_input` | 等待用户补充信息 |
| `retry_wait` | 等待重试时间到达 |
| `recovering` | 正在恢复或核对中断的执行 |
| `verifying` | 正在检查任务是否满足验收标准 |
| `completed` | 所有必要验收均通过 |
| `failed` | 任务最终失败 |
| `cancelled` | 任务已取消 |

这里有一个设计重点：`waiting_approval` 不是 `running` 的同义词。

等待审批时，Worker 可以释放执行槽位，让其他任务继续运行。审批通过后，任务重新进入调度流程。

### 2. 定义合法状态转换

状态机不只是枚举状态，更重要的是规定哪些转换合法。

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="md" padding={3} align="center">
    **queued**
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface" border radius="md" padding={3} align="center">
    **running**
  </box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box align="center" padding={1}><icon name="arrow-down" color="secondary" /></box>
      <box border radius="md" padding={2} align="center" gap={1}>
        **verifying**
        <text size="xs" color="secondary">执行步骤已结束</text>
      </box>
      <box align="center" padding={1}><icon name="arrow-down" color="secondary" /></box>
      <box background="surface-secondary" radius="md" padding={2} align="center">
        **completed**
      </box>
    </grid-item>
    <grid-item>
      <box align="center" padding={1}><icon name="arrow-down" color="secondary" /></box>
      <box border radius="md" padding={2} align="center" gap={1}>
        **retry_wait**
        <text size="xs" color="secondary">可重试的错误</text>
      </box>
      <box align="center" padding={1}><icon name="arrow-down" color="secondary" /></box>
      <box background="surface-secondary" radius="md" padding={2} align="center">
        **queued**
      </box>
    </grid-item>
  </grid>
  <divider />
  <text color="secondary" size="sm">其他合法分支包括审批等待、用户输入、恢复、失败和取消。具体转换由事件和业务规则决定。</text>
</box>

例如：

- `queued → running`：Worker 成功领取任务。
- `running → waiting_approval`：遇到需要用户授权的操作。
- `waiting_approval → queued`：审批通过，等待重新调度。
- `running → retry_wait`：遇到符合重试策略的错误。
- `running → recovering`：发现上一次执行结果不确定。
- `running → verifying`：计划中的必要步骤已完成。
- `verifying → completed`：所有必要验收项通过。
- `verifying → running`：验收失败，但允许 Agent 修复。
- `queued → cancelled`：任务尚未开始就被取消。

注意，不能因为模型返回 `done`，就允许任意状态直接转到 `completed`。

## 三、用 Go 实现状态机

先写一个独立的状态转换器。它不调用模型、不执行工具，只负责判断状态转换是否合法。

文件：`internal/harness/state_machine.go`

```go
package harness

import (
	"fmt"
)

type TaskStatus string

const (
	StatusQueued           TaskStatus = "queued"
	StatusRunning          TaskStatus = "running"
	StatusWaitingApproval  TaskStatus = "waiting_approval"
	StatusWaitingInput     TaskStatus = "waiting_input"
	StatusRetryWait        TaskStatus = "retry_wait"
	StatusRecovering       TaskStatus = "recovering"
	StatusVerifying        TaskStatus = "verifying"
	StatusCompleted        TaskStatus = "completed"
	StatusFailed           TaskStatus = "failed"
	StatusCancelled        TaskStatus = "cancelled"
)

var transitions = map[TaskStatus]map[TaskStatus]bool{
	StatusQueued: {
		StatusRunning:   true,
		StatusCancelled: true,
	},
	StatusRunning: {
		StatusWaitingApproval: true,
		StatusWaitingInput:    true,
		StatusRetryWait:        true,
		StatusRecovering:       true,
		StatusVerifying:        true,
		StatusFailed:           true,
		StatusCancelled:        true,
	},
	StatusWaitingApproval: {
		StatusQueued:    true,
		StatusCancelled: true,
		StatusFailed:    true,
	},
	StatusWaitingInput: {
		StatusQueued:    true,
		StatusCancelled: true,
		StatusFailed:    true,
	},
	StatusRetryWait: {
		StatusQueued:    true,
		StatusCancelled: true,
		StatusFailed:    true,
	},
	StatusRecovering: {
		StatusQueued:    true,
		StatusRunning:   true,
		StatusFailed:    true,
		StatusCancelled: true,
	},
	StatusVerifying: {
		StatusCompleted: true,
		StatusRunning:   true, // 验收失败，返回修复流程
		StatusFailed:    true,
		StatusCancelled: true,
	},
}

func CanTransition(from, to TaskStatus) bool {
	return transitions[from][to]
}

func Transition(from, to TaskStatus) error {
	if !CanTransition(from, to) {
		return fmt.Errorf(
			"invalid task transition: %s -> %s",
			from,
			to,
		)
	}

	return nil
}
```

这只是一个可运行的状态转换骨架，生产实现还需要为事件类型、状态转换条件和终态处理增加规则。

例如，`verifying → completed` 还必须检查验收项是否全部通过。状态机允许转换，并不代表业务条件自动满足。

```go
if err := Transition(StatusVerifying, StatusCompleted); err != nil {
	return err
}

if !acceptance.AllPassed() {
	return fmt.Errorf("acceptance checks have not all passed")
}
```

更严谨的实现会把状态检查、验收检查、版本检查和状态更新放进同一个持久化事务，避免检查通过后状态又被其他 Worker 修改。

## 四、状态机之外，还需要事件驱动

状态机解决的是“现在是什么状态，允许转到哪里”。

但如果你还想知道任务为什么进入这个状态，就需要事件。

例如，任务进入 `waiting_approval`，至少有两种可能：

- Agent 请求执行一个需要授权的命令。
- Agent 请求修改一个受保护的文件。

只看当前状态无法区分这两种情况。

因此，Harness 还需要记录事件。

### 1. 设计事件模型

```go
type EventType string

const (
	EventTaskCreated       EventType = "task.created"
	EventTaskClaimed       EventType = "task.claimed"
	EventStepStarted       EventType = "step.started"
	EventToolCallStarted   EventType = "tool.started"
	EventToolCallSucceeded EventType = "tool.succeeded"
	EventToolCallFailed    EventType = "tool.failed"
	EventToolCallUnknown   EventType = "tool.unknown"
	EventApprovalRequested EventType = "approval.requested"
	EventApprovalGranted   EventType = "approval.granted"
	EventVerificationPassed EventType = "verification.passed"
	EventVerificationFailed EventType = "verification.failed"
	EventTaskCompleted     EventType = "task.completed"
	EventTaskFailed        EventType = "task.failed"
	EventTaskCancelled     EventType = "task.cancelled"
)

type Event struct {
	ID        string
	TaskID    string
	RunID     string
	Sequence  int64
	Type      EventType
	Payload   []byte
	CreatedAt int64
}
```

`Sequence` 表示同一任务中的事件顺序。实际项目中还应有事件版本、发生时间、执行者、关联的 Tool Call ID，以及必要的幂等键。

事件示例：

```text
task.created
task.claimed
step.started
tool.started
tool.succeeded
tool.started
tool.succeeded
verification.failed
step.started
tool.started
tool.succeeded
verification.passed
task.completed
```

这条记录可以还原任务的执行过程，也能帮助排查为什么任务最终成功或失败。

### 2. Event Log 与当前状态的关系

<box border radius="xl" padding={3} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **事件写入 Event Log**
    <text color="secondary" size="sm">发生了什么？</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **状态转换与投影**
    <text color="secondary" size="sm">根据事件和规则计算当前状态</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="database" size="lg" />
        **Task 表**
        <text color="secondary" size="sm">当前状态、版本、租约</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="activity" size="lg" />
        **事件历史**
        <text color="secondary" size="sm">过程审计、恢复依据</text>
      </box>
    </grid-item>
  </grid>
</box>

这里需要区分两个概念：

- **Event Log**：记录发生过什么，是审计和恢复的重要依据。
- **State Projection**：根据已记录的事件和规则得到的当前状态，便于快速查询。

注意：有事件日志，不代表你必须立刻采用完整的 Event Sourcing 架构。对于第一版 Coding Harness，使用普通的 Task 表、Tool Call 表和追加式事件表，通常就足够了。

关键是不能让事件记录与状态更新随意分离。例如，数据库里任务已经标记为 `completed`，但对应的完成事件丢失了，就会给后续审计带来麻烦。可以使用数据库事务同时写入事件与状态；需要可靠地发布外部消息时，再考虑 Outbox Pattern。

## 五、多 Worker 调度：为什么不能先查询再更新？

现在进入本课最重要的并发问题。

假设数据库里有一个任务：

```text
task_id = 1001
status  = queued
```

Worker A 和 Worker B 同时抢任务。

错误实现：

```sql
SELECT id
FROM tasks
WHERE status = 'queued'
LIMIT 1;
```

接着两个 Worker 都执行：

```sql
UPDATE tasks
SET status = 'running'
WHERE id = 1001;
```

两个 Worker 都可能认为自己领取成功，然后同时调用模型、修改文件、运行工具。

这就是典型的竞态条件。

**进程内的 `sync.Mutex` 无法解决多个进程、多个服务器之间的任务竞争。** 锁必须放在所有竞争者共同遵守的协调机制中，例如数据库原子操作或分布式协调系统。

### 方案 A：原子领取任务

对于 MySQL，可以使用条件更新实现单个任务的原子领取：

```sql
UPDATE tasks
SET
    status = 'running',
    lease_owner = ?,
    lease_until = ?,
    version = version + 1
WHERE id = ?
  AND status = 'queued';
```

随后检查受影响的行数：

- `RowsAffected() == 1`：当前 Worker 成功领取。
- `RowsAffected() == 0`：任务已经被其他 Worker 领取，或者状态不再符合条件。

这能解决单个任务的竞争领取。对于批量任务队列，还需要设计原子化的候选任务选取与领取流程，不能先随意查出任务列表，再逐个无条件更新。

### 方案 B：使用 `FOR UPDATE SKIP LOCKED`

对于支持该语法的 MySQL 8.0 版本，可以考虑使用事务锁定候选行：

```sql
START TRANSACTION;

SELECT id
FROM tasks
WHERE status = 'queued'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- 在同一事务中更新刚刚选中的任务
UPDATE tasks
SET status = 'running'
WHERE id = ?;

COMMIT;
```

这里的 `?` 应当绑定刚刚选中的任务 ID。实际代码还要处理查询没有结果、事务失败、锁等待与回滚。

`SKIP LOCKED` 允许并发 Worker 跳过已经被其他事务锁定的行，因此很适合某些数据库任务队列。但它不是万能的：事务必须足够短，数据库版本必须支持，而且领取成功后仍需处理租约、崩溃和重复执行。

## 六、为什么原子领取仍然不够？还需要 Lease 和 Fencing Token

假设 Worker A 领取任务后开始运行，随后网络卡住。

租约到期后，Worker B 重新领取任务并成功完成。

几秒后，Worker A 恢复了。它仍然认为自己拥有任务，于是把任务状态写回 `running`，甚至覆盖 Worker B 的结果。

这就是**过期 Worker 写入问题**。

### 1. 使用 Lease（租约）

任务记录可以包含：

```text
lease_owner = worker-b
lease_until = 2026-10-27T10:30:00Z
lease_epoch = 12
version     = 28
```

Worker 定期续租。租约过期后，调度器可以重新回收任务，但在回收之前，应先确认原 Worker 是否真的失联、任务是否正在执行，以及是否需要进入恢复流程。

### 2. 使用 Fencing Token

每次重新领取任务时，都分配一个递增的 `lease_epoch`：

```text
Worker A 获得 epoch = 11
Worker B 重新领取，获得 epoch = 12
```

之后，Worker A 即使恢复，也不能再使用 epoch 11 更新任务状态。

```sql
UPDATE tasks
SET
    status = ?,
    version = version + 1
WHERE id = ?
  AND lease_owner = ?
  AND lease_epoch = ?
  AND version = ?;
```

只有租约持有者、租约代数和版本都匹配时，更新才成功。具体字段及检查方式可以按数据库设计调整。

这里有三个不同的保护机制：

| 机制 | 解决什么问题 |
|---|---|
| 原子领取 | 避免两个 Worker 同时领取同一任务 |
| Lease | 检测任务所有权是否过期 |
| Fencing Token | 阻止旧 Worker 在新 Worker 接管后继续写入 |

但还有一个重要边界：**Fencing Token 只有在接收方也校验它时，才能保护该接收方的资源。**

它能有效保护数据库状态；但如果旧 Worker 已经向一个不支持 fencing 的外部 API 发出了请求，就不能靠更新数据库的 epoch 撤销那个请求。

因此，外部副作用仍然需要幂等键、状态核对或接收方支持的并发控制。

## 七、把这些机制组合成 Go Worker

一个简化的 Worker 生命周期可以是：

```go
func (w *Worker) Process(ctx context.Context, task Task) error {
    // 1. 原子领取并获得租约与 epoch。
    lease, err := w.store.Claim(ctx, task.ID, w.ID)
    if err != nil {
        return err
    }

    // 2. 定期续租；租约丢失后停止发起新的副作用。
    workCtx, cancel := context.WithCancel(ctx)
    defer cancel()

    go w.renewLease(workCtx, lease, cancel)

    // 3. 恢复之前未确定结果的 Tool Call。
    if err := w.recoverUnknownCalls(workCtx, lease); err != nil {
        return err
    }

    // 4. 执行计划中的步骤。
    if err := w.runSteps(workCtx, lease); err != nil {
        return w.handleExecutionError(ctx, lease, err)
    }

    // 5. 独立检查验收标准。
    result, err := w.verify(workCtx, lease)
    if err != nil {
        return err
    }
    if !result.AllPassed() {
        return w.requestRepairOrFail(ctx, lease, result)
    }

    // 6. 携带 lease epoch 与版本进行条件更新。
    // 旧 Worker 即使恢复，也不能覆盖新 Worker 的状态。
    return w.store.CompleteWithFence(ctx, lease, result)
}
```

这里的 `Claim`、`renewLease`、`recoverUnknownCalls`、`runSteps` 等是需要你在项目中实现的接口，并非 Go 标准库函数。

还有两个实战细节：

1. 续租失败时，要取消本地执行上下文，停止继续启动新工具调用；但取消上下文不能保证已经发出的远程请求或子进程的副作用被撤销。
2. 如果 Worker 在调用外部 API 后崩溃，恢复时不能直接假定调用失败。应该先根据幂等键或业务查询接口核对结果，必要时将 Tool Call 保持在 `unknown`，直到结果可以确定。

## 八、这节课应该形成的架构认识

把前面学过的内容串起来，生产级 Harness 的执行过程可以概括为：

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **数据库队列**
    <text color="secondary" size="sm">原子领取、租约、版本控制</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Task State Machine**
    <text color="secondary" size="sm">校验状态转换、预算、取消与审批</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Agent Loop + Tool Runtime**
    <text color="secondary" size="sm">模型推理、权限检查、工具执行、结果验证</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Event Log + Verification**
    <text color="secondary" size="sm">记录过程、核对副作用、判断任务是否真正完成</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **持久化结果**
    <text color="secondary" size="sm">completed / failed / cancelled</text>
  </box>
</box>

真正的关键不是引入多少种架构模式，而是明确每个环节的责任：

- 模型负责提出下一步行动。
- Tool Runtime 负责安全执行工具。
- 状态机负责约束任务状态转换。
- 数据库负责跨 Worker 协调和持久化。
- 事件日志负责记录执行历史。
- 验收器负责判断任务是否真正完成。

## 九、第十三课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  你的 Harness 部署了两个 Go Worker。它们同时尝试领取一个 `queued` 任务。开发者已经在每个 Worker 内部加了 `sync.Mutex`，但仍然发生了重复执行。

  你认为最合理的修复方案是什么？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 把每个 Worker 的 `sync.Mutex` 改成读写锁 `sync.RWMutex`。</radio>
    <radio value="B">B. 使用数据库原子领取或事务锁定，并通过租约、fencing token 和幂等处理应对故障与重复执行。</radio>
    <radio value="C">C. 只把任务状态从 `queued` 改成 `running`，不需要检查更新是否成功。</radio>
    <radio value="D">D. 将模型温度设为 0，避免模型重复调用工具。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "回答正确！" : "再想一想"}</title>
      {#if answer === "B"}
        进程内锁无法协调不同 Worker 进程之间的竞争。原子领取负责避免重复抢占；租约和 fencing token 负责处理 Worker 失联、重新接管及旧 Worker 恢复的问题；幂等与结果核对负责控制重复副作用。
      {:else}
        关键在于：两个 Worker 可能运行在不同进程甚至不同服务器上。需要一个双方共同遵守的协调机制，不能只依赖单个进程的锁。
      {/if}
    </box>
  {/if}
</box>

下一课我们将继续深入：**第十四课——任务队列、分布式 Worker 与可靠副作用**。重点是如何设计任务重试、死信队列、幂等键、任务恢复与外部 API 调用，让整个 Harness 在进程崩溃和网络异常之后仍能可靠运行。
