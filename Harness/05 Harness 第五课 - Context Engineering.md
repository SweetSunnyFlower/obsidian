---
title: "05 Harness 第五课 - Context Engineering"
aliases:
  - "Harness 第五课 - Context Engineering"
tags:
  - harness
  - ai-agent
  - verbatim
  - context-state
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "787c0bf8-4495-434c-a8a5-fdaa76e6cc9a"
source_turn_id: "bbb21184-328b-47c6-af8e-a4282ffd47f7"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：05  
> 原始章节：原回答完整内容  
> 合并消息 ID：`787c0bf8-4495-434c-a8a5-fdaa76e6cc9a`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 继续
> ~~~

返回：[[Harness 知识地图]]

---

# 第五课：Context Engineering——Harness 如何管理上下文

这一课非常重要。前面我们解决的是 Agent 如何执行工具，这一课要解决的是：**Agent 执行了几十轮甚至几百轮之后，如何不丢失任务目标、重要发现和执行状态？**

这也是开发 Coding Agent 时最容易低估的问题之一。

先建立一个核心认知：

**Context Engineering 不是简单地把更多文本塞进 Prompt，而是决定在每一次模型调用时，哪些信息应该出现、以什么顺序出现，以及哪些信息应该被压缩或省略。**

## 一、先区分四个概念

假设你让 Agent 修复一个 Go 项目的 Bug。

它已经读取了 30 个文件、运行了 10 次测试、修改了 5 个文件。此时，系统中存在很多信息，但并不是每一条都值得继续发送给模型。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="messages-square" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **1. Conversation History（对话历史）**

      <text color="secondary" size="sm">用户消息、模型回复、工具调用及工具结果。</text>

      记录此前发生了什么。
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="brain" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **2. Model Context（模型上下文）**

      <text color="secondary" size="sm">本次实际发送给模型的指令、消息、工具定义等。</text>

      它是一次模型调用的输入，不一定包含全部历史。
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="clipboard-list" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **3. Task State（任务状态）**

      <text color="secondary" size="sm">任务目标、已完成步骤、待办事项、验证结果。</text>

      记录当前任务进行到哪里。
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="44px" align="center" justify="center">
      <icon name="database" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **4. Memory（持久记忆）**

      <text color="secondary" size="sm">跨任务可复用的项目知识、约定和经验。</text>

      记录未来可能还会用到什么。
    </box>
  </row>
</box>

这四者有关联，但不能混为一谈。

例如，某次 `go test` 的完整输出属于历史记录；“测试失败，原因是缓存未初始化”属于可以保留的摘要；“修复缓存初始化后，必须重新运行测试”属于当前任务状态。

如果每一轮都重新发送完整终端输出，成本很高，而且关键事实容易被淹没。

## 二、Context Window 到底是什么？

模型的上下文窗口，可以理解为一次推理中可处理的 Token 容量上限。

Token 不完全等于汉字、单词或字符。代码、路径、JSON 和自然语言的 Token 使用量都可能不同。

而且，**上下文窗口不是专门留给对话历史的**。实际请求可能同时包含：

- System Prompt 和开发者指令。
- 用户消息与历史消息。
- 工具定义。
- 工具调用和工具返回值。
- 本次生成的输出，以及模型或服务端要求预留的空间。

所以，不能等到上下文窗口已经满了才开始处理。

### 建立一个 Token Budget

假设某模型的上下文窗口为 128K Token。我们可以设计一份教学用预算：

<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    **示例上下文预算**
    <badge>128K Token</badge>
  </row>
  <box gap={1}>
    <row align="center" justify="between">
      <text size="sm">系统指令与工具定义</text>
      <text size="sm" weight="medium">12K</text>
    </row>
    <box background="surface-secondary" radius="full" height="8px" clip>
      <box background="#64748b" height="8px" width="9.375%"/>
    </box>
  </box>
  <box gap={1}>
    <row align="center" justify="between">
      <text size="sm">最近对话与工具结果</text>
      <text size="sm" weight="medium">60K</text>
    </row>
    <box background="surface-secondary" radius="full" height="8px" clip>
      <box background="#0f766e" height="8px" width="46.875%"/>
    </box>
  </box>
  <box gap={1}>
    <row align="center" justify="between">
      <text size="sm">任务摘要与项目知识</text>
      <text size="sm" weight="medium">16K</text>
    </row>
    <box background="surface-secondary" radius="full" height="8px" clip>
      <box background="#a16207" height="8px" width="12.5%"/>
    </box>
  </box>
  <box gap={1}>
    <row align="center" justify="between">
      <text size="sm">预留生成空间</text>
      <text size="sm" weight="medium">16K</text>
    </row>
    <box background="surface-secondary" radius="full" height="8px" clip>
      <box background="#7c3aed" height="8px" width="12.5%"/>
    </box>
  </box>
  <box gap={1}>
    <row align="center" justify="between">
      <text size="sm">安全余量</text>
      <text size="sm" weight="medium">24K</text>
    </row>
    <box background="surface-secondary" radius="full" height="8px" clip>
      <box background="#94a3b8" height="8px" width="18.75%"/>
    </box>
  </box>
  <text color="secondary" size="xs">以上仅为架构示例，不是某个具体模型的最佳配置。不同模型和 API 对输入、输出及上下文限制的定义可能不同。</text>
</box>

这里需要注意两个问题：

第一，工具定义本身也会占用 Token。工具越多，定义越复杂，每轮请求的固定成本可能越高。

第二，预算不是固定不变的。任务进入调试阶段时，近期错误输出可能更重要；任务进入总结阶段时，则可能更需要最终变更和验证结果。

因此，Harness 应该动态决定如何分配上下文预算，而不是简单地保留固定数量的最近消息。

## 三、Harness 应该如何处理越来越长的历史？

这是 Context Engineering 最核心的实现问题。

通常有三种手段。

<box gap={3}>
  <row align="start" gap={3}>
    <AsyncImage query="minimal timeline recent conversation messages chronological sequence illustration" aspectRatio="4:3" maxWidth="112px"/>
    <box flex="1" gap={1}>
      **方法一：Trimming（裁剪）**

      删除或省略不再重要的旧消息，保留最近的对话与必要上下文。

      <text color="secondary" size="sm">适合：重复信息、冗长日志、已经不需要的中间输出。</text>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="document summarization notes condensed long report into concise summary illustration" aspectRatio="4:3" maxWidth="112px"/>
    <box flex="1" gap={1}>
      **方法二：Compaction（压缩）**

      将一段较长的历史整理成摘要，保留重要结论、约束、决策和未完成工作。

      <text color="secondary" size="sm">适合：长任务、复杂调试、多轮代码修改。</text>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <AsyncImage query="retrieval augmented generation knowledge index files search magnifying glass illustration" aspectRatio="4:3" maxWidth="112px"/>
    <box flex="1" gap={1}>
      **方法三：Retrieval（按需检索）**

      不把所有资料塞进上下文，而是在需要时重新读取文件、搜索历史记录或查询项目知识。

      <text color="secondary" size="sm">适合：大型代码仓库、文档库、长期任务与大量历史数据。</text>
    </box>
  </row>
</box>

这三种方法可以组合使用。

例如，Agent 调试了 50 轮后，可以压缩前 40 轮的执行过程，保留最近 10 轮的交互，并在需要时重新读取相关源文件。

但这里有一个容易踩的坑：

**裁剪历史不等于删除任务状态，压缩历史也不等于把所有历史都变成一段摘要。**

源代码、当前 Git Diff、测试结果和任务进度，往往需要以可重新读取或可验证的形式保留。

## 四、为什么不能简单地保留最近 20 条消息？

因为消息的重要程度和新旧程度不是一回事。

假设 Agent 执行了下面的任务：

1. 用户要求只能修改 `internal/cache/` 下的文件。
2. Agent 查看项目结构。
3. Agent 连续执行了 15 次测试。
4. Agent 发现缓存初始化有问题。
5. Agent 修改了 `internal/cache/store.go`。
6. Agent 又执行了 20 次测试和其他命令。

如果只保留最近 20 条消息，最早的用户约束可能会被删掉。

这样一来，模型可能继续工作，却忘记了任务的边界。

因此，建议把上下文分成两个层次：

- **稳定上下文**：用户目标、明确约束、重要项目规则、关键决策。
- **滚动上下文**：最近的模型回复、工具调用、工具输出和调试过程。

稳定上下文不能仅仅依赖“它刚好还在最近 N 条消息中”。

对于 Coding Harness，建议显式保存一份任务状态：

```typescript
type TaskState = {
  goal: string;

  constraints: string[];

  completed: string[];

  pending: string[];

  decisions: string[];

  verification: {
    command: string;
    status: "passed" | "failed" | "unknown";
    summary: string;
  }[];
};
```

比如：

```typescript
const state: TaskState = {
  goal: "修复缓存初始化 Bug",

  constraints: [
    "只修改 internal/cache/ 下的文件",
    "不要修改公共 API",
  ],

  completed: [
    "定位到缓存初始化顺序错误",
    "修改 internal/cache/store.go",
  ],

  pending: [
    "重新运行 go test ./...",
    "检查最终 Git Diff",
  ],

  decisions: [
    "保留现有缓存接口，只调整初始化顺序",
  ],

  verification: [
    {
      command: "go test ./...",
      status: "failed",
      summary: "修复前测试失败，修复后尚未重新验证",
    },
  ],
};
```

这里有一个关键设计：**任务状态应该由 Harness 持久化，而不是只依赖模型在后续对话中记住。**

模型可以帮助生成状态摘要，但 Harness 仍应负责保存、更新和验证它。比如，不能因为模型说“测试已经通过”，就直接把状态标记为通过；应该有实际的测试执行结果作为依据。

## 五、实现一个最小的 Context Builder

现在，我们把上面的思想转成代码。

在一个简单的 Harness 中，可以设计一个 `ContextBuilder`，负责组合稳定上下文、任务状态和最近的对话消息。

```typescript
type Message = {
  role: "user" | "assistant" | "tool";
  content: string;
};

type ContextInput = {
  systemPrompt: string;
  taskState: TaskState;
  recentMessages: Message[];
};

function buildContext(input: ContextInput): Message[] {
  const stateText = JSON.stringify(
    input.taskState,
    null,
    2,
  );

  return [
    {
      role: "user",
      content: input.systemPrompt,
    },
    {
      role: "user",
      content:
        "以下是当前任务的持久状态，请以实际工具结果为准：\n" +
        stateText,
    },
    ...input.recentMessages,
  ];
}
```

这只是一个展示职责的简化示例。正式使用时，`systemPrompt` 应放在所用模型 API 对应的系统或开发者指令字段中，而不是一律当作普通 `user` 消息。不同 API 的消息结构也会有所不同。

接下来，还需要解决两个实际问题：

1. `recentMessages` 不能无限增长。
2. `taskState` 和最近消息都需要纳入 Token 预算。

因此，完整的 Context Builder 通常会按以下顺序工作：

<box border radius="xl" padding={3} align="center" gap={1}>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **加载稳定指令与任务状态**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **选择相关历史和最近消息**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **估算 Token 使用量**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **裁剪或压缩低优先级内容**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="#173D35" theme="dark" radius="lg" padding={3} width="100%" align="center">
    **生成本次模型请求**
  </box>
</box>

还要特别注意：工具调用与工具返回值之间通常存在协议关联。裁剪历史时不能随意删除一条工具调用，却留下它的结果，或反过来。应该按照模型 API 的协议，保留完整的调用与结果关系。

## 六、Context Compaction：如何压缩历史而不丢失关键事实？

假设对话已经占用了 100K Token，而你希望把后续请求控制在 40K Token 左右。

这时，可以把一部分旧历史压缩成摘要。

但压缩的目标不是“把过去发生的事讲得更短”，而是**让 Agent 在不再看到完整旧历史的情况下，仍然能正确继续任务**。

一个实用的摘要可以包含：

```markdown
## Task
修复 Go 项目的缓存初始化 Bug。

## Constraints
- 只修改 internal/cache/ 下的文件。
- 不修改公共 API。

## Findings
- 问题与缓存初始化顺序有关。
- 已定位到 internal/cache/store.go。

## Changes
- 已调整缓存初始化顺序。
- 实际修改以当前 Git Diff 为准。

## Verification
- 修复前：go test ./... 失败。
- 修复后：尚未重新运行完整测试。

## Next Steps
1. 运行 go test ./...。
2. 检查 Git Diff。
3. 确认没有修改允许范围之外的文件。
```

注意其中的“修复后尚未重新运行完整测试”。这是一个很有价值的状态信息。

如果摘要只写“缓存 Bug 已修复”，模型可能会误以为任务已经验证完成。

### 哪些信息值得保留？

| 信息 | 建议处理方式 |
|---|---|
| 用户明确的约束 | 持久保存 |
| 当前任务目标 | 持久保存 |
| 关键技术结论 | 摘要保存，必要时保留证据来源 |
| 大段终端输出 | 提取错误与关键结果，原始日志可外部保存 |
| 源代码全文 | 通常按需重新读取 |
| 最终 Git Diff | 保留或确保可以重新获取 |
| 未完成的验证步骤 | 持久保存 |
| 过期的中间推测 | 删除或标记为未确认 |

这也说明了为什么 Harness 最好把“事实”和“推测”区分开。例如，“测试命令返回退出码 1”是可验证的事实；“可能是数据库连接失败”只是诊断假设。

## 七、一个经常被忽略的问题：Token 估算

最简单的实现可能使用字符长度：

```typescript
const estimatedTokens = Math.ceil(
  JSON.stringify(messages).length / 4,
);
```

但这只是非常粗略的估算。中文、代码、JSON、路径和特殊字符的 Token 比例都可能不同。

生产环境更推荐：

1. 使用对应模型的 Tokenizer 或官方估算工具。
2. 为系统指令、工具定义和消息历史统一计算预算。
3. 为生成输出和安全余量预留空间。
4. 在真正发送请求前检查预算。
5. 如果仍然超过限制，执行裁剪、压缩或检索。

还要注意，模型上下文窗口的具体定义因模型和 API 而异，不能仅凭一个固定数字推断输入、输出及缓存 Token 的限制。

## 八、最后建立一个完整的心智模型

到这里，我们可以把 Harness 的运行过程理解成三个互相配合的系统：

<box border radius="xl" padding={3} gap={3}>
  <box gap={1}>
    <title size="lg">Execution Runtime</title>
    <text color="secondary" size="sm">解决“如何执行”</text>
    Agent Loop、Tool Registry、Executor、并发、权限、Sandbox。
  </box>
  <divider/>
  <box gap={1}>
    <title size="lg">Context Runtime</title>
    <text color="secondary" size="sm">解决“模型应该知道什么”</text>
    Context Builder、Token Budget、Trimming、Compaction、Retrieval。
  </box>
  <divider/>
  <box gap={1}>
    <title size="lg">State Runtime</title>
    <text color="secondary" size="sm">解决“任务进行到哪里”</text>
    Session、Task State、事件记录、持久化、恢复和验证。
  </box>
</box>

这三个系统必须配合工作。例如，工具执行成功后，不仅要把结果加入对话历史，还要更新相关任务状态；当历史被压缩时，也不能把尚未完成的任务步骤一起丢掉。

## 九、课后小测

{@body const [answer,setAnswer] = DIL.useState("C")}
{@body const [submitted,setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **问题：Coding Agent 已经运行了 100 轮，当前上下文快要超出模型限制。哪种处理方式最合理？**

  <radio-group value={answer} onChange={(v) => {setAnswer(v);setSubmitted(false)}} direction="col">
    <radio value="A">A. 直接删除最早的 80 轮消息，不需要保存其他信息。</radio>
    <radio value="B">B. 把全部历史压缩成一句话，尽可能缩短上下文。</radio>
    <radio value="C">C. 保留关键约束和任务状态，压缩低价值历史，保留必要的近期交互，并按需重新检索证据。</radio>
    <radio value="D">D. 继续发送所有历史，直到模型 API 报错。</radio>
  </radio-group>
  <button block onClick={() => {setSubmitted(true);GenUI.issueNewTurn("Harness 第五课小测，我选择 "+answer+"。请批改，并继续下一课：Session、持久化与任务恢复。")}}>提交答案，进入下一课</button>
  {#if submitted}
    <text color="secondary" size="sm">答案已提交，接下来会批改并进入 Session 与持久化。</text>
  {/if}
</box>

下一课，我们将学习 **Session、持久化与任务恢复**：如果 Agent 执行到第 30 步时进程崩溃，重启后如何恢复任务，而不是把所有工作从头再来一遍。这会把上下文管理与真正可长期运行的 Harness 连接起来。
