---
title: "12 Harness 第十二课 - 任务规划、执行循环与完成判定"
aliases:
  - "Harness 第十二课 - 任务规划、执行循环与完成判定"
tags:
  - harness
  - ai-agent
  - verbatim
  - verification-planning
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "371575c9-4165-4715-a885-ef4196f9e023"
source_turn_id: "c8849ec8-7e21-4749-b8af-5c72c9f60d56"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：12  
> 原始章节：原回答完整内容  
> 合并消息 ID：`371575c9-4165-4715-a885-ef4196f9e023`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第十一课小测，我选择 C。请批改答案，并继续第十二课：Harness 的任务规划、执行循环与完成判定。
> ~~~

返回：[[Harness 知识地图]]

---

# Harness Engineering 第 12 课：任务规划、执行循环与完成判定

## 一、先批改第十一课小测

你的答案是 **C，完全正确！**

测试退出码为 `0`，只能说明测试命令成功退出，不能证明用户要求的 Bug 已经修复。

这个场景中，Harness 发现 Agent 只修改了注释，没有修改真正出错的业务逻辑，因此应该：

1. 将任务标记为尚未通过验收，而不是直接完成。
2. 检查实际 Git diff 与任务验收标准。
3. 生成结构化验证结果，指出业务逻辑未发生预期变化。
4. 将验证结果反馈给 Agent，让它继续修复。
5. 达到验收条件后，再允许任务进入完成状态。

这里还有一个很重要的区别：**Harness 可以判断任务尚未通过验收，但不应该仅凭“没有修改业务代码”就断定任务失败。** 有些 Bug 确实可能通过配置调整、依赖升级或测试修正解决。最终应依据具体任务的验收标准，而不是简单的代码行数或文件类型。

前十一课，我们已经分别学习了工具执行、并发控制、上下文管理、任务恢复、可观测性、错误重试、权限审批、Sandbox 和结果验证。

今天开始把这些组件真正串起来。

我们的目标是构建一个可以：

- 理解用户任务；
- 制定可执行计划；
- 分步骤调用工具；
- 根据结果调整计划；
- 验证实际成果；
- 在满足条件时可靠结束任务；

的 Harness Runtime。

---

## 二、首先理解：Agent Loop 不等于 Harness Runtime

很多人第一次实现 Agent 时，写出来的核心循环大概是这样：

```go
for {
    response := model.Generate(messages)

    if response.HasToolCalls() {
        executeTools(response.ToolCalls)
        continue
    }

    return response.Text
}
```

这个循环可以演示 Agent 的基本原理，但距离可靠的 Harness 还有相当大的差距。

它没有明确处理：

- 任务应该分几步完成；
- 哪些步骤依赖其他步骤；
- 工具失败后应该继续、重试还是重新规划；
- 工具结果是否经过验证；
- 用户要求是否真正满足；
- 达到调用预算后如何结束；
- 服务重启后如何恢复；
- 模型声称完成时，Harness 是否有足够证据。

我们需要把三个层次区分开来。

<box border radius="lg" padding={3} gap={3}>
  <box gap={1}>
    <title size="md">1. Agent Loop：模型交互循环</title>
    <text color="secondary" size="sm">处理模型请求、工具调用和模型响应。</text>
    例如：模型请求调用 `read_file`，Harness 执行后把结果返回给模型。
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <title size="md">2. Task Planner：任务规划器</title>
    <text color="secondary" size="sm">把用户目标拆成有依赖关系的步骤，并根据执行结果调整计划。</text>
    例如：先定位 Bug，再修改代码，然后运行测试。
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <title size="md">3. Harness Runtime：执行控制层</title>
    <text color="secondary" size="sm">管理状态、权限、预算、执行、验证、恢复和最终完成判定。</text>
    例如：测试通过了，但验收条件未满足，因此任务不能结束。
  </box>
</box>

三者之间的关系是：

**Planner 决定下一步要做什么，Agent Loop 负责与模型交互，Harness Runtime 决定这一步能否执行、执行后发生了什么，以及任务是否真的完成。**

注意，Planner 不一定是一个单独的大模型。它可以是模型生成的计划，也可以是确定性的调度器，或者两者结合。

---

## 三、把用户目标变成可执行计划

假设用户提出：

> 修复登录接口的空指针 Bug，增加回归测试，确保现有测试通过，不要修改无关模块。

如果直接把整段需求交给模型，让它自由调用工具，模型可能会：

- 过早修改代码；
- 忘记增加回归测试；
- 反复读取相同文件；
- 修改不相关模块；
- 测试失败后盲目重复运行；
- 最后仅凭自己的判断声称任务完成。

更稳妥的方式是先生成一个结构化任务计划。

### 1. 设计计划结构

一个实用的计划至少应该包含：

- 目标；
- 步骤；
- 步骤依赖；
- 完成条件；
- 允许的操作范围；
- 风险与限制；
- 预算；
- 验收标准。

例如：

<box border radius="xl" padding={3} gap={3}>
  <box gap={1}>
    <badge>Step 1</badge>
    **定位 Bug**

    读取登录接口、相关调用链和现有测试。

    <text color="secondary" size="sm">完成条件：找到可复现的错误路径和相关代码位置。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <badge>Step 2</badge>
    **增加回归测试**

    为已确认的错误场景编写测试。

    <text color="secondary" size="sm">依赖：Step 1。完成条件：测试能够覆盖目标错误场景。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <badge>Step 3</badge>
    **修改业务逻辑**

    以最小必要变更修复空指针问题。

    <text color="secondary" size="sm">依赖：Step 1、Step 2。完成条件：修复逻辑已写入工作区。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <badge>Step 4</badge>
    **执行测试与检查**

    运行目标测试、相关包测试和必要的静态检查。

    <text color="secondary" size="sm">完成条件：必需检查全部通过。</text>
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <badge>Step 5</badge>
    **最终验收**

    检查 Git diff，确认修改范围合理，回归测试存在且目标问题已得到处理。

    <text color="secondary" size="sm">完成条件：全部必需验收标准满足，且没有未处理的阻塞问题。</text>
  </box>
</box>

这里最关键的不是步骤有多少，而是**每一步都必须有明确的完成条件**。

“读取几个文件”是动作；“定位错误路径”才是目标。

“运行测试”是动作；“必需测试通过”才是验收条件。

如果只记录动作，不记录完成条件，Harness 就无法可靠地判断是否应该继续。

---

## 四、任务计划不是一份 Markdown 清单，而是一份可执行的数据结构

如果 Planner 只输出一段自然语言计划，Harness 很难判断哪些步骤已经完成、哪些步骤可以并行，以及失败后从哪里恢复。

因此，我们需要将计划转换为结构化数据。

### 1. 用 Go 定义 Plan、Step 和 Acceptance Criteria

建议新建 `internal/planner/types.go`：

```go
package planner

type StepStatus string

const (
    StepPending   StepStatus = "pending"
    StepReady     StepStatus = "ready"
    StepRunning   StepStatus = "running"
    StepSucceeded StepStatus = "succeeded"
    StepFailed    StepStatus = "failed"
    StepBlocked   StepStatus = "blocked"
    StepSkipped   StepStatus = "skipped"
)

type Step struct {
    ID          string     `json:"id"`
    Description string     `json:"description"`

    DependsOn []string `json:"depends_on"`

    Status StepStatus `json:"status"`

    // 这一步完成后应该满足的条件。
    SuccessCriteria []string `json:"success_criteria"`
}

type AcceptanceCriterion struct {
    ID          string `json:"id"`
    Description string `json:"description"`
    Required    bool   `json:"required"`
}

type Plan struct {
    TaskID string `json:"task_id"`

    Goal  string `json:"goal"`
    Steps []Step `json:"steps"`

    Acceptance []AcceptanceCriterion `json:"acceptance"`

    Revision int `json:"revision"`
}
```

举个例子，模型可以生成如下计划：

```json
{
  "task_id": "task-123",
  "goal": "修复登录接口空指针问题",
  "steps": [
    {
      "id": "inspect",
      "description": "检查登录接口及现有测试",
      "depends_on": [],
      "status": "pending",
      "success_criteria": [
        "确认出错路径",
        "定位相关代码"
      ]
    },
    {
      "id": "add_test",
      "description": "增加回归测试",
      "depends_on": ["inspect"],
      "status": "pending",
      "success_criteria": [
        "回归测试覆盖目标错误场景"
      ]
    },
    {
      "id": "fix",
      "description": "修复空指针问题",
      "depends_on": ["inspect", "add_test"],
      "status": "pending",
      "success_criteria": [
        "修复逻辑已经实现"
      ]
    }
  ],
  "acceptance": [
    {
      "id": "tests",
      "description": "必需测试全部通过",
      "required": true
    },
    {
      "id": "diff",
      "description": "变更范围符合用户要求",
      "required": true
    }
  ],
  "revision": 1
}
```

这里有三个工程细节。

**第一，计划中的状态不能完全相信模型。** 模型可以提出步骤和完成条件，但步骤状态应该由 Harness 根据实际执行结果更新。

**第二，计划需要验证。** 必须检查 Step ID 是否唯一、依赖是否存在、是否存在循环依赖，以及步骤和验收标准是否符合任务约束。

**第三，计划需要持久化。** 如果任务执行到第三步时服务器崩溃，恢复后应该加载之前的计划与执行状态，而不是毫无条件地重新开始。

### 2. 为什么需要 `Revision`？

假设第一版计划要求修改登录模块，但执行过程中发现 Bug 实际来自认证中间件。

这时 Planner 可能需要重新规划。

我们可以将新计划记为 `Revision = 2`，并保留旧计划的历史记录。这样在排查问题时，可以回答：

- 为什么原计划被修改？
- 哪些步骤已经执行？
- 哪些步骤因为新计划而被废弃？
- 新计划是否引入了额外权限需求？

重新规划不能直接清空所有历史状态。已经产生的副作用、审批记录和执行结果都必须保留。

---

## 五、依赖关系：为什么不能简单地按数组顺序执行？

假设计划里有三个步骤：

- A：读取 `auth.go`；
- B：读取 `auth_test.go`；
- C：根据 A 和 B 修改代码。

A 和 B 没有依赖关系，可以并行执行；C 必须等待两者完成。

如果只使用 `for` 循环按顺序执行，虽然简单，但可能浪费时间。

如果把所有步骤都并行执行，又可能导致 C 在 A、B 尚未完成时就开始修改。

因此，我们需要一个简单的依赖调度器。

<box border radius="lg" padding={3} gap={2} align="center">
  <box border radius="md" padding={3} width="55%" align="center">
    **A：读取业务代码**
  </box>
  <box border radius="md" padding={3} width="55%" align="center">
    **B：读取现有测试**
  </box>
  <icon name="arrow-down-up" color="secondary" />
  <box background="surface-secondary" radius="md" padding={3} width="70%" align="center">
    **C：修改代码**
    <text color="secondary" size="sm">等待 A、B 都成功</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="md" padding={3} width="70%" align="center">
    **D：运行测试**
    <text color="secondary" size="sm">等待 C 成功</text>
  </box>
</box>

可以使用如下规则判断步骤是否就绪：

- 步骤自身状态为 `pending`；
- 所有依赖步骤均为 `succeeded`；
- 任务没有被取消；
- 步骤尚未超过执行预算；
- 对应工具调用已经通过权限和审批检查。

### Go：计算就绪步骤

`internal/planner/scheduler.go`：

```go
package planner

import "fmt"

func ReadySteps(plan Plan) ([]Step, error) {
    byID := make(map[string]Step, len(plan.Steps))

    for _, step := range plan.Steps {
        if step.ID == "" {
            return nil, fmt.Errorf("step ID cannot be empty")
        }

        if _, exists := byID[step.ID]; exists {
            return nil, fmt.Errorf(
                "duplicate step ID: %s", step.ID,
            )
        }

        byID[step.ID] = step
    }

    // 先检查依赖引用是否有效。
    for _, step := range plan.Steps {
        for _, depID := range step.DependsOn {
            if _, exists := byID[depID]; !exists {
                return nil, fmt.Errorf(
                    "step %s depends on unknown step %s",
                    step.ID, depID,
                )
            }
        }
    }

    var ready []Step

    for _, step := range plan.Steps {
        if step.Status != StepPending {
            continue
        }

        allSucceeded := true

        for _, depID := range step.DependsOn {
            dep := byID[depID]

            if dep.Status != StepSucceeded {
                allSucceeded = false
                break
            }
        }

        if allSucceeded {
            ready = append(ready, step)
        }
    }

    return ready, nil
}
```

这个版本负责找出当前就绪的步骤，尚未检查循环依赖，也没有处理并发调度和持久化。完整实现需要在计划进入执行前完成 DAG 校验，并在调度过程中原子地认领步骤。

尤其要记住：**步骤依赖解决的是执行顺序，不等于资源冲突控制。**

即使 A、B 在计划上没有依赖，如果它们同时修改同一个文件，依然可能发生冲突。我们在第四课学过的资源锁、并发限制和读写冲突控制仍然需要保留。

---

## 六、真正的执行循环：Plan → Execute → Observe → Verify → Replan

这是第十二课的核心。

一个成熟的 Harness 不是让模型一直生成工具调用，直到它自己觉得满意，而是由 Harness 管理一个明确的循环。

<box border radius="xl" padding={3} align="center" gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **1. Plan**
    <text color="secondary" size="sm">生成或加载任务计划</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **2. Select**
    <text color="secondary" size="sm">选取就绪步骤，检查预算和权限</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **3. Execute**
    <text color="secondary" size="sm">调用模型和工具，保存执行状态</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **4. Observe**
    <text color="secondary" size="sm">收集结果、错误、日志和副作用信息</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **5. Verify**
    <text color="secondary" size="sm">验证步骤完成条件与实际状态</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **6. Decide**
    <text color="secondary" size="sm">继续、重试、重新规划、等待或终止</text>
  </box>
  <row align="center" gap={2}>
    <icon name="rotate-ccw" color="secondary" />
    <text color="secondary" size="sm">需要继续时，进入下一轮</text>
  </row>
</box>

这个循环有两个重要特点。

第一，模型只负责提出计划、工具调用和修复建议；Harness 负责检查是否满足执行条件。

第二，每一轮都必须有明确的结果。不能因为模型返回了自然语言，就默认当前步骤已经完成。

### 1. 定义运行决策

我们可以把每轮执行后的下一步动作统一为几种类型：

```go
type NextAction string

const (
    ActionContinue   NextAction = "continue"
    ActionRetry      NextAction = "retry"
    ActionReplan     NextAction = "replan"
    ActionWait       NextAction = "wait"
    ActionComplete   NextAction = "complete"
    ActionFail       NextAction = "fail"
    ActionCancel     NextAction = "cancel"
)
```

每种动作的含义不同：

| 动作 | 触发条件示例 |
|---|---|
| `continue` | 当前步骤完成，后续有就绪步骤 |
| `retry` | 可恢复错误，且满足重试条件 |
| `replan` | 当前计划不可行，需要重新组织步骤 |
| `wait` | 等待用户输入、人工审批或外部任务 |
| `complete` | 所有必需验收条件已通过 |
| `fail` | 任务无法继续，或已耗尽允许的恢复方式 |
| `cancel` | 用户或上层控制器明确取消任务 |

特别注意：`complete` 不能由模型自由决定。

模型可以说“我认为任务已经完成”，但 Harness 必须独立检查任务状态、验收结果和未完成的副作用。

### 2. 什么时候应该 Replan？

重新规划不是“模型失败了就重新生成一份计划”。

适合重新规划的情况包括：

- 原计划依赖的文件或资源不存在；
- 发现 Bug 来源与最初假设不同；
- 某一步无法满足验收标准；
- 工具返回了足以改变下一步方案的新信息；
- 原计划与实际权限或资源约束冲突。

不适合重新规划的情况包括：

- 一个确定的权限拒绝；
- 单纯的瞬时网络故障；
- 仍处于运行中的远程任务；
- 操作结果未知，但尚未进行对账；
- 因预算耗尽而无法继续的任务。

这些情况需要分别走权限处理、重试、状态查询或终止流程。否则，模型可能通过不断重新规划，间接绕过限制。

---

## 七、如何在 Go 中组织 Harness Runner？

我们不需要在这一课一次性实现所有数据库、模型适配器和工具执行器。先把核心职责划分清楚。

建议建立 `internal/runtime/runner.go`：

```go
package runtime

import (
    "context"
    "errors"
)

var (
    ErrBudgetExhausted = errors.New("task budget exhausted")
    ErrTaskNotReady    = errors.New("task is not ready")
)

type TaskStatus string

const (
    TaskQueued             TaskStatus = "queued"
    TaskRunning            TaskStatus = "running"
    TaskWaitingApproval    TaskStatus = "waiting_for_approval"
    TaskWaitingInput       TaskStatus = "waiting_for_input"
    TaskVerifying          TaskStatus = "verifying"
    TaskCompleted          TaskStatus = "completed"
    TaskFailed             TaskStatus = "failed"
    TaskCancelled          TaskStatus = "cancelled"
)

type Task struct {
    ID     string
    Status TaskStatus
}

type Budget struct {
    MaxModelCalls int
    MaxToolCalls  int
    MaxReplans    int

    ModelCalls int
    ToolCalls  int
    Replans    int
}

func (b *Budget) CanCallModel() bool {
    return b.ModelCalls < b.MaxModelCalls
}

func (b *Budget) CanCallTool() bool {
    return b.ToolCalls < b.MaxToolCalls
}

func (b *Budget) CanReplan() bool {
    return b.Replans < b.MaxReplans
}

type Store interface {
    SaveTask(context.Context, Task) error
}

type Runner struct {
    Store Store
}

func (r *Runner) Run(
    ctx context.Context,
    task Task,
    budget Budget,
) error {
    if err := ctx.Err(); err != nil {
        return err
    }

    if !budget.CanCallModel() {
        return ErrBudgetExhausted
    }

    task.Status = TaskRunning

    if err := r.Store.SaveTask(ctx, task); err != nil {
        return err
    }

    // 实际项目在这里执行一个完整的 Runtime Tick：
    // 1. 加载计划与当前步骤
    // 2. 选择下一步动作
    // 3. 调用模型或工具
    // 4. 记录结果
    // 5. 验证后置条件
    // 6. 决定下一轮动作

    return nil
}
```

这是一个接口骨架，而不是完整的生产 Runner。它有意不把模型调用、工具执行和验收逻辑塞进一个大函数里。

真实项目还需要注意：

- 预算计数应持久化，不能仅保存在内存变量中。
- `Run` 被调用不代表可以直接将任务状态从任意状态改成 `running`。
- 多个 Worker 需要通过租约、版本号或原子状态更新争夺任务执行权。
- 任务取消后，必须停止后续调度并处理正在执行的工具。
- 数据库写入失败时，需要明确当前执行阶段和恢复策略。

### 一个更适合生产的拆分方式

```text
Runtime
├── Planner
│   └── 生成和更新 Plan
├── Scheduler
│   └── 选择就绪步骤
├── AgentLoop
│   └── 模型交互和 Tool Call
├── ToolRuntime
│   └── 参数校验、权限、执行、结果归一化
├── Verifier
│   └── 步骤验证与任务验收
├── BudgetManager
│   └── 限制调用次数、时间和资源
└── TaskStore
    └── 持久化状态、事件和恢复信息
```

这种拆分有一个实际好处：你可以独立测试 Planner 是否生成合理计划，测试 Scheduler 是否正确处理依赖，也可以测试 Verifier 是否会拒绝错误的完成声明，而不必每次都启动完整的大模型调用链。

---

## 八、完成判定：Harness 最重要的一道闸门

前面所有内容最终都汇聚到一个问题：

**什么时候，Harness 才有资格把任务标记为 `completed`？**

不能只看以下任一条件：

- 模型返回了最终文本；
- 没有待执行的工具调用；
- 所有工具都返回了成功；
- 测试命令退出码为零；
- 模型自己声称目标已经实现。

这些信号都可能有用，但任何一个都不足以单独证明任务完成。

### 1. 设计 Completion Gate

可以将完成判定独立成一个模块。

`internal/verification/completion.go`：

```go
package verification

type CriterionStatus string

const (
    CriterionPassed  CriterionStatus = "passed"
    CriterionFailed  CriterionStatus = "failed"
    CriterionSkipped CriterionStatus = "skipped"
    CriterionUnknown CriterionStatus = "unknown"
)

type CriterionResult struct {
    ID       string
    Required bool
    Status   CriterionStatus
    Evidence []string
}

type CompletionReport struct {
    Results []CriterionResult
}

func (r CompletionReport) CanComplete() bool {
    for _, result := range r.Results {
        if !result.Required {
            continue
        }

        if result.Status != CriterionPassed {
            return false
        }
    }

    return true
}
```

这个实现刻意采用严格的规则：所有必需验收项都必须通过，才能满足完成判定。

`Evidence` 用来记录证据的引用，例如测试运行记录、Git diff、远程 API 查询结果或文件检查记录。生产系统应该保存可追溯的证据标识，而不是只保存一句“测试通过”。

但还需要注意一个细节：如果验收列表为空，这个函数会返回 `true`。在真正的 Harness 中，应该在验证计划阶段拒绝缺少必要验收标准的任务，或者要求显式定义哪些类型的任务允许不设置验收项。

### 2. 一个完整的完成条件

对于代码修改任务，Harness 可以检查：

<box border radius="lg" padding={3} gap={2}>
  {@body const completionChecks = [
    "所有必需步骤均已完成，或被明确且合法地跳过",
    "所有必需验收标准均已通过",
    "没有仍在运行的工具调用或未处理的副作用",
    "没有待处理的权限审批或必要用户输入",
    "Git diff 和修改范围已经过检查",
    "结果、证据和最终状态已经持久化"
  ]}
  {@body const [completionDone, setCompletionDone] = DIL.useState([])}
  <row align="center" justify="between">
    **Completion Gate 检查项**
    <text color="secondary" size="sm">{completionDone.length}/{completionChecks.length}</text>
  </row>
  {#each completionChecks as item, i}
    <checkbox key={item} checked={completionDone.includes(i)} onChange={v => setCompletionDone(old => v ? [...old, i] : old.filter(n => n !== i))}>{item}</checkbox>
  {/each}
</box>

这不是说所有类型的任务都必须执行完全相同的检查。例如，纯问答任务通常不需要 Git diff。但对于有副作用、需要验证的任务，Completion Gate 必须依据任务类型应用对应的规则。

另外，`completed`、`failed` 和 `cancelled` 应该是不同的终态。任务失败不代表没有副作用；任务取消也不代表后台操作已经停止。

### 3. 为什么最终状态必须与结果证据一起保存？

想象这样的时间线：

1. 所有测试通过。
2. Harness 决定任务已经完成。
3. 服务器在保存最终状态前崩溃。
4. 任务恢复后，又执行了一遍部署操作。

这实际上是状态持久化与外部副作用之间的一致性问题。

建议在同一个数据库事务中，尽可能一起保存：

- 最终验收报告；
- 相关证据引用；
- 任务终态；
- 完成事件。

如果外部操作无法纳入同一个事务，就需要借助幂等键、外部状态查询和对账机制来恢复，而不能假设数据库事务能够回滚远程部署或文件系统修改。

---

## 九、预算管理：防止 Agent 无限循环

如果 Harness 可以反复调用模型、重新规划、重试工具，那么即使逻辑正确，也可能因为循环而持续消耗资源。

例如：

```text
模型生成计划
  ↓
调用工具失败
  ↓
重新规划
  ↓
再次调用工具失败
  ↓
再次重新规划
  ↓
……
```

因此，需要一个独立的 Budget Manager。

### 1. 至少限制四种预算

| 预算 | 控制什么 |
|---|---|
| 模型调用预算 | 避免模型调用无限增长 |
| 工具调用预算 | 避免工具不断重复执行 |
| 重规划预算 | 避免 Planner 在类似方案之间反复切换 |
| 时间预算 | 保证任务在截止时间前停止或进入可恢复状态 |

生产环境还可以限制 Token 消耗、总费用、并发数、工具输出大小和累计执行时间。

这些预算应由 Harness 维护，而不是由模型自己汇报。

### 2. 不要只设置最大循环次数

假设你设置了 `MaxSteps = 30`。

这能避免无限循环，但不能解决所有问题：

- 30 次工具调用可能只需要几秒，也可能运行数小时。
- 单次工具调用可能消耗大量内存。
- 一个工具调用可能触发昂贵的外部副作用。
- 任务即使还剩很多预算，也可能已经遇到不可恢复错误。

因此，预算应该组合使用，并在调用发生前检查是否还有足够的预算。

例如：

```go
type BudgetLimits struct {
    MaxModelCalls int
    MaxToolCalls  int
    MaxReplans    int
    Deadline      time.Time
}

type BudgetUsage struct {
    ModelCalls int
    ToolCalls  int
    Replans    int
}
```

实际使用时还要注意：`Deadline` 必须与执行上下文和持久化的任务截止时间一致；仅设置一个时间字段不会自动终止运行中的工具。

**预算耗尽时，正确的行为是停止新的执行动作，并将任务进入可解释的终态或等待状态。** 不能为了让模型“再试一次”而悄悄重置预算。

如果预算耗尽时仍有远程操作处于 `unknown` 状态，应保留这个不确定状态并进行必要的对账，而不是把它伪装成普通失败。

---

## 十、第十二课的最终架构：把所有模块串起来

现在我们可以画出一个完整的任务执行架构。

<box border radius="xl" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **Task Intake**
    <text color="secondary" size="sm">目标、约束、用户权限、截止时间</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **Planner + Plan Validator**
    <text color="secondary" size="sm">计划生成、依赖校验、验收标准</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **Scheduler + Budget Manager**
    <text color="secondary" size="sm">就绪步骤、并发控制、预算检查</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **Agent Loop + Tool Runtime**
    <text color="secondary" size="sm">模型交互、权限审批、Sandbox 执行</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **Result Processing + Verifier**
    <text color="secondary" size="sm">结果归一化、后置条件、验收检查</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **State Store + Event Log**
    <text color="secondary" size="sm">执行记录、恢复信息、验收证据</text>
  </box>
  <row align="center" gap={2}>
    <icon name="rotate-ccw" color="secondary" />
    <text color="secondary" size="sm">未完成则根据决策进入下一轮</text>
  </row>
  <divider color="subtle" />
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **Completion Gate**
    <text color="secondary" size="sm">验收全部满足后，才允许标记为 completed</text>
  </box>
</box>

这个架构有一个非常重要的性质：**每一轮执行都可以被解释、验证和恢复。**

当任务失败时，你应该能够查到：

- 当前执行到哪个步骤；
- 为什么选中了这个工具；
- 权限检查的结果是什么；
- 工具究竟执行成功、失败还是结果未知；
- 哪些验收条件已经通过；
- 为什么 Harness 决定继续、重试、重新规划或终止。

这才是我们希望通过 Harness Engineering 建立的能力，而不只是一个能够不断调用工具的模型循环。

## 十一、本课总结

今天的重点可以浓缩为四条规则：

1. **计划必须结构化。** 步骤、依赖和完成条件都应该可验证、可持久化。
2. **执行循环必须由 Harness 控制。** 模型可以建议下一步，但不能绕过权限、预算和状态约束。
3. **完成必须有证据。** 工具成功和模型自述都不是任务完成的充分条件。
4. **终止也必须可靠。** 预算耗尽、取消、失败和完成是不同状态；外部副作用需要独立处理。

接下来，你可以开始把这些模块实现为一个最小的 Go Harness Runtime，而不必急着追求复杂的多 Agent 协作。

---

## 第十二课小测

假设你的 Coding Harness 正在执行一个任务：

- 计划包含修改代码、运行测试和检查 Git diff 三个步骤。
- 修改代码和运行测试已经完成。
- 测试全部通过。
- 但最后的 Git diff 检查发现，Agent 修改了用户明确要求不要碰的配置文件。
- 模型此时返回：“任务完成，所有测试通过。”

Harness 应该采取哪种处理方式？

{@body const [answer, setAnswer] = DIL.useState("")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={3} gap={3}>
  <radio-group value={answer} onChange={v => {setAnswer(v); setSubmitted(false)}} direction="col">
    <radio value="A">A. 测试通过就可以结束任务，因为 Git diff 检查只是辅助信息。</radio>
    <radio value="B">B. 接受模型的完成声明，并将 Git diff 检查记录为警告。</radio>
    <radio value="C">C. 阻止任务进入 completed，记录验收失败，将具体的变更范围问题反馈给 Agent 修复；修复后重新执行必要的验证。</radio>
    <radio value="D">D. 自动重置整个仓库，再从第一步重新运行所有操作。</radio>
  </radio-group>
  <button block disabled={!answer} onClick={() => {setSubmitted(true); GenUI.issueNewTurn("Harness 第十二课小测，我选择 "+answer+"。请批改答案，并继续下一课。")}}>提交答案并继续下一课</button>
  {#if submitted}
    <text color="secondary" size="sm">已提交，接下来将批改答案并继续课程。</text>
  {/if}
</box>

下一课我们可以进入 **第十三课：Harness 的状态机、事件驱动架构与并发调度**，把前面学过的任务恢复、审批等待、工具执行、预算和完成判定统一到一个可靠的状态机中，并进一步讨论多个 Worker 如何安全地执行同一任务队列。
