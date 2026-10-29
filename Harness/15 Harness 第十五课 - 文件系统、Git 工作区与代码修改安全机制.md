---
title: "Harness 第十五课 - 文件系统、Git 工作区与代码修改安全机制"
aliases:
  - "Harness 第十五课 - 文件系统、Git 工作区与代码修改安全机制"
tags:
  - harness
  - ai-agent
  - verbatim
  - filesystem-git
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "59bcd1f4-4f7b-4f08-9c20-09da88ca40d2"
source_user_message_id: "b79665d9-2b94-4d42-a10b-5be36fbabcb4"
source_content_sha256: "9e4e9ec47ccee0224c46a953de6fbe6e323df010e820881d79924f6ed59057a8"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：15  
> 原始章节：Harness 第十五课：文件系统、Git 工作区与代码修改安全机制  
> 合并消息 ID：`59bcd1f4-4f7b-4f08-9c20-09da88ca40d2`  
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

我们继续！上一课我们解决了任务队列、Worker 崩溃、重试和未知副作用的问题。现在进入更贴近 AI 编程 Agent 实战的一课：**Harness 如何安全地读取、修改、验证和提交代码。**

# Harness 第十五课：文件系统、Git 工作区与代码修改安全机制

这一课的目标是设计一个 Coding Harness，让 Agent 能够修改代码，但不能随意破坏用户的项目。

假设用户提出需求：

> 帮我修复登录 Bug，只允许修改 `src/auth/` 目录，不要修改配置文件，也不要覆盖我尚未提交的代码。

Agent 修改完代码后，即使测试通过，也不能直接宣布任务完成。Harness 必须验证修改范围、保护原有工作、检查 Git diff，并确认没有违反用户约束。

## 一、先明确：模型不能直接拥有文件系统的无限权限

一个常见的错误架构是：

```text
用户
  ↓
LLM
  ↓
生成 shell 命令
  ↓
直接执行命令
  ↓
修改整个项目
```

这种设计把模型的意图直接变成了文件系统副作用，缺少足够的控制层。

更合理的架构是：

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **LLM：提出修改方案**
    <text color="secondary" size="sm">修改哪些文件、执行哪些命令</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Policy Engine：检查权限**
    <text color="secondary" size="sm">允许的路径、命令、网络访问和审批规则</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Workspace Manager：管理工作区**
    <text color="secondary" size="sm">隔离、快照、文件变更记录、Git 状态</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **Tool Runtime：执行与验证**
    <text color="secondary" size="sm">文件操作、测试、diff 检查、结果持久化</text>
  </box>
</box>

这里有一个非常重要的原则：

**模型可以提出操作，但是否允许操作、在哪里执行、如何验证结果，都由 Harness 决定。**

## 二、为什么仅靠路径字符串检查不够？

假设用户只允许修改：

```text
/workspace/src/auth/
```

你可能会写这样的检查：

```go
if strings.HasPrefix(path, "/workspace/src/auth/") {
    allow()
}
```

看起来没问题，但下面这些情况可能绕过简单检查：

```text
/workspace/src/auth/../../config/production.yaml
```

还有：

- 路径中的 `..`。
- 指向其他位置的符号链接。
- 相对路径与绝对路径混用。
- 文件被替换或链接目标在检查之后发生变化。
- 大小写、路径分隔符及平台差异。

因此，路径安全不能仅靠 `strings.HasPrefix`。

### 1. 先规范化，再进行路径边界检查

Go 可以使用 `filepath.Rel` 检查规范化后的路径是否位于允许目录之内。

```go
package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func IsWithin(root, target string) (bool, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return false, err
	}

	target, err = filepath.Abs(target)
	if err != nil {
		return false, err
	}

	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false, err
	}

	if rel == "." {
		return true, nil
	}

	if rel == ".." ||
		strings.HasPrefix(
			rel,
			".."+string(filepath.Separator),
		) {
		return false, nil
	}

	return true, nil
}

func ValidateExistingPath(root, target string) error {
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return fmt.Errorf("resolve root: %w", err)
	}

	realTarget, err := filepath.EvalSymlinks(target)
	if err != nil {
		return fmt.Errorf("resolve target: %w", err)
	}

	ok, err := IsWithin(realRoot, realTarget)
	if err != nil {
		return err
	}

	if !ok {
		return fmt.Errorf("path escapes workspace")
	}

	info, err := os.Stat(realTarget)
	if err != nil {
		return err
	}

	if !info.Mode().IsRegular() {
		return fmt.Errorf("target is not a regular file")
	}

	return nil
}
```

但注意，这只是**路径检查示例，不是完整的安全沙箱**。

它仍然存在重要限制：

- `EvalSymlinks` 要求目标路径已经存在，不适合直接处理所有新建文件。
- 检查和打开文件之间可能发生竞态。
- 硬链接、挂载点及特殊文件还需要额外处理。
- 即使路径检查通过，进程仍可能通过 shell、其他工具或网络访问越权资源。

在对抗性环境中，应该结合操作系统级隔离，例如容器、独立工作区、受限挂载、非特权账户和必要的网络限制。对高安全要求的文件访问，还应采用基于目录句柄的安全打开方式，避免检查后路径被替换。

## 三、Git 工作区：如何保护用户原有修改？

这是 Coding Harness 最容易出事故的地方。

假设用户的 Git 工作区在 Agent 启动前已经存在这些未提交修改：

```text
M src/auth/login.go
M config/local.yaml
?? notes.txt
```

其中：

- `login.go` 是用户已经修改但尚未提交的代码。
- `config/local.yaml` 是用户的本地配置。
- `notes.txt` 是用户新建的文件。

Agent 开始工作后又修改了 `login.go`。

这时执行：

```bash
git checkout -- .
```

可能直接覆盖用户原来的未提交修改。

执行：

```bash
git clean -fd
```

则可能删除用户新建的 `notes.txt`。

**所以，Harness 绝不能把 Git 工作区当作自己可以随意清理的临时目录。**

### 推荐方案：独立 Git Worktree

如果项目使用 Git，优先考虑为每个任务创建独立的工作区。

<AsyncImage query="Git worktree multiple working directories shared repository conceptual diagram" aspectRatio="16:9" width="100%" />

例如：

```text
project/
├── .git/
├── src/
└── config/

agent-workspaces/
├── task-1001/
├── task-1002/
└── task-1003/
```

概念上，每个任务都有自己的工作目录和分支：

```bash
git worktree add \
  -b agent/task-1001 \
  ../agent-workspaces/task-1001 \
  HEAD
```

这里的 `HEAD` 表示当前检出的提交。实际部署时，应先确定任务的基准提交，并处理工作区清理、分支命名冲突、共享 Git 元数据和任务结束后的回收。

使用独立 Worktree 的好处是：

- 不直接覆盖用户原工作区的文件。
- 多个任务可以拥有不同的工作目录。
- 更容易生成任务自己的 diff。
- 可以在独立分支上运行测试。
- 任务完成后，由用户或受控的合并流程决定是否应用变更。

不过，Worktree 也不是完整沙箱。它们共享 Git 仓库的部分内部元数据，外部命令也可能访问其他文件，因此仍需操作系统级隔离。

## 四、如何准确判断哪些代码是 Agent 修改的？

这是一个比看起来复杂的问题。

假设：

```text
T0：任务开始
T1：Agent 修改代码
T2：用户也修改了同一个文件
T3：Harness 执行 git diff
```

如果直接把 T3 的 diff 全部当作 Agent 的修改，就可能误判用户的操作。

因此，Harness 应当尽可能在隔离工作区内记录任务的基准版本。

例如：

```text
Task ID: task-1001
Base Commit: abc123
Working Branch: agent/task-1001

Modified:
  src/auth/login.go

Created:
  src/auth/session.go

Deleted:
  src/auth/legacy.go
```

对于 Git 工作区，可以从任务的基准提交与任务分支的差异入手：

```bash
git diff --name-status <base-commit>...HEAD
```

这里比较的是基准提交与当前分支的变更；具体采用双点还是其他比较方式，应根据任务是否允许提交、基准提交是否固定等情况确定。

此外，还需要考虑：

- 未跟踪文件不会出现在普通的 `git diff` 中。
- 子模块有自己的状态和提交。
- Git LFS 或生成文件可能需要额外处理。
- 文件权限变化、符号链接变化也可能具有安全影响。
- 测试程序本身可能修改文件。

所以，最终的变更清单应结合 Git diff、未跟踪文件、工作区状态以及必要的文件系统快照来构建，而不是只依赖一个命令的输出。

## 五、建立文件变更策略引擎

现在我们把用户的自然语言约束转化为明确规则。

例如：

```json
{
  "allowed_paths": [
    "src/auth/**"
  ],
  "denied_paths": [
    "config/**",
    ".env*"
  ],
  "allow_delete": false,
  "allow_new_files": true,
  "require_approval_for": [
    "dependency_changes",
    "network_access"
  ]
}
```

这只是策略数据的示例格式。生产实现还需要定义通配符语义、规则优先级、路径规范化和默认拒绝策略。

### 1. 允许列表与拒绝列表

可以按下面的优先级判断：

1. 先规范化路径并确认它位于工作区中。
2. 检查是否命中明确禁止规则。
3. 检查是否满足允许修改的范围。
4. 检查操作类型是否允许，例如创建、修改或删除。
5. 对需要审批的操作进入审批流程。
6. 记录判定结果和依据。

一般来说，明确禁止规则应该优先于宽泛的允许规则。

例如，即使用户允许修改 `src/**`，也不能因此允许修改被单独禁止的 `src/auth/secrets.go`。

### 2. 不要只在工具入口检查权限

假设 Agent 通过 `write_file` 修改文件时经过了权限检查，但它随后调用：

```bash
python script.py
```

这个脚本又修改了 `config/production.yaml`。

如果只在 `write_file` 工具中检查路径，Harness 仍然可能发生越权修改。

因此，权限控制应该覆盖所有可能产生副作用的执行路径，包括：

- 文件读写工具。
- Shell 命令。
- 脚本和子进程。
- Git 操作。
- 网络请求。
- 依赖安装与构建脚本。

这也是为什么工具权限、进程隔离和工作区隔离需要协同工作，而不能互相替代。

## 六、设计最终的 Git Diff 验收器

回到本课开头的场景：用户只允许修改 `src/auth/`，不允许修改配置文件。

测试通过之后，Harness 应该执行独立的变更范围检查。

一个简单的验收逻辑可以是：

```go
type ChangedFile struct {
	Path   string
	Status string
}

type DiffResult struct {
	Files []ChangedFile
}

type AcceptanceResult struct {
	Passed  bool
	Reasons []string
}

func VerifyChangedFiles(
	diff DiffResult,
	allowed func(string) bool,
	allowDelete bool,
) AcceptanceResult {
	result := AcceptanceResult{
		Passed: true,
	}

	for _, file := range diff.Files {
		if !allowed(file.Path) {
			result.Passed = false
			result.Reasons = append(
				result.Reasons,
				"修改范围越界: "+file.Path,
			)
		}

		if file.Status == "D" && !allowDelete {
			result.Passed = false
			result.Reasons = append(
				result.Reasons,
				"不允许删除文件: "+file.Path,
			)
		}
	}

	return result
}
```

这里的 `allowed` 应当由前面介绍的安全策略引擎实现，不能直接使用不安全的字符串前缀匹配。

另外，这个例子只展示了验收规则的核心思路。生产实现还应处理重命名、复制、未跟踪文件、子模块、文件模式变化和 Git 路径转义等情况。

最终的任务完成判定应该类似：

```text
1. 必需步骤全部执行完成
2. 测试结果符合要求
3. Git 变更范围检查通过
4. 文件安全策略检查通过
5. 没有未解决的未知副作用
6. 所有必需验收证据已持久化

全部满足 → completed
否则 → 修复、等待、失败或取消
```

**注意：如果任务是在独立 Worktree 中执行的，发现越权修改时，可以拒绝合并或要求修复；如果任务直接在用户工作区执行，就不能为了恢复到某个快照而盲目重置整个目录。**

## 七、把它们整合成 Coding Harness 的工作流

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **1. 创建任务**
    <text color="secondary" size="sm">固定基准提交、解析用户约束</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **2. 准备独立工作区**
    <text color="secondary" size="sm">创建 Worktree、应用访问策略</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **3. Agent 执行修改**
    <text color="secondary" size="sm">每次工具调用都经过权限与隔离机制</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **4. 测试与变更审计**
    <text color="secondary" size="sm">检查测试结果、完整文件清单和 Git diff</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **5. 完成判定**
    <text color="secondary" size="sm">验收通过后再允许交付或合并</text>
  </box>
</box>

## 八、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景：**

  你开发的 Coding Harness 为每个任务创建了独立 Git Worktree。用户明确要求只修改 `src/auth/`。Agent 修改了 `src/auth/login.go`，但运行测试时，构建脚本又修改了 `config/local.yaml`。所有测试都通过了。

  Harness 应该如何处理？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 测试通过，直接标记 completed，配置文件的修改不影响测试结果。</radio>
    <radio value="B">B. 通过完整变更审计发现越界修改，阻止任务完成或合并，记录具体文件，并按安全策略恢复或要求修复后重新验收。</radio>
    <radio value="C">C. 执行 `git reset --hard` 和 `git clean -fd`，清理整个工作区后重新标记 completed。</radio>
    <radio value="D">D. 只在 `write_file` 工具中增加路径检查，因为构建脚本属于测试流程，不需要检查。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "回答正确！" : "再想一想"}</title>
      {#if answer === "B"}
        正确。测试通过不代表修改范围合规。Harness 必须检查所有可能产生变更的执行路径，并阻止越界结果被交付。恢复操作也必须局限于任务拥有的工作区和已知变更，不能不加区分地删除文件。
      {:else}
        关键在于：权限控制必须覆盖工具、脚本和子进程等所有副作用路径；最终验收还必须独立检查文件变更范围。
      {/if}
    </box>
  {/if}
</box>

下一课我们将继续学习 **第十六课：Coding Harness 的测试策略、自动修复与验证闭环**，重点讲清楚如何决定运行哪些测试、如何处理测试失败、如何避免 Agent 为了让测试通过而修改测试本身，以及如何让验收证据真正可信。
