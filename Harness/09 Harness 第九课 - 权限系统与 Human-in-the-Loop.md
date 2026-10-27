---
title: "09 Harness 第九课 - 权限系统与 Human-in-the-Loop"
aliases:
  - "Harness 第九课 - 权限系统与 Human-in-the-Loop"
tags:
  - harness
  - ai-agent
  - verbatim
  - reliability
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "fbb77ea7-4f3c-42b0-844f-0ce0babd9954"
source_turn_id: "422fbfa4-872b-45bb-b5d0-4373842c80d3"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：09  
> 原始章节：原回答完整内容  
> 合并消息 ID：`fbb77ea7-4f3c-42b0-844f-0ce0babd9954`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第八课小测，我选择 B，正确。请批改并继续第九课。
> ~~~

返回：[[Harness 知识地图]]

---

# Harness Engineering 第 9 课：权限系统与 Human-in-the-Loop

## 一、先批改第八课小测

你的答案是 **B，完全正确。** ✅

回顾一下题目：Coding Agent 调用远程 API 创建部署任务，客户端等待超时，但服务端可能已经成功创建任务。

为什么不能直接重试？

因为这里的 `timeout` 只说明客户端没有在规定时间内拿到结果，**不代表服务端没有执行成功**。

正确的处理流程是：

1. 判断操作是否可能已经产生外部副作用。
2. 如果结果未知，使用幂等键或查询接口核实执行状态。
3. 确认操作尚未生效，或者接口明确支持幂等后，再决定是否重试。
4. 把最终结果写入持久化状态，避免任务恢复后重复执行。

这个问题也为第九课埋下了一个关键伏笔：**即使工具能正确执行、错误能正确处理，Harness 仍然可能因为权限控制不严而做出危险操作。**

例如，模型原本只需要修改一个源代码文件，却调用了删除目录的工具；或者模型请求执行一条会删除数据库的 SQL。

今天，我们就来设计一套真正属于 Harness 的权限系统。

---

## 二、先理解：为什么权限不能交给模型自己决定？

想象你的 Coding Agent 收到任务：

> 帮我修复项目中的一个 Bug，并运行测试。

模型可能依次调用以下工具：

<box border radius="lg" padding={3} gap={3}>
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="md" size="44px" align="center" justify="center">
      <icon name="file-pen-line" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **操作 A：读取源代码**
      <text color="secondary" size="sm">通常风险较低，可以自动执行。</text>
    </box>
    <badge color="success">自动允许</badge>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="md" size="44px" align="center" justify="center">
      <icon name="terminal" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **操作 B：运行测试命令**
      <text color="secondary" size="sm">需要检查命令内容和执行环境。</text>
    </box>
    <badge color="warning">条件允许</badge>
  </row>
  <divider color="subtle" />
  <row align="center" gap={3}>
    <box background="surface-secondary" radius="md" size="44px" align="center" justify="center">
      <icon name="trash-2" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **操作 C：删除整个项目目录**
      <text color="secondary" size="sm">可能造成不可逆的数据损失。</text>
    </box>
    <badge color="danger">拒绝或审批</badge>
  </row>
</box>

模型的工作是提出行动建议，不是给自己的行动签发通行证。

如果让模型自己判断“这个工具是否安全”，就相当于让申请权限的人同时担任权限审核员。

因此，Harness 必须建立独立的 **Policy Engine（策略引擎）**。

核心原则：

- 模型提出调用请求。
- Harness 校验工具和参数。
- Policy Engine 决定允许、拒绝还是需要人工审批。
- Executor 只执行通过检查的操作。
- 审批系统记录人的明确决定，并且能够在任务恢复后继续生效。

## 三、Harness 权限系统的整体架构

<box border radius="xl" padding={3} align="center" gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **1. Model / Agent**
    <text color="secondary" size="sm">提出工具调用请求，不拥有最终授权权</text>
  </box>
  <icon name="arrow-down" size="lg" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **2. Tool Registry + Schema Validator**
    <text color="secondary" size="sm">检查工具是否注册、参数是否符合 Schema</text>
  </box>
  <icon name="arrow-down" size="lg" color="secondary" />
  <box background="rgba(59,130,246,0.10)" border={{size:1,color:"rgba(59,130,246,0.5)"}} radius="lg" padding={3} width="100%" align="center" gap={1}>
    **3. Policy Engine**
    <text size="sm">综合工具、参数、资源、身份和风险做出决策</text>
    <row gap={2} wrap="wrap" justify="center">
      <badge color="success">Allow</badge>
      <badge color="danger">Deny</badge>
      <badge color="warning">Require Approval</badge>
    </row>
  </box>
  <icon name="arrow-down" size="lg" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **4. Approval Service（按需）**
    <text color="secondary" size="sm">持久化审批请求，等待有权用户批准或拒绝</text>
  </box>
  <icon name="arrow-down" size="lg" color="secondary" />
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **5. Executor + Sandbox**
    <text color="secondary" size="sm">在受控环境中执行，并记录结果</text>
  </box>
</box>

注意：这张图表达的是逻辑职责，不代表每次操作都必须经过人工审批服务。`Allow` 可以直接进入执行阶段，`Deny` 应立即终止。

### 1. 三种权限决策

| 决策 | 含义 | Harness 的动作 |
|---|---|---|
| `allow` | 操作满足当前策略 | 继续执行 |
| `deny` | 操作违反策略 | 拒绝执行 |
| `require_approval` | 需要有权用户确认 | 创建审批请求，暂停该工具调用 |

这里有一个很重要的工程原则：

**审批不是报错，也不是工具执行成功。它是一个独立的、可以持久化和恢复的任务状态。**

例如，模型申请执行 `rm -rf ./build`，策略可以要求审批。Harness 此时不能先执行命令，再通知用户；必须先完成授权流程。

---

## 四、Policy Engine 应该检查什么？

不能仅仅根据工具名称决定权限。

例如，`execute_command` 既可以执行安全的测试命令，也可以执行危险的删除命令。真正需要判断的是工具、参数、目标资源和执行环境的组合。

我建议从以下五个维度建立策略。

<box gap={2}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="wrench" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **1. 工具权限**

      `read_file`、`write_file`、`execute_command`、`deploy_service` 分别定义不同权限，不能只用一个笼统的 `tool_access`。
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="folder-lock" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **2. 资源范围**

      允许修改项目工作目录，不代表允许修改 `/etc`、读取 SSH 私钥或访问其他用户的文件。
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="shield-check" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **3. 操作风险**

      读取文件通常风险较低；覆盖文件、删除数据、部署生产环境、向外部发送数据，需要更严格的规则。
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="user-round-check" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **4. 用户身份与任务授权**

      谁发起任务、任务被授予了什么权限、审批者是否有权批准，都会影响最终结果。
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="container" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **5. 执行环境**

      即使用户批准了一个命令，也应该限制它能访问的文件、网络、进程和系统资源。审批不能代替 Sandbox。
    </box>
  </row>
</box>

### 最小权限原则（Least Privilege）

假设 Agent 只需要修改 `/workspace/app/src` 下的代码，那么就不应该因为它获得了 `write_file` 工具权限，就能写入整个服务器的任意路径。

要注意，路径检查不能只靠字符串前缀。例如：

```go
strings.HasPrefix("/workspace/app-evil", "/workspace/app")
```

结果也是 `true`，但这并不代表路径位于项目目录内。

即使使用 `filepath.Rel` 检查路径，也仍然需要考虑符号链接、目录替换和检查后路径变化等问题。对于真正的文件安全边界，应结合安全的文件打开方式、目录句柄约束或操作系统隔离，而不是只依赖字符串检查。

同样，不能用简单的字符串黑名单来保证 Shell 命令安全。更稳妥的方式是使用参数化的命令执行、受限的命令白名单和操作系统级隔离。

---

## 五、用 Go 实现第一版 Policy Engine

先实现最核心的决策接口。暂时不接数据库和审批 UI，先把权限决策与工具执行分离。

建议的目录结构：

```text
harness/
├── policy/
│   ├── types.go
│   └── engine.go
├── approval/
│   ├── types.go
│   └── service.go
├── tool/
│   ├── registry.go
│   └── executor.go
└── runtime/
    └── runner.go
```

### 第一步：定义权限决策类型

`policy/types.go`

```go
package policy

import "context"

type Decision string

const (
    DecisionAllow            Decision = "allow"
    DecisionDeny             Decision = "deny"
    DecisionRequireApproval  Decision = "require_approval"
)

type ToolRequest struct {
    UserID    string
    SessionID string
    TaskID    string
    ToolCallID string

    ToolName string
    Arguments map[string]any
}

type Result struct {
    Decision Decision
    Reason   string
    RuleID   string
}

type Engine interface {
    Evaluate(
        ctx context.Context,
        req ToolRequest,
    ) (Result, error)
}
```

为什么把 `UserID`、`TaskID` 和 `ToolCallID` 都放进请求？

因为权限不是一个孤立的布尔值。

一次文件写入究竟是否允许，可能取决于是谁发起的、属于哪个任务、要调用哪个工具，以及具体参数是什么。审批系统还需要通过 `ToolCallID` 关联原始调用。

### 第二步：实现策略引擎

`policy/engine.go`

```go
package policy

import "context"

type Rule struct {
    ToolName string
    Decision Decision
    Reason   string
    RuleID   string
}

type StaticEngine struct {
    Rules map[string]Rule
}

func (e *StaticEngine) Evaluate(
    ctx context.Context,
    req ToolRequest,
) (Result, error) {
    if err := ctx.Err(); err != nil {
        return Result{}, err
    }

    rule, ok := e.Rules[req.ToolName]
    if !ok {
        // 默认拒绝：没有明确授权就不执行。
        return Result{
            Decision: DecisionDeny,
            Reason:   "no matching permission rule",
        }, nil
    }

    return Result{
        Decision: rule.Decision,
        Reason:   rule.Reason,
        RuleID:   rule.RuleID,
    }, nil
}
```

初始化规则：

```go
engine := &policy.StaticEngine{
    Rules: map[string]policy.Rule{
        "read_file": {
            ToolName: "read_file",
            Decision: policy.DecisionAllow,
            Reason:   "reading project files is allowed",
            RuleID:   "read-file-v1",
        },
        "write_file": {
            ToolName: "write_file",
            Decision: policy.DecisionRequireApproval,
            Reason:   "file writes require approval",
            RuleID:   "write-file-v1",
        },
        "deploy_service": {
            ToolName: "deploy_service",
            Decision: policy.DecisionDeny,
            Reason:   "deployment is disabled by current policy",
            RuleID:   "deploy-disabled-v1",
        },
    },
}
```

这只是教学用的第一版。生产环境还必须把参数级策略纳入判断：例如，不能因为 `write_file` 被允许，就自动允许它写入任何文件。

另外，策略引擎发生内部错误时，不应该把错误解释成 `allow`。对于受保护的工具，应当失败关闭（fail closed）。

---

## 六、Human-in-the-Loop：如何正确实现人工审批？

现在来处理最容易出现安全漏洞的部分。

假设模型请求：

```json
{
  "tool_name": "write_file",
  "arguments": {
    "path": "/workspace/app/config.go",
    "content": "..."
  }
}
```

Policy Engine 返回 `require_approval`。

Harness 应该创建审批请求，并向用户展示：

- 谁发起了操作；
- 使用了哪个工具；
- 完整的操作参数或安全、完整的操作摘要；
- 可能产生的副作用；
- 批准、拒绝和过期时间；
- 请求所关联的任务和工具调用。

**审批必须针对具体操作，而不是笼统地问一句“是否允许 Agent 继续”。**

### 1. 定义审批状态机

<box border radius="lg" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="md" padding={3} width="100%" align="center">
    **Pending**
    <text color="secondary" size="sm">等待审批</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <grid columns={3} gap={2}>
    <grid-item>
      <box border radius="md" padding={2} align="center" gap={1}>
        <icon name="check-circle" color="success" size="lg" />
        **Approved**
        <text size="xs" color="secondary">批准</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={2} align="center" gap={1}>
        <icon name="x-circle" color="danger" size="lg" />
        **Rejected**
        <text size="xs" color="secondary">拒绝</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={2} align="center" gap={1}>
        <icon name="clock" color="secondary" size="lg" />
        **Expired**
        <text size="xs" color="secondary">过期</text>
      </box>
    </grid-item>
  </grid>
</box>

实际系统还需要处理 `cancelled` 等状态，以及并发审批、重复提交和审批者身份验证。

审批记录至少应该持久化以下信息：

```go
type ApprovalRequest struct {
    ID string

    UserID     string
    SessionID  string
    TaskID     string
    ToolCallID string

    ToolName    string
    ArgumentsHash string
    PolicyVersion string

    Status string

    RequestedAt time.Time
    ExpiresAt   time.Time

    DecidedBy string
    DecidedAt *time.Time
}
```

这里的 `ArgumentsHash` 是一个重要的安全机制。

### 2. 为什么必须绑定参数哈希？

假设用户看到的审批内容是：

```text
允许写入 /workspace/app/config.go 吗？
```

用户点击了批准。

随后，模型将参数改成：

```text
允许写入 /etc/ssh/sshd_config 吗？
```

如果 Harness 只检查“这个工具调用已经被批准”，就可能错误地执行第二个操作。

因此，审批必须绑定：

- `ToolCallID`；
- 工具名称；
- 经过规范化的完整参数；
- 当前策略版本；
- 任务、会话和审批主体；
- 必要时的资源版本或其他执行前提。

计算参数哈希时，应该使用确定性的规范化编码，避免 JSON 字段顺序等表示差异导致同一操作得到不同哈希。哈希可以帮助验证参数一致性，但它不能代替身份验证、授权检查或安全的执行环境。

审批后如果工具名或参数发生变化，就必须重新进行策略判断，必要时重新请求审批。

## 七、审批通过后，Harness 应该怎样执行？

这里有一个常见的实现错误：

```go
if approved {
    return executor.Execute(ctx, req)
}
```

这个判断太简单了。它没有确认批准是否仍然有效、参数是否变化、策略是否更新，也没有解决并发执行问题。

更可靠的流程是：

<list marker="number" gap={2}>
  <list-item>模型提交工具调用，Harness 校验工具定义和参数。</list-item>
  <list-item>Policy Engine 判断是否需要审批；需要时创建持久化的 `pending` 审批记录。</list-item>
  <list-item>用户通过可信的审批界面批准或拒绝，服务端验证用户身份和审批权限。</list-item>
  <list-item>使用数据库事务或原子条件更新，将审批从 `pending` 转换为最终决定，防止重复审批产生竞态。</list-item>
  <list-item>执行前重新检查参数哈希、调用身份、策略版本、审批有效期和当前授权。</list-item>
  <list-item>通过后才进入受限的 Executor；执行结果与相关事件写入持久化存储。</list-item>
</list>

### Go 中的执行入口

下面是一个简化的编排示例，重点是职责分离。这里的 `ApprovalService` 和 `Executor` 是接口，生产实现需要接入持久化存储和受限执行环境。

```go
package runtime

import (
    "context"
    "errors"

    "example.com/harness/policy"
)

var (
    ErrDenied          = errors.New("tool call denied")
    ErrApprovalPending = errors.New("approval required")
)

type ApprovalService interface {
    EnsureApproved(
        ctx context.Context,
        req policy.ToolRequest,
        rule policy.Result,
    ) error
}

type Executor interface {
    Execute(
        ctx context.Context,
        req policy.ToolRequest,
    ) (any, error)
}

type Runner struct {
    Policy   policy.Engine
    Approval ApprovalService
    Executor Executor
}

func (r *Runner) RunTool(
    ctx context.Context,
    req policy.ToolRequest,
) (any, error) {
    decision, err := r.Policy.Evaluate(ctx, req)
    if err != nil {
        return nil, err
    }

    switch decision.Decision {
    case policy.DecisionDeny:
        return nil, ErrDenied

    case policy.DecisionRequireApproval:
        if r.Approval == nil {
            return nil, ErrApprovalPending
        }

        if err := r.Approval.EnsureApproved(
            ctx, req, decision,
        ); err != nil {
            return nil, err
        }

    case policy.DecisionAllow:
        // 继续执行，但仍需遵守执行时的安全约束。

    default:
        // 未知决策不能被当作允许。
        return nil, ErrDenied
    }

    if err := ctx.Err(); err != nil {
        return nil, err
    }

    return r.Executor.Execute(ctx, req)
}
```

有两个生产级细节必须补上：

1. `EnsureApproved` 不能只是读取一个 `approved` 布尔值。它必须验证持久化的审批记录与当前请求完全匹配，并处理过期、撤销和并发状态变化。
2. 在策略检查与执行之间仍可能发生状态变化，即 TOCTOU 问题。对于敏感文件、部署和数据库操作，应在执行边界再次验证，必要时使用事务、版本条件或操作系统提供的安全机制。

如果审批需要等待几分钟，**不要让一次 HTTP 请求或一个长期持有资源锁的 goroutine 一直阻塞**。更好的方式是保存审批状态，让任务进入 `waiting_for_approval`，释放不必要的资源；审批完成后，由任务调度器恢复执行。

## 八、如何防止模型绕过权限？

这是第九课最值得记住的部分。我们用四个攻击场景来检验设计。

<box border radius="lg" padding={3} gap={3}>
  **场景 A：换一个工具名**

  模型发现 `delete_database` 被拒绝，于是尝试调用 `execute_sql` 执行 `DROP TABLE`。

  <text color="success" weight="medium" size="sm">正确做法</text>

  对所有工具执行独立的策略评估。不能只按工具名判断，还要检查参数、操作语义、资源和执行能力。不能通过更换工具名获得更高权限。
  <divider color="subtle" />
  **场景 B：修改已经审批的参数**

  用户批准了写入项目目录的操作，模型随后把路径改成服务器敏感目录。

  <text color="success" weight="medium" size="sm">正确做法</text>

  将审批绑定到规范化参数哈希和原始 `tool_call_id`。参数变化意味着原审批不再适用。
  <divider color="subtle" />
  **场景 C：重复创建审批请求**

  模型不断提交同一个危险操作，试图通过新建 `tool_call_id` 绕过之前的拒绝决定。

  <text color="success" weight="medium" size="sm">正确做法</text>

  拒绝决定要持久化；对同一任务和相同操作实施去重、频率限制及策略约束。新的调用 ID 不应自动获得授权。
  <divider color="subtle" />
  **场景 D：Harness 重启**

  用户尚未审批，服务器重启。恢复逻辑错误地把 `pending` 当成允许执行。

  <text color="success" weight="medium" size="sm">正确做法</text>

  从持久化存储恢复审批状态。`pending`、`rejected`、`expired` 和 `cancelled` 都不能进入执行阶段；只有经过完整验证的有效批准才有资格继续。
</box>

还有一个边界：**工具权限系统不能只依赖模型遵守规则，也不能只依赖应用层的 Policy Engine。** 执行命令的进程应当受到文件系统、网络、凭证和系统权限的限制。这样即使应用层出现漏洞，实际能造成的损害也会受到约束。

---

## 九、本节架构验收清单

在继续学习之前，你可以用下面的清单检查一个 Harness 是否具备基本的权限能力。

{@body const checks = [
  "未知工具和未知权限默认拒绝",
  "每次工具调用都校验参数与当前策略",
  "人工审批与工具执行完全分离",
  "审批绑定用户、任务、工具调用和参数",
  "拒绝、过期和取消状态可以持久化恢复",
  "重复请求、并发审批和参数变更都有保护",
  "执行环境具有独立的文件、网络和进程隔离",
  "审计日志记录决策依据、审批者和执行结果"
]}
{@body const [done, setDone] = DIL.useState([])}
<box border radius="lg" padding={3} gap={3}>
  <row align="center" justify="between">
    **权限系统自检**
    <text color="secondary" size="sm">{done.length}/{checks.length}</text>
  </row>
  <box background="surface-tertiary" height="6px" radius="full" clip>
    <box background="surface-inverted" height="6px" radius="full" width={`${done.length / checks.length * 100}%`} />
  </box>
  {#each checks as item, i}
    <checkbox key={item} checked={done.includes(i)} onChange={v => setDone(old => v ? [...old, i] : old.filter(n => n !== i))}>{item}</checkbox>
  {/each}
</box>

## 十、第九课小测

最后来一道架构判断题。假设你正在实现自己的 Go Coding Harness。

某个工具调用要求执行：

```json
{
  "tool_name": "write_file",
  "arguments": {
    "path": "/workspace/project/config.go",
    "content": "..."
  }
}
```

用户已经批准了这次操作。但在真正执行前，模型把 `path` 改成了 `/etc/ssh/sshd_config`，其他字段不变。

你认为 Harness 应该怎么处理？

{@body const [answer, setAnswer] = DIL.useState("")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={3} gap={3}>
  <text weight="medium">请选择最合理的方案。</text>
  <radio-group value={answer} onChange={v => {setAnswer(v); setSubmitted(false)}} direction="col">
    <radio value="A">A. 用户已经批准了 `write_file` 工具，所以允许继续执行。</radio>
    <radio value="B">B. 重新检查路径是否存在即可；文件存在就允许执行。</radio>
    <radio value="C">C. 检测到参数与已批准请求不一致，原审批失效；重新进行策略评估，并在必要时申请新的审批。</radio>
    <radio value="D">D. 生成新的 `tool_call_id`，保留之前的审批结果后继续执行。</radio>
  </radio-group>
  <button block onClick={() => {setSubmitted(true); GenUI.issueNewTurn("Harness 第九课小测，我选择 "+answer+"。请批改答案，并继续第十课：Sandbox 与工具隔离。")}} disabled={!answer}>提交答案并继续下一课</button>
  {#if submitted}
    <text color="secondary" size="sm">已提交，接下来会批改你的答案并继续课程。</text>
  {/if}
</box>

下一课我们将继续深入 **第十课：Sandbox 与工具隔离**，重点学习如何在 Go 中安全地运行 Shell 命令、限制文件系统访问、控制网络权限，以及为什么 `exec.CommandContext` 本身并不是一个完整的 Sandbox。
