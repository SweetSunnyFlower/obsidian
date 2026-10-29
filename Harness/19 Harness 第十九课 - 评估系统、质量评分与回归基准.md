---
title: "Harness 第十九课 - 评估系统、质量评分与回归基准"
aliases:
  - "Harness 第十九课 - 评估系统、质量评分与回归基准"
tags:
  - harness
  - ai-agent
  - verbatim
  - evaluation
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "107cbd65-bb81-4974-a2b7-9e3398ce7203"
source_user_message_id: "96f527fc-0726-40f5-8c93-1ed33839461f"
source_content_sha256: "97d80d187617add8746e9946f30199a3937a8ff352946f75cbe86cb39659de33"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：19  
> 原始章节：Harness 第十九课：评估系统、质量评分与回归基准  
> 合并消息 ID：`107cbd65-bb81-4974-a2b7-9e3398ce7203`  
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

继续！第十八课的小测正确答案是 **B**：索引属于派生数据，可能落后于真实工作区，Harness 必须检查数据新鲜度，必要时更新索引或直接读取当前文件。

今天进入第十九课。我们开始解决一个更深层的问题：**怎么证明自己开发的 Coding Harness 真的可靠，而不是偶尔碰巧把任务做对了？**

# Harness 第十九课：评估系统、质量评分与回归基准

## 一、为什么 Agent 不能只用“任务成功率”来评价？

假设你开发了一个 Coding Harness，让它修复 100 个 Bug。

最后有 80 个任务通过测试，你认为成功率是 80%。

听起来不错，但我们再看几种情况：

- 10 个任务通过删除测试断言才变成绿色。
- 5 个任务修改了用户不允许修改的配置文件。
- 3 个任务虽然测试通过，却破坏了其他功能。
- 2 个任务报告修复成功，实际上没有运行测试。

那么，真正可靠地完成任务的可能只有 60 个。

这说明：

**测试通过率、模型回答质量、工具执行成功率和任务完成率，是不同的指标。**

一个成熟的 Harness 必须建立独立的评估系统，而不能仅依赖 Agent 自己报告的结果。

## 二、建立五层评估体系

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="42px" align="center" justify="center">
      <icon name="check-circle" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第一层：任务正确性**

      <text color="secondary" size="sm">Bug 是否真正修复？功能是否符合需求？独立验收测试是否通过？</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="42px" align="center" justify="center">
      <icon name="shield-check" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第二层：安全性与约束遵守**

      <text color="secondary" size="sm">有没有越权操作、修改禁止文件、泄露密钥或删除测试？</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="42px" align="center" justify="center">
      <icon name="wrench" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第三层：执行可靠性**

      <text color="secondary" size="sm">任务恢复是否正常？重试是否安全？工具调用结果是否正确持久化？</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="42px" align="center" justify="center">
      <icon name="gauge" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第四层：成本与效率**

      <text color="secondary" size="sm">消耗多少 Token、调用多少工具、耗时多久、需要多少次重试？</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="42px" align="center" justify="center">
      <icon name="chart-no-axes-combined" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第五层：稳定性与可复现性**

      <text color="secondary" size="sm">相同任务重复执行时，结果是否稳定？升级模型或 Harness 后是否出现回归？</text>
    </box>
  </row>
</box>

这五层共同决定 Harness 的实际质量。单一的成功率指标无法覆盖它们。

## 三、如何设计一套真正有效的 Benchmark？

Benchmark（基准测试）不是随便收集几个问题，然后让 Agent 做一遍。

一个有价值的 Coding Benchmark，至少需要定义以下内容：

| 字段 | 作用 |
|---|---|
| `task_id` | 唯一标识任务 |
| `repository` | 被测试的代码仓库 |
| `base_commit` | 固定的初始代码版本 |
| `task_description` | 任务要求 |
| `acceptance_tests` | 独立验收测试 |
| `forbidden_paths` | 禁止修改的路径 |
| `timeout` | 任务时间上限 |
| `budget` | Token、工具调用或费用预算 |
| `expected_outcome` | 预期结果与判定规则 |

例如，你可以建立一个小型 Bug 修复数据集：

```text
benchmarks/
├── auth-token-expired/
│   ├── task.yaml
│   └── acceptance_test.sh
├── user-permission-check/
│   ├── task.yaml
│   └── acceptance_test.sh
└── concurrent-cache-update/
    ├── task.yaml
    └── acceptance_test.sh
```

每个任务都应当从固定的代码版本开始，使用独立工作区运行，并记录最终变更。

最重要的一点是：**验收标准不能完全由被评估的 Agent 自己决定。**

否则 Agent 可能通过修改验收条件来让自己“成功”。

## 四、一个最小化的任务评分模型

我们可以先建立一套硬性门槛加指标评分的模型。

设：

- \(C\)：功能正确性得分。
- \(S\)：安全与约束遵守得分。
- \(R\)：执行可靠性得分。
- \(E\)：效率得分。

可以构造一个用于内部比较的示例评分：

\[
Q = 0.50C + 0.25S + 0.15R + 0.10E
\]

其中各项都归一化到 0–100 分。

但这里有个关键问题：**安全违规不应该仅仅扣几分就算了。**

因此还需要独立的硬性门槛：

```text
if unauthorized_change:
    result = failed

else if acceptance_tests_failed:
    result = failed

else if task_state_unknown:
    result = incomplete

else:
    result = passed
```

这个伪代码只是示例，实际系统还应考虑不同任务的验收规则和失败分类。

评分与任务判定是两件事：

- **判定**回答任务是否合格。
- **评分**帮助比较多个合格或失败的执行方案。

不能因为一个方案速度很快、成本很低，就让它抵消安全违规或功能错误。

## 五、评估 Harness 时，必须固定哪些变量？

假设你把 Harness 从 V1 升级到 V2，发现成功率从 60% 提升到 75%。

你可能认为优化有效。

但如果同时发生了这些变化呢？

- 模型从一个基础模型换成更强的模型。
- 测试集换成了更简单的任务。
- Token 预算增加了一倍。
- 超时时间从 5 分钟延长到 20 分钟。

这时候，你无法确定提升究竟来自哪里。

为了公平比较，建议控制以下变量：

<box border radius="lg" padding={3} gap={2}>
  {#each ["固定 Benchmark 任务集与初始提交","固定验收测试及其版本","记录模型名称、版本与参数","控制 Token、时间和工具调用预算","固定 Harness 配置与权限策略","记录随机种子及环境信息（适用时）"] as item}
    <row align="center" gap={2}>
      <icon name="check" color="success" size="sm" />
      <box flex="1">{item}</box>
    </row>
  {/each}
</box>

如果你希望单独验证 Harness 架构优化，就尽量保持模型、任务和预算不变，只改变要研究的那一项。

如果你希望比较模型，则反过来固定 Harness 和其他条件。

这就是控制变量的思路。

## 六、用 Go 设计一个评估结果结构

下面给出一个可以落地的基础结构。

文件：`internal/eval/result.go`

```go
package eval

import "time"

type Status string

const (
	StatusPassed     Status = "passed"
	StatusFailed     Status = "failed"
	StatusIncomplete Status = "incomplete"
	StatusError      Status = "error"
)

type Metrics struct {
	InputTokens  int64
	OutputTokens int64

	ToolCalls    int
	RetryCount   int

	Duration time.Duration
	CostUSD  float64
}

type EvaluationResult struct {
	RunID       string
	TaskID      string
	HarnessVersion string
	ModelID     string

	Status Status
	Metrics Metrics

	AcceptancePassed bool
	SafetyPassed     bool

	FailureCategory string
	Evidence         []string

	StartedAt  time.Time
	FinishedAt time.Time
}
```

这里的 `Evidence` 可以记录验收报告、Git diff 摘要、测试日志路径等证据引用。

实际实现中，建议把完整的执行事件与评估结果分开存储：

```text
Task Run
   ├── Event Log
   ├── Tool Call Records
   ├── Git Diff
   ├── Test Reports
   └── Evaluation Result
```

这样即使最后判定失败，也可以追溯失败发生在哪一步。

## 七、评估结果怎样帮助你优化 Harness？

假设你连续运行了一批 Benchmark，发现以下情况：

| 现象 | 应该优先排查的模块 |
|---|---|
| 模型找不到相关代码 | 检索系统、Context Builder |
| 工具经常超时 | Tool Runtime、超时与取消机制 |
| 修改正确但测试失败 | 测试环境、依赖、验收条件 |
| 同一任务重复执行副作用 | 幂等机制、任务恢复与状态持久化 |
| 经常修改禁止文件 | Policy Engine、工作区隔离 |
| 任务完成率高但成本暴涨 | 模型路由、上下文预算、重试策略 |
| 升级后旧任务大量失败 | 回归 Benchmark、协议兼容性 |

这就是评估系统真正的价值：它不仅告诉你失败了多少次，还帮助你判断应该优化哪个模块。

另外，Benchmark 不能只记录总平均值。建议同时观察任务类型、难度、模型、失败原因和成本分布，避免少数简单任务掩盖严重的失败模式。

---

## 八、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  你升级了 Coding Harness，Benchmark 成功率从 60% 上升到 80%。但是这次升级同时更换了模型、扩大了 Token 预算，并且修改了一部分验收测试。

  你现在能得出什么结论？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 成功率提升了 20 个百分点，所以 Harness 架构一定得到了改善。</radio>
    <radio value="B">B. 当前结果无法隔离各项变化的影响，应固定任务集、验收条件和其他变量，再通过对照实验评估。</radio>
    <radio value="C">C. 只需要比较 Token 消耗，就能确定这次升级是否有效。</radio>
    <radio value="D">D. Benchmark 不需要固定任务，只要持续使用真实用户任务就可以。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！多个变量同时变化，无法判断提升来自模型、预算、验收标准还是 Harness 本身。应先建立可重复的对照实验，再逐项分析变化的影响。
      {:else}
        关键是控制变量。没有固定的任务集和验收标准，成功率变化就可能来自测试难度变化，而不是 Harness 变得更可靠。
      {/if}
    </box>
  {/if}
</box>

下一课我们将进入**第二十课：Coding Harness 的完整架构整合**，把前面学习的 Agent Loop、Tool Runtime、状态机、持久化、Sandbox、模型适配、检索与评估串成一套完整的系统。
