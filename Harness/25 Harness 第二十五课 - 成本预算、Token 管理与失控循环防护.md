---
title: "Harness 第二十五课 - 成本预算、Token 管理与失控循环防护"
aliases:
  - "Harness 第二十五课 - 成本预算、Token 管理与失控循环防护"
tags:
  - harness
  - ai-agent
  - verbatim
  - cost-control
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "b1fc22b9-5871-4532-99e7-f2e45c9134f8"
source_user_message_id: "014b0829-7c64-49c1-ad9f-42ab4ec47f96"
source_content_sha256: "94a58aaa031fdd782068b265d98641ed9e76323cc007a59a076549511c5d856a"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：25  
> 原始章节：Harness 第二十五课：成本预算、Token 管理与失控循环防护  
> 合并消息 ID：`b1fc22b9-5871-4532-99e7-f2e45c9134f8`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一课
> ~~~

返回：[[Harness 知识地图]]

---

继续！上一课我们学习了 Harness 的生产部署、健康检查、优雅关闭和任务恢复。

今天进入第二十五课。这一课非常重要，因为一个 Coding Harness 即使功能完善、工具齐全、能够自动修改代码，也可能出现一个现实问题：**任务一直在执行，模型一直在调用，Token 和 API 费用不断增加，但问题始终没有解决。**

# Harness 第二十五课：成本预算、Token 管理与失控循环防护

## 一、为什么 Agent 会陷入失控循环？

假设你给 Coding Harness 一个任务：

> 修复用户模块的单元测试。

Agent 开始执行：

```text
第 1 轮：读取代码
    ↓
第 2 轮：分析错误
    ↓
第 3 轮：修改代码
    ↓
第 4 轮：运行测试，失败
    ↓
第 5 轮：继续修改
    ↓
第 6 轮：运行测试，仍然失败
    ↓
第 7 轮：再次修改
    ↓
第 8 轮：重复运行测试……
```

问题在于，Agent 可能一直重复相似的操作。

例如：

- 每一轮都读取大量相同的文件。
- 连续修改同一个函数，却没有新的诊断证据。
- 测试失败后，模型反复尝试类似的修复方案。
- 工具返回错误后，模型没有改变策略，只是再次调用工具。
- 任务目标不明确，模型不断扩大修改范围。

如果 Harness 没有执行预算和终止条件，这个循环就可能持续很长时间。

因此，我们首先需要明确一个原则：

**模型负责提出下一步行动，Harness 负责决定这个行动是否还值得执行。**

不能把任务是否结束完全交给模型自行判断。

---

## 二、预算不是一个数字，而是多个维度

很多初学者会给 Agent 设置一个 `maxSteps = 50`，认为这样就解决了失控问题。

实际上，Step 数量只是预算的一部分。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="coins" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **1. 金钱预算**

      <text color="secondary" size="sm">限制任务最大 API 成本。</text>

      例如：单个任务最多允许消耗 2 美元。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="cpu" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **2. Token 预算**

      <text color="secondary" size="sm">限制输入、输出及推理 Token 的累计消耗。</text>

      例如：累计输入 Token 不超过 200,000，输出 Token 不超过 30,000。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="repeat" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **3. 执行预算**

      <text color="secondary" size="sm">限制模型调用、工具调用和修复次数。</text>

      例如：最多 40 次模型请求、100 次工具调用、5 轮修复。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="clock" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **4. 时间预算**

      <text color="secondary" size="sm">限制任务、单次模型调用和单个工具的执行时间。</text>

      例如：任务最长 20 分钟，单个工具最多执行 60 秒。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={2}>
      <icon name="git-compare" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **5. 进展预算**

      <text color="secondary" size="sm">检测执行了很多步骤却没有取得实质进展的情况。</text>

      例如：连续 3 次修复后，测试失败类型和关键错误证据都没有改善，则暂停并重新规划。
    </box>
  </row>
</box>

这些预算应当同时存在，因为它们解决的是不同的问题。

一个任务可能只执行了 3 次模型调用，但每次都使用超长上下文，成本仍然很高。另一个任务可能 Token 消耗很少，却陷入大量快速失败的工具调用，浪费执行资源。

---

## 三、Token 成本是怎样计算的？

通常可以使用下面的近似公式估算模型调用成本：

\[
C=\frac{T_{\text{in}}P_{\text{in}}+T_{\text{out}}P_{\text{out}}}{10^6}
\]

其中：

- \(T_{\text{in}}\)：计费输入 Token 数量。
- \(T_{\text{out}}\)：计费输出 Token 数量。
- \(P_{\text{in}}\)：每百万输入 Token 的价格。
- \(P_{\text{out}}\)：每百万输出 Token 的价格。

注意：这里的价格仅用于演示，真实计费还可能涉及缓存 Token、推理 Token、不同模型的计费规则以及供应商的特殊条款。

### 动手算一笔账

假设某个任务：

- 输入 Token：200,000。
- 输出 Token：30,000。
- 输入价格：每百万 Token 2 美元。
- 输出价格：每百万 Token 8 美元。

那么：

\[
C=\frac{200000\times2+30000\times8}{1000000}
\]

\[
C=0.40+0.24=0.64\text{ 美元}
\]

也就是说，这个任务的估算费用是 0.64 美元。

如果任务不断重试 20 次，而每次调用的上下文都接近这个规模，费用就可能迅速累积。

还有一个容易忽略的地方：**不能简单地把模型每次请求的输入 Token 只计算新增消息。**

如果每轮请求都重新发送对话历史，那么前面已经出现过的内容可能再次计入输入 Token。即使没有新增太多文本，输入成本也可能持续增加。

---

## 四、建立真正可执行的 Budget Manager

现在进入 Harness 的工程设计。

不要让模型自己维护一个预算变量，例如：

```text
我已经调用了 20 次工具，应该差不多了。
```

这种信息不可靠，因为模型可能遗漏调用、错误估算成本，甚至在上下文压缩后丢失之前的统计。

预算必须由 Harness 自己维护。

### 1. 定义预算结构

下面是一个 Go 示例：

```go
package budget

import (
	"errors"
	"sync"
	"time"
)

var ErrBudgetExceeded = errors.New("task budget exceeded")

type Limits struct {
	MaxCostUSD     float64
	MaxInputTokens int64
	MaxOutputTokens int64
	MaxModelCalls  int64
	MaxToolCalls   int64
	MaxDuration    time.Duration
}

type Usage struct {
	CostUSD      float64
	InputTokens  int64
	OutputTokens int64
	ModelCalls   int64
	ToolCalls    int64
}

type Manager struct {
	mu        sync.Mutex
	limits    Limits
	usage     Usage
	startedAt time.Time
}

func NewManager(limits Limits) *Manager {
	return &Manager{
		limits:    limits,
		startedAt: time.Now(),
	}
}
```

这里将预算上限和实际使用量分开：

- `Limits`：允许消耗多少资源。
- `Usage`：实际消耗了多少资源。
- `startedAt`：用于计算任务运行时间。

生产环境还应该持久化使用量，防止进程重启后预算归零。

### 2. 在执行前检查预算

继续增加一个检查方法：

```go
func (m *Manager) Check() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.usage.CostUSD >= m.limits.MaxCostUSD {
		return ErrBudgetExceeded
	}

	if m.usage.InputTokens >= m.limits.MaxInputTokens {
		return ErrBudgetExceeded
	}

	if m.usage.OutputTokens >= m.limits.MaxOutputTokens {
		return ErrBudgetExceeded
	}

	if m.usage.ModelCalls >= m.limits.MaxModelCalls {
		return ErrBudgetExceeded
	}

	if m.usage.ToolCalls >= m.limits.MaxToolCalls {
		return ErrBudgetExceeded
	}

	if time.Since(m.startedAt) >= m.limits.MaxDuration {
		return ErrBudgetExceeded
	}

	return nil
}
```

在调用模型或工具之前：

```go
if err := budgetManager.Check(); err != nil {
	return err
}

result, err := toolExecutor.Execute(ctx, call)
```

这里的 `toolExecutor.Execute` 代表你自己的工具执行器，需要在实际项目中实现。

这个版本演示了基本思想，但有两个重要缺陷：

1. `Check()` 和后续执行之间不是原子操作，并发任务可能同时通过检查。
2. 这里只判断当前用量，没有为即将发起的请求预留预算。

因此，真实的 Budget Manager 应提供原子化的 `Reserve`、`Commit` 和 `Release` 等操作。

---

## 五、为什么必须预留预算？

假设任务剩余预算只有 0.10 美元。

现在两个 Worker 同时准备调用模型，每个请求预计需要 0.08 美元。

如果它们都先检查当前余额：

```text
Worker A：余额 0.10，允许执行
Worker B：余额 0.10，允许执行
```

两个请求都启动之后，实际总费用可能达到 0.16 美元，超过了预算。

这就是典型的并发竞态。

正确做法是先预留预算：

```text
可用预算：0.10 美元
       ↓
Worker A 预留 0.08 美元
       ↓
剩余预算：0.02 美元
       ↓
Worker B 申请 0.08 美元
       ↓
拒绝或等待
```

可以抽象成下面的接口：

```go
type Reservation interface {
	Commit(actualCost float64) error
	Release() error
}

type BudgetStore interface {
	Reserve(
		taskID string,
		estimatedCost float64,
	) (Reservation, error)
}
```

这个接口只展示设计方向。真正的实现需要考虑：

- 预留金额的原子扣减。
- 预留记录的持久化。
- 请求失败时是否释放预算。
- 请求超时但供应商可能已经计费时如何处理。
- 实际成本超过预留金额时如何记账。
- 多 Worker 同时修改预算时如何保证一致性。

特别是模型 API 请求：如果网络超时，客户端不一定知道供应商是否已经处理并计费。因此，预算系统应该允许成本暂时处于待确认状态，而不是直接假定这笔费用为零。

**预算预留可以降低超支风险，但无法保证第三方 API 的最终账单绝对不超过预算。** 如果必须严格控制成本，还需要结合供应商侧额度限制、请求并发限制以及任务停止策略。

---

## 六、如何识别 Agent 陷入循环？

预算限制只能防止任务无限消耗资源，却不一定能让 Agent 更聪明。

我们还需要检测执行是否真正取得进展。

例如，模型连续执行了三轮：

```text
第 1 轮：修改 service.go，测试失败
第 2 轮：再次修改 service.go，测试失败
第 3 轮：再次修改 service.go，测试失败
```

这三轮都消耗了预算，但可能没有解决任何问题。

### 1. 不要只比较模型输出文本

下面这种检测方式不可靠：

```go
if previousResponse == currentResponse {
	// 判断为循环
}
```

因为模型可能每次说法不同，但执行的操作完全一样。

反过来，模型也可能连续两次给出相同的解释，却分别执行了合理的不同操作。

更可靠的方式是记录执行证据。

例如：

```go
type ProgressSnapshot struct {
	GitDiffHash       string
	FailingTestsHash  string
	RemainingFailures int
	NewEvidenceCount  int
	PlanRevision      int
}
```

这些字段用于描述任务在某个检查点的状态。

比较相邻检查点时，可以关注：

- 代码变更是否发生。
- 测试失败是否减少。
- 是否获得了新的诊断证据。
- 当前计划是否发生了有意义的调整。
- 同一个错误是否在反复出现。

注意，Git Diff 发生变化不一定代表取得进展；模型也可能只是不断修改代码，却让问题越来越严重。

### 2. 建立进展判定策略

可以设计以下规则：

| 情况 | 建议动作 |
|---|---|
| 测试通过，验收条件满足 | 进入最终验收 |
| 测试失败，但出现新错误证据 | 允许继续修复 |
| 连续多轮相同错误，无新证据 | 暂停并重新规划 |
| 多次修复导致测试结果恶化 | 回滚当前尝试或恢复检查点 |
| 达到工具调用上限 | 停止继续调用工具 |
| 达到成本预算 | 阻止新的计费请求 |
| 结果未知且存在外部副作用 | 先对账，不盲目重试 |

这些规则应该由 Harness 的策略层执行，而不是完全交给模型决定。

### 3. Go 中的简单循环检测示例

```go
type ProgressGuard struct {
	lastSignature string
	stagnantCount int
	maxStagnant   int
}

func NewProgressGuard(maxStagnant int) *ProgressGuard {
	return &ProgressGuard{
		maxStagnant: maxStagnant,
	}
}

func (g *ProgressGuard) Observe(signature string) bool {
	if signature == g.lastSignature {
		g.stagnantCount++
	} else {
		g.stagnantCount = 0
		g.lastSignature = signature
	}

	return g.stagnantCount >= g.maxStagnant
}
```

这里的 `signature` 应该由 Harness 根据测试失败摘要、关键状态和执行证据生成，而不是直接使用模型回复文本。

这只是一个简单的连续重复检测器。真实系统还应记录历史快照，并结合错误类型、计划变化、修复次数和任务验收状态判断，避免把正常的重复验证误判为失控循环。

---

## 七、预算耗尽后，Harness 应该怎么办？

这是设计中最容易出错的地方。

假设任务已经消耗了全部预算，但还有一个模型请求正在执行。

此时不能只把任务标记为 `failed`，然后忽略正在执行的请求。

更合理的处理流程是：

```text
预算即将耗尽
      ↓
拒绝新的模型 / 工具调用
      ↓
处理正在执行的操作
      ↓
持久化当前任务状态
      ↓
检查是否存在未知副作用
      ↓
生成任务摘要与停止原因
      ↓
等待用户批准增加预算，或结束任务
```

建议区分几种状态：

- `budget_exhausted`：预算已经耗尽。
- `awaiting_budget_approval`：等待用户批准增加预算。
- `paused_no_progress`：由于缺乏进展而暂停。
- `cancelled`：任务被明确取消。
- `failed`：任务因不可恢复的错误而失败。

这些状态不应该混为一谈。

预算耗尽并不一定代表任务本身失败，也不意味着代码已经可以交付。Harness 应保存当前进度、已修改文件、测试结果和剩余问题，让后续恢复有可靠依据。

---

## 八、把成本、进展和验收整合进 Agent Loop

现在将前面的机制整合到执行循环中。

```text
读取任务状态
      ↓
检查时间、成本和调用预算
      ↓
检查是否取得实质进展
      ↓
选择下一步行动
      ↓
验证工具权限与参数
      ↓
预留资源预算
      ↓
执行模型 / 工具调用
      ↓
记录结果与实际成本
      ↓
持久化状态和执行证据
      ↓
检查验收条件
      │
      ├── 已完成 → 最终验收
      │
      ├── 可继续 → 下一轮
      │
      ├── 无进展 → 重新规划或暂停
      │
      └── 预算耗尽 → 安全停止
```

注意，这里的顺序是一种概念性设计。实际实现中，模型调用和工具调用需要分别处理预算预留、取消、未知结果和资源释放。

尤其要保证：**模型可以建议继续执行，但它不能绕过 Harness 的预算和权限检查。**

---

## 九、生产级成本管理还需要哪些能力？

除了单个任务的预算，还可以建立更完整的成本控制体系。

| 层级 | 控制目标 |
|---|---|
| 单次请求 | 最大输入、输出 Token，单次超时 |
| 单个工具调用 | 最大执行时间、输出字节数、重试次数 |
| 单个任务 | 总成本、总 Token、调用次数、时间上限 |
| 单个用户 | 每日额度、并发任务数、使用速率 |
| 整个系统 | 总预算、供应商速率限制、全局熔断 |
| 模型路由 | 根据任务难度选择合适的模型和上下文规模 |

例如，一个简单的代码搜索任务，没必要默认使用最昂贵的模型；但涉及复杂架构变更时，也不能为了省钱而让低能力模型无限尝试。

模型路由可以综合考虑：

- 任务类型与难度。
- 预期输出规模。
- 历史成功率。
- 延迟要求。
- 当前剩余预算。
- 工具调用能力和上下文窗口。

不过，切换模型时必须保证任务状态、未完成工具调用和代码修改记录能够正确衔接。不能因为预算不足就随意切换模型，然后忽略之前未完成的副作用。

---

## 十、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  你的 Coding Harness 正在修复一个 Bug。连续三轮修改后，同一个测试仍然失败，而且没有获得新的诊断证据。与此同时，任务已经接近成本上限。

  最合理的处理方式是什么？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 继续调用模型，直到模型主动表示任务完成。</radio>
    <radio value="B">B. 阻止新的调用，保存当前状态和执行证据，判断是否需要重新规划，并按预算策略暂停或请求批准。</radio>
    <radio value="C">C. 清空历史记录，重新开始任务，这样就能避免成本继续增加。</radio>
    <radio value="D">D. 自动切换到另一个模型，不需要保存之前的执行状态。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！Harness 应同时检查预算与执行进展。连续无进展时需要暂停或重新规划，并保存可靠状态，不能让模型无限重试，也不能在恢复时丢失之前的执行记录。
      {:else}
        关键是让 Harness 控制预算、进展和任务状态。清空历史或直接切换模型，都可能丢失重要证据，甚至重复执行已有副作用。
      {/if}
    </box>
  {/if}
</box>

## 本课总结

今天需要真正掌握的有六点：

1. **多维预算**：成本、Token、时间、调用次数和进展都要管理。
2. **预算预留**：并发 Worker 必须协调预算，避免同时通过检查导致超支。
3. **进展检测**：通过测试结果、错误证据、代码变更和计划变化判断是否陷入循环。
4. **安全停止**：预算耗尽时阻止新调用，并妥善处理正在执行的操作。
5. **状态保留**：暂停、恢复和切换模型都不能丢失任务状态及副作用记录。
6. **独立验收**：即使模型宣布完成，也必须通过 Harness 的验收机制确认任务是否真正完成。

下一课是第二十六课：**Harness 的端到端测试、故障注入与可靠性评估**。我们将学习如何主动模拟模型超时、工具崩溃、数据库故障、Worker 重启和重复执行，验证 Harness 在异常情况下是否仍能安全运行。

---

If you want, I can:

- 继续讲解Worker安全停止的实现细节
- 扩展生产环境部署的安全隔离策略
- 分享生产环境配置管理的动态更新方案
