---
title: "Harness 第十八课 - 记忆系统、项目索引与代码检索"
aliases:
  - "Harness 第十八课 - 记忆系统、项目索引与代码检索"
tags:
  - harness
  - ai-agent
  - verbatim
  - code-retrieval
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "7e7726cf-2135-4462-8141-0efab59f46da"
source_user_message_id: "96f527fc-0726-40f5-8c93-1ed33839461f"
source_content_sha256: "f34d6afefbab103d7aa6f7751b4fcda1601e8d4d7d70716e8a56ebc140811c7f"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：18  
> 原始章节：Harness 第十八课：记忆系统、项目索引与代码检索  
> 合并消息 ID：`7e7726cf-2135-4462-8141-0efab59f46da`  
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

我们继续！上一课学习了模型适配层，解决的是 Harness 如何接入不同的大模型。

今天进入第十八课：**Harness 的记忆系统、项目索引与代码检索**。

这节课和 Coding Agent 的实际开发能力直接相关。为什么 Claude Code、Codex 这类工具不能每次都把整个代码仓库塞进上下文？它们如何知道应该读取哪些文件、调用哪些函数，以及之前的修改做到了哪一步？

这些问题都与 Harness 的上下文构建和检索系统有关。

# Harness 第十八课：记忆系统、项目索引与代码检索

## 一、先理解一个核心问题：模型为什么不能直接读取整个项目？

假设你的项目有这样的结构：

```text
my-app/
├── apps/
│   ├── web/
│   └── api/
├── internal/
│   ├── auth/
│   ├── user/
│   └── payment/
├── pkg/
├── migrations/
├── tests/
├── go.mod
└── README.md
```

用户提出一个需求：

> 修复用户登录后偶尔出现的权限错误。

Agent 需要知道：

- 登录入口在哪里？
- JWT 在哪里生成和验证？
- 权限中间件在哪里？
- 用户和角色的数据模型是什么？
- 相关测试在哪里？
- 最近是否有人修改过认证逻辑？

如果让模型读取所有文件，会带来三个问题。

1. **Token 浪费**：大量无关代码占用上下文。
2. **注意力分散**：真正相关的实现容易被淹没。
3. **检索成本高**：每次任务都重新扫描整个项目，效率低。

所以，Harness 需要一套机制，将庞大的项目转化为模型可以逐步探索的信息。

这里有一个重要认识：

**记忆不是简单地把历史对话保存到数据库；检索也不是简单地搜索几个关键词。**

一个成熟的 Coding Harness 通常需要多种不同的存储与检索机制。

## 二、区分四种数据：不要把所有内容都叫 Memory

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="database" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **1. 任务状态 Task State**

      <text color="secondary" size="sm">当前任务做到哪一步、哪些步骤已完成、哪些工具调用尚未确认。</text>

      <text size="sm">例如：已定位 `internal/auth/middleware.go`，正在等待回归测试。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="book-open" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **2. 项目记忆 Project Memory**

      <text color="secondary" size="sm">跨任务可复用的项目知识和开发约定。</text>

      <text size="sm">例如：项目使用 Go Fiber、GORM；所有 API 错误必须使用统一响应结构。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="network" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **3. 代码索引 Code Index**

      <text color="secondary" size="sm">文件、符号、函数调用关系、类型定义及其他代码结构。</text>

      <text size="sm">例如：`Login()` 调用 `ValidateToken()`，后者使用 `UserRepository`。</text>
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="search" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **4. 检索知识 Retrieval Knowledge**

      <text color="secondary" size="sm">根据当前任务动态找到的相关代码、文档、日志和历史经验。</text>

      <text size="sm">例如：搜索到登录相关测试和最近一次修复权限错误的提交记录。</text>
    </box>
  </row>
</box>

这四类信息的生命周期并不相同。

任务状态必须可靠地持久化；项目记忆需要维护与更新；代码索引需要随着仓库变化而更新；检索结果则通常只在当前任务需要时加载。

把它们混在一个巨大的 `MEMORY.md` 中，后期很容易变成难以维护的知识垃圾场。

---

## 三、项目记忆应该存什么？

先看一个具体例子。

假设你希望 Agent 每次修改项目时都遵守以下规则：

```markdown
# Project Memory

## Technology Stack
- Backend: Go Fiber v3
- ORM: GORM
- Database: MySQL
- Frontend: Next.js

## Architecture
- HTTP handlers do not directly access the database.
- Business logic belongs in the service layer.
- Database operations belong in repositories.

## Development Rules
- Run related tests after changing business logic.
- Never modify database migrations without explicit authorization.
- Preserve unrelated user changes.
```

这类记忆很有价值，因为它能跨任务复用。

但记忆系统还必须回答三个问题。

**问题一：这些信息从哪里来？**

可能来自项目配置、开发文档、用户明确指示、代码分析或历史任务总结。

这些来源的可信度不同。例如，用户明确说“禁止修改迁移文件”，就不应被模型从某段代码中推测出的惯例覆盖。

**问题二：信息什么时候过期？**

如果项目从 GORM 迁移到其他 ORM，旧记忆就可能误导模型。

**问题三：记忆是否可以覆盖当前任务？**

不能。记忆只能辅助理解，不能覆盖当前用户指令、授权边界和真实代码状态。

因此，建议为记忆增加元数据：

```go
type MemoryRecord struct {
    ID        string
    ProjectID string
    Category  string
    Content   string

    Source    string
    Confidence float64

    CreatedAt time.Time
    UpdatedAt time.Time
    ExpiresAt *time.Time
}
```

这只是数据结构示例。真实系统还应考虑版本、失效机制、访问权限和审计记录。

一个特别重要的设计原则是：**记忆是帮助模型理解项目的材料，不是绕过权限系统的依据。**

---

## 四、代码检索：从简单搜索到多层检索

Coding Harness 不应该一上来就依赖向量数据库。

不同检索方法解决的是不同问题。

| 检索方式 | 适合解决的问题 | 示例 |
|---|---|---|
| 文件名搜索 | 文件在哪里？ | `middleware.go` |
| 文本搜索 | 哪些地方使用了某个标识符？ | `ValidateToken` |
| 符号索引 | 某个函数或类型在哪里定义？ | `UserService.Login` |
| 调用关系检索 | 谁调用了这个函数？ | `Login → ValidateToken` |
| 语义检索 | 哪些代码可能与这个需求相关？ | “用户权限校验失败” |
| Git 检索 | 最近谁修改了这段逻辑？ | `git log -p` |

实际工程中，通常应该组合使用这些方法。

### 第一层：文本搜索

例如：

```bash
rg -n "ValidateToken|Permission|Login" \
  internal/ apps/ tests/
```

优点是简单、快速、结果可解释。

缺点是无法很好地处理语义差异。例如，用户说“登录后偶尔失去访问权限”，代码中却可能使用 `Authorize`、`CheckRole` 或 `CanAccess` 等名字。

### 第二层：符号索引

符号索引会记录函数、类型、方法等代码实体的位置。

例如：

```text
Symbol: Login
Kind: method
File: internal/auth/service.go
Range: 40-88

Symbol: ValidateToken
Kind: function
File: internal/auth/token.go
Range: 15-49

Symbol: AuthMiddleware
Kind: function
File: internal/auth/middleware.go
Range: 20-65
```

这样，Harness 可以先找到符号，再读取具体代码，而不必将整个文件夹交给模型。

Go 项目可以考虑使用 `go/parser`、`go/ast`、`go/types`，或者基于语言服务器协议（LSP）的能力来构建更准确的索引。

### 第三层：语义检索

当用户描述的是问题而不是代码标识符时，语义检索很有帮助。

例如：

> 为什么某些用户登录后无法访问自己所属组织的数据？

向量检索可能找到：

- 组织权限中间件。
- 用户与组织关联模型。
- 组织级数据过滤代码。
- 相关错误日志和测试。

不过，向量相似度不等于代码调用关系，更不等于事实正确。

因此，语义检索结果应该作为候选线索，再用真实代码、符号定义和测试进行确认。

---

## 五、如何构建一个实用的代码检索 Pipeline？

下面是一个适合 Coding Harness 的检索流程。

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **用户任务**
    <text size="sm" color="secondary">修复登录后的权限错误</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **提取检索意图**
    <text color="secondary" size="sm">认证、JWT、权限、组织关系</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} align="center" gap={1}>
        <icon name="search" size="lg" />
        **文本搜索**
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} align="center" gap={1}>
        <icon name="network" size="lg" />
        **符号与调用关系**
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} align="center" gap={1}>
        <icon name="brain" size="lg" />
        **语义检索**
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} align="center" gap={1}>
        <icon name="git-commit" size="lg" />
        **Git 历史**
      </box>
    </grid-item>
  </grid>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **结果融合与排序**
    <text color="secondary" size="sm">去重、相关性、可信度、文件范围</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **Context Builder**
    <text size="sm" color="secondary">只把必要的代码和证据放入模型上下文</text>
  </box>
</box>

这个流程有三个关键点。

**第一，先便宜后昂贵。**

先执行文件名搜索、文本搜索和符号定位，再考虑更昂贵的语义检索或模型辅助分析。

**第二，保留来源信息。**

每个检索结果都应该带上文件路径、行号、索引版本或 Git 提交信息。模型提出修改方案时，Harness 才能追溯依据。

**第三，检索结果不是授权。**

即使搜索结果指出某个配置文件与问题高度相关，也不代表 Agent 获得了修改它的权限。检索系统与 Policy Engine 必须分开。

---

## 六、用 Go 设计一个最小可用的检索接口

现在把上面的概念转成实际代码。

建议先建立统一的检索接口，而不是立即引入向量数据库。

文件：`internal/retrieval/types.go`

```go
package retrieval

import (
	"context"
	"time"
)

type Query struct {
	Text       string
	ProjectID  string
	MaxResults int
}

type Source struct {
	FilePath    string
	StartLine   int
	EndLine     int
	Kind        string
	IndexVersion string
}

type Result struct {
	Content string
	Source  Source
	Score   float64
}

type Searcher interface {
	Search(
		ctx context.Context,
		query Query,
	) ([]Result, error)
}

type IndexMetadata struct {
	ProjectID string
	RootPath  string
	Version   string
	UpdatedAt time.Time
}
```

这里的 `Searcher` 是统一接口。

后面可以分别实现：

```text
internal/retrieval/
├── types.go
├── text_search.go
├── symbol_search.go
├── semantic_search.go
├── git_search.go
└── fusion.go
```

每个实现负责一种检索方式，`fusion.go` 负责结果融合。

### 结果融合的简单思路

假设同一个文件通过多种方式被找到：

- 文本搜索：0.8
- 符号检索：0.95
- 语义检索：0.7

不要直接认为这些分数可以比较，因为不同检索器的分数可能没有统一尺度。

更稳妥的初始方案是使用分层排序：

1. 精确符号命中。
2. 精确文本命中。
3. 调用关系命中。
4. 语义相关结果。
5. 历史经验结果。

后续如果需要，可以采用 Reciprocal Rank Fusion（RRF）等排序融合方法。但无论采用哪种方法，都要保留原始来源和排名，便于调试与评估。

---

## 七、上下文构建：找到代码后，不要把所有结果都塞给模型

假设检索系统找到了 100 个相关片段。

如果全部发送给模型，仍然会造成上下文膨胀。

因此，Harness 需要 Context Builder 来选择和组织内容。

一个常见的预算策略是：

```text
总上下文预算
├── 系统指令与工具协议
├── 用户任务与验收条件
├── 当前任务状态
├── 项目约定
├── 检索到的代码证据
└── 本轮输出预留
```

可以给不同类型的信息设置预算上限，但不应把预算比例写死为适用于所有模型和任务的通用规则。

例如，修复一个简单语法错误时，需要的代码证据可能很少；排查跨多个服务的并发 Bug 时，调用链、日志和相关实现就需要更大的空间。

更好的策略是：

- 先放入任务约束和验收条件。
- 再放入当前状态与必要的项目规则。
- 根据检索相关性、证据可信度和覆盖范围选择代码片段。
- 如果证据不足，继续检索，而不是让模型猜测。
- 如果证据过多，优先保留直接相关的实现、调用方、测试和关键配置。

**检索的目标不是找到尽可能多的代码，而是让模型在有限的上下文里获得足够可靠的证据。**

---

## 八、记忆系统必须处理过期与冲突

假设项目记忆写着：

```text
认证逻辑位于 internal/auth/
```

但项目已经重构，认证逻辑迁移到了：

```text
internal/security/
```

如果 Harness 无条件信任旧记忆，就可能一直搜索错误目录。

因此，建议对记忆和索引采用不同的更新策略。

| 数据 | 更新方式 |
|---|---|
| 任务状态 | 关键状态转换时持久化 |
| 项目规则 | 用户确认、配置变更或显式更新时维护 |
| 符号索引 | 文件变化后增量更新，定期校验 |
| 语义索引 | 根据代码或文档变化重新计算相关向量 |
| Git 历史 | 查询时动态读取，或按提交增量建立索引 |
| 检索缓存 | 根据仓库版本、查询参数和索引版本失效 |

这里还涉及一个容易忽视的问题：**仓库状态与索引状态可能不同步。**

例如，Agent 刚刚修改了 `middleware.go`，但符号索引还停留在修改前的版本。

此时，如果检索结果没有索引版本信息，模型可能会把旧代码当成当前代码。

因此，在修改代码之后，Harness 至少应确保关键验证基于当前工作区。对于必须保持准确的符号和调用关系，可以立即更新受影响的索引，或者在索引尚未更新时直接读取真实文件。

---

## 九、本课总结

今天建立了一个重要的架构认知：

- **Task State** 负责可靠地保存当前任务进度。
- **Project Memory** 负责跨任务复用项目知识。
- **Code Index** 负责理解代码结构与符号关系。
- **Retrieval** 负责根据当前任务动态获取证据。
- **Context Builder** 负责控制最终进入模型上下文的信息。
- **Policy Engine** 负责权限判断，不能被记忆或检索结果替代。

如果你要从零构建自己的 Coding Harness，我建议按这个顺序实现：

1. 文本搜索与文件读取。
2. 项目规则和任务状态持久化。
3. Go AST 或 LSP 符号检索。
4. 检索结果融合与上下文预算。
5. 最后再加入语义向量检索和记忆自动维护。

先把可靠、可解释的基础能力做好，再引入向量数据库和复杂的记忆机制，通常更容易控制系统复杂度。

## 第十八课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  Agent 修改了一个 Go 文件。随后，它通过代码检索系统查找调用关系，但索引尚未更新，返回的结果仍然来自修改前的代码。

  Harness 应该怎么做？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 直接使用旧索引，因为索引由系统生成，比工作区代码更可信。</radio>
    <radio value="B">B. 检查索引版本和工作区状态；必要时更新索引或直接读取当前文件，并以当前代码和独立验证结果作为依据。</radio>
    <radio value="C">C. 把旧索引结果交给模型，让模型自行判断哪些代码已经过期。</radio>
    <radio value="D">D. 每次修改任何文件，都删除整个代码索引并重新扫描整个项目。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！索引是代码的派生数据，可能滞后于真实工作区。Harness 应通过版本管理、增量更新和当前文件读取控制这种不一致，而不能盲目信任旧索引。
      {:else}
        核心是识别数据新鲜度问题。模型可以帮助分析，但不能替代对当前工作区和索引版本的核实；每次全量重建也通常没有必要。
      {/if}
    </box>
  {/if}
</box>

下一课：**第十九课——Harness 的评估系统、质量评分与回归基准（Evaluation & Benchmarking）**。我们将学习如何判断一个 Coding Harness 是否真的变强，而不是仅仅因为某次任务恰好成功。
