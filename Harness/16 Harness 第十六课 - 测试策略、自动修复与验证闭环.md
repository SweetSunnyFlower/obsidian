---
title: "Harness 第十六课 - 测试策略、自动修复与验证闭环"
aliases:
  - "Harness 第十六课 - 测试策略、自动修复与验证闭环"
tags:
  - harness
  - ai-agent
  - verbatim
  - testing-verification
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "6ef75e55-4ba0-4945-8f4d-7683b38a00fa"
source_user_message_id: "7f4a4bc7-708a-407d-ba4d-a960c61108bf"
source_content_sha256: "fca40d51a2cdbe19e17806566c12d4a12dfcbf1430056ef30e215bfc3253a141"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：16  
> 原始章节：Harness 第十六课：测试策略、自动修复与验证闭环  
> 合并消息 ID：`6ef75e55-4ba0-4945-8f4d-7683b38a00fa`  
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

我们继续！上一课我们已经把 Coding Harness 的文件权限、Git Worktree 和 diff 验收串起来了。

这一课要解决一个更难的问题：**Agent 修改完代码后，Harness 如何知道代码真的修好了，而不是仅仅让测试变绿？**

# Harness 第十六课：测试策略、自动修复与验证闭环

本课会围绕一个实际场景展开：你开发了一个 Go 项目，Agent 接到任务，需要修复登录接口的 Bug。

用户要求：

- 修复登录失败的问题。
- 不修改已有测试来掩盖 Bug。
- 不修改无关模块。
- 运行必要的测试，并给出可信的验证结果。

Harness 不能只把任务交给模型，再问一句“你修好了吗”。它需要建立一套独立的验证机制。

## 一、测试通过，不等于任务完成

假设 Agent 修改了 `Login()` 函数。

<box border radius="xl" padding={3} gap={3}>
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="check-circle" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **情况 A：测试通过**

      <text color="secondary" size="sm">原有测试通过，但 Agent 同时删除了一个失败的测试。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="file-warning" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **情况 B：测试通过**

      <text color="secondary" size="sm">代码通过单元测试，但没有验证用户报告的登录失败场景。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="shield-check" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **情况 C：验证闭环完整**

      <text color="secondary" size="sm">针对 Bug 的测试通过，相关回归测试通过，修改范围合规，结果有可追溯证据。</text>
    </box>
  </row>
</box>

我们真正希望得到的是情况 C。

Harness 至少需要区分三个概念：

1. **Test Execution**：测试命令是否成功执行。
2. **Test Result**：测试是否通过。
3. **Acceptance**：测试结果和其他证据是否足以证明用户需求已经满足。

例如，测试命令因为依赖下载失败而退出，属于执行失败，不应被记录成测试不通过的业务结论，更不能当成验证成功。

同样，测试通过也不代表所有验收条件都已满足。

## 二、Harness 应该如何选择测试？

一个项目可能有上千个测试。每次修改都运行完整测试套件，既浪费时间，也可能因为外部服务不可用而失败。

因此，Harness 需要测试选择策略。

### 1. 建立分层测试体系

<box border radius="xl" padding={3} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} gap={1}>
    <row align="center" gap={2}>
      <icon name="zap" size="lg" />
      **第一级：快速检查**
      <spacer />
      <badge>每次修改</badge>
    </row>
    <text size="sm">格式检查、静态检查、编译检查、针对性单元测试。</text>
  </box>
  <box border radius="lg" padding={3} gap={1}>
    <row align="center" gap={2}>
      <icon name="test-tube" size="lg" />
      **第二级：相关回归测试**
      <spacer />
      <badge>按影响范围</badge>
    </row>
    <text size="sm">受影响模块的测试、调用方测试、相关集成测试。</text>
  </box>
  <box border radius="lg" padding={3} gap={1}>
    <row align="center" gap={2}>
      <icon name="layers" size="lg" />
      **第三级：完整验证**
      <spacer />
      <badge>交付前</badge>
    </row>
    <text size="sm">完整测试套件、必要的集成验证、安全检查及最终 diff 审计。</text>
  </box>
</box>

这不是说每个项目都必须严格分成三次运行，而是建立一个合理的验证顺序。

以 Go 项目为例：

```bash
# 1. 检查代码格式
gofmt -d ./...

# 2. 编译和静态检查
go vet ./...

# 3. 运行相关模块测试
go test ./internal/auth/...

# 4. 必要时运行完整测试
go test ./...
```

注意，`gofmt -d` 只展示格式差异，不会自动修复代码；如果使用 `gofmt -w`，它会修改文件，因此也需要受到工作区和权限策略的约束。

另外，`go vet` 不能代替编译检查、单元测试或集成测试。真实项目还应根据模块依赖、数据库、外部服务和 CI 配置选择验证命令。

### 2. 测试选择不能只依赖模型猜测

模型可以建议运行哪些测试，但 Harness 应该结合可验证的数据做选择。

例如：

```text
修改文件：
  internal/auth/login.go

可能受影响：
  internal/auth/
  internal/middleware/
  API 登录接口

验证计划：
  gofmt
  go vet ./...
  go test ./internal/auth/...
  登录接口集成测试
  最终 Git diff 检查
```

影响范围可以来自：

- Git 变更文件清单。
- 模块依赖图。
- 测试与源码的关联关系。
- 项目中已配置的 CI 流程。
- 过去测试失败的记录。
- 用户明确提出的验收条件。

模型可以提出补充建议，但不能因为它声称“这些测试足够了”，就自动跳过强制验证项。

## 三、最重要的原则：先写失败测试，再修复 Bug

这是建立可靠自动修复闭环的关键。

假设登录接口存在一个 Bug：

```go
func Login(username, password string) error {
    if username == "" {
        return errors.New("username required")
    }

    // Bug：密码为空时没有被拒绝。
    return authenticate(username, password)
}
```

我们希望空密码一定被拒绝。

### 1. 先建立复现测试

```go
func TestLoginRejectsEmptyPassword(t *testing.T) {
    err := Login("alice", "")

    if err == nil {
        t.Fatal("expected empty password to be rejected")
    }
}
```

修复之前运行测试：

```bash
go test ./internal/auth/...
```

预期结果是失败。

这一步非常关键：我们不仅知道测试失败，还知道它为什么失败。

### 2. Agent 修改代码

```go
func Login(username, password string) error {
    if username == "" {
        return errors.New("username required")
    }

    if password == "" {
        return errors.New("password required")
    }

    return authenticate(username, password)
}
```

再次运行同一个测试。

如果测试通过，就说明我们已经有证据表明这个特定问题得到了修复。

当然，真实登录系统还需要检查密码验证、认证绕过、账户状态等其他安全要求；这个例子仅用于说明测试闭环。

### 3. 为什么要保存修复前的失败证据？

因为否则 Agent 可能出现以下情况：

- 写了一个根本不能复现 Bug 的测试。
- 修改代码后，测试一直是绿色的，但问题仍然存在。
- 删除原测试后，整个测试套件看起来通过了。
- 修改测试断言，让错误行为也能通过。

因此，Harness 应记录测试的前后状态：

```text
Test: TestLoginRejectsEmptyPassword

Before fix:
  outcome = failed
  reason  = expected empty password to be rejected

After fix:
  outcome = passed

Regression tests:
  outcome = passed
```

但要注意：修复前的测试失败也可能来自环境、依赖或测试自身的问题。Harness 需要保存退出码、输出摘要和执行环境信息，确认失败原因与目标 Bug 相关，而不是把任何红色测试都当作有效复现。

## 四、如何防止 Agent 修改测试来掩盖问题？

这是自动修复中一个很现实的风险。

假设原始测试要求：

```go
if got != expected {
    t.Fatal("unexpected result")
}
```

Agent 发现测试失败，于是把断言改成：

```go
if got != expected {
    t.Log("unexpected result")
}
```

测试可能因此变绿，但产品 Bug 并没有修复。

我们可以通过几种机制降低这种风险。

### 1. 记录测试文件的基准版本

任务开始时记录测试文件的哈希或基准提交。

```text
Base Commit:
  abc123

Protected Test Files:
  internal/auth/login_test.go
  internal/auth/security_test.go
```

最终比较测试文件的变更。

如果用户明确要求不修改测试文件，就应当把它作为硬性约束；如果允许添加回归测试，则可以通过策略允许新测试，但不允许删除或弱化既有断言。

### 2. 对测试修改进行独立审计

Harness 可以单独检查：

- 是否删除了测试。
- 是否修改了断言。
- 是否跳过了测试。
- 是否降低了预期值或覆盖范围。
- 是否修改了测试配置。
- 是否新增了针对当前错误的例外逻辑。

这些检查不一定都能通过简单的文本 diff 自动判断。例如，测试代码重构可能是合理的，而断言语义变化可能隐藏在复杂的辅助函数中。

因此，静态规则适合拦截明确违规；语义判断可以辅助审查，但高风险修改仍应结合独立测试或人工审批。

### 3. 使用外部固定的验收测试

对关键需求，最好让验收条件不完全依赖 Agent 当前修改的工作区。

例如：

```text
Harness 内部验收：
  用户提供的登录验收用例

Agent 工作区：
  可修改业务代码
  受策略限制地添加测试

最终执行：
  在隔离环境中运行固定验收用例
```

这样，即使 Agent 修改了项目内部测试，也无法轻易改变 Harness 外部持有的验收标准。

这并不意味着外部测试绝对不会出错，但它能够减少 Agent 同时修改实现和验收依据的风险。

## 五、设计自动修复循环

现在把前面学过的 Agent Loop、状态机、工具运行时和验证机制组合起来。

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **1. 分析问题**
    <text color="secondary" size="sm">确定目标、约束和验收标准</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **2. 建立失败证据**
    <text color="secondary" size="sm">复现 Bug，保存测试输出</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **3. Agent 修改代码**
    <text color="secondary" size="sm">每次操作都经过权限和执行控制</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **4. 执行验证**
    <text color="secondary" size="sm">目标测试、回归测试、静态检查</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
        <icon name="check-circle" size="lg" />
        **全部通过**
        <text size="xs" color="secondary">进入最终验收</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
        <icon name="refresh-cw" size="lg" />
        **验证失败**
        <text size="xs" color="secondary">分析证据后修复或重规划</text>
      </box>
    </grid-item>
  </grid>
</box>

这里需要区分两种失败：

**第一种：代码失败。** 比如断言不通过、编译失败。Agent 可以根据输出尝试修复。

**第二种：验证环境失败。** 比如数据库连接失败、依赖下载超时。Harness 不应让 Agent 无休止地修改业务代码，而应该先恢复环境，或者把任务转为等待、重试或失败状态。

### 一个 Go 版本的执行骨架

文件：`internal/harness/verification.go`

```go
package harness

import (
	"context"
	"fmt"
)

type Check struct {
	Name    string
	Command []string
	Required bool
}

type CheckResult struct {
	Name     string
	Passed   bool
	ExitCode int
	Output   string
	Error    string
}

type Acceptance struct {
	Checks []CheckResult
	Passed bool
}

type CommandRunner interface {
	Run(
		ctx context.Context,
		command []string,
	) (exitCode int, output string, err error)
}

func Verify(
	ctx context.Context,
	runner CommandRunner,
	checks []Check,
) (Acceptance, error) {
	result := Acceptance{
		Passed: true,
	}

	for _, check := range checks {
		exitCode, output, err := runner.Run(
			ctx,
			check.Command,
		)

		item := CheckResult{
			Name:     check.Name,
			ExitCode: exitCode,
			Output:   output,
			Passed:   err == nil && exitCode == 0,
		}

		if err != nil {
			item.Error = err.Error()
		}

		result.Checks = append(result.Checks, item)

		if check.Required && !item.Passed {
			result.Passed = false
		}

		if ctx.Err() != nil {
			return result, fmt.Errorf(
				"verification interrupted: %w",
				ctx.Err(),
			)
		}
	}

	return result, nil
}
```

这段代码是验证器骨架，还不是完整的生产实现。真正的 `CommandRunner` 应该运行在受控工作区中，并实现超时、进程树清理、输出截断、资源限制和命令审计。

此外，`Required` 为 `false` 的检查即使失败，也不会自动阻止通过；因此生产实现还必须明确区分必需检查、可选检查和环境故障。

最重要的是：**验证器负责产生证据，任务状态机负责根据验收策略决定能否完成。**

不要让模型自行把 `Acceptance.Passed` 改成 `true`。

## 六、如何避免 Agent 无限自动修复？

假设测试一直失败，Agent 就一直修改代码。

如果没有限制，可能出现：

```text
修改 → 测试失败 → 修改 → 测试失败
    → 修改 → 测试失败 → 无限循环
```

Harness 必须设置明确的停止条件。

| 限制项 | 作用 |
|---|---|
| 最大修复轮数 | 限制反复修改 |
| 最大模型调用数 | 控制推理成本 |
| 最大工具调用数 | 防止工具滥用 |
| 总 Deadline | 避免任务无限运行 |
| 最大代码变更量 | 防止修改范围失控 |
| 最大连续同类失败次数 | 避免反复尝试相同的无效修复 |

例如：

```go
type RepairBudget struct {
	MaxRounds      int
	MaxModelCalls  int
	MaxToolCalls   int
	MaxChangedFiles int
}
```

每次修复前，Harness 都要检查剩余预算。

不过，预算耗尽并不意味着任务已经修复成功。正确的处理方式是停止自动尝试，保存当前状态和失败证据，然后根据业务策略转为 `failed`、`waiting_input` 或人工介入。

## 七、什么样的证据才足以让任务完成？

我们将前面几课的知识整合起来，建立一个最终验收清单。

{@body const [checks, setChecks] = DIL.useState([false,false,false,false,false,false])}
<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    <title size="md">Coding Harness 验收清单</title>
    <text color="secondary" size="sm">{checks.filter(Boolean).length}/6</text>
  </row>
  {#each [
    "目标 Bug 有可复现的测试或明确的验收用例",
    "目标测试及必要的回归测试通过",
    "必需的编译、静态检查和集成检查通过",
    "测试文件没有发生未经允许的削弱或删除",
    "Git diff、文件权限和修改范围检查通过",
    "验证结果、退出码和必要日志已经持久化"
  ] as item,i}
    <checkbox key={item} checked={checks[i]} onChange={(v) => setChecks(old => old.map((x,j) => i === j ? v : x))} lineThrough={false}>{item}</checkbox>
  {/each}
  <divider />
  {#if checks.every(Boolean)}
    <text color="success" weight="medium"><icon name="check-circle" size="sm" inline /> 清单已全部勾选。实际任务仍须依据真实运行结果和可信证据验收，不能只靠手动勾选。</text>
  {:else}
    <text color="secondary" size="sm">还剩 {checks.filter(x => !x).length} 项未勾选。实际运行结果应由 Harness 自动记录，而不是让 Agent 自行填写。</text>
  {/if}
</box>

这份清单只是通用模板。不同项目还可能需要数据库迁移验证、API 兼容性检查、性能测试、安全测试等额外要求。

完成判定应该由任务的验收策略决定，而不是简单要求所有项目都执行同一组测试。

## 八、本课小测

{@body const [answer,setAnswer] = DIL.useState("B")}
{@body const [submitted,setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  Agent 修复了一个 Bug。测试失败后，它修改了业务代码，也把原来失败的测试断言删除了。现在整个测试套件通过了。

  Harness 应该如何处理？

  <radio-group value={answer} onChange={(v) => {setAnswer(v);setSubmitted(false)}} direction="col">
    <radio value="A">A. 测试套件通过，直接标记 completed。</radio>
    <radio value="B">B. 检查测试文件变更，按照任务策略拒绝未经授权的测试修改，并使用独立验收用例验证修复效果。</radio>
    <radio value="C">C. 让模型解释为什么删除断言是合理的，只要解释可信就可以完成。</radio>
    <radio value="D">D. 永远禁止 Agent 添加或修改任何测试。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "回答正确！" : "再想一想"}</title>
      {#if answer === "B"}
        正确。测试变绿不一定代表 Bug 已修复。Harness 应检查测试变更是否符合授权策略，并通过独立的验收用例确认行为。合理的新增测试可以允许，但不能让 Agent 随意削弱验收标准。
      {:else}
        核心是独立验证。既不能盲目接受测试通过，也不必一刀切地禁止所有测试修改；应根据任务约束审计变更，并保护关键验收条件。
      {/if}
    </box>
  {/if}
</box>

下一课是**第十七课：Harness 的模型适配层、上下文协议与多模型切换**。我们将讨论如何把模型供应商、工具调用格式、流式输出、Token 预算和模型故障恢复从核心执行引擎中分离，让同一套 Coding Harness 可以切换不同的大模型，而不需要重写整个系统。
