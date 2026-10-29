---
title: "Harness 第十七课 - 模型适配层、上下文协议与多模型切换"
aliases:
  - "Harness 第十七课 - 模型适配层、上下文协议与多模型切换"
tags:
  - harness
  - ai-agent
  - verbatim
  - model-adapter
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "e3e0678d-c900-42cc-a827-10a2cd1511aa"
source_user_message_id: "96f527fc-0726-40f5-8c93-1ed33839461f"
source_content_sha256: "f369cd8cc8c8bc6b6d91b73c215960448024d2715a588f2513ca42957cb426d8"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：17  
> 原始章节：Harness 第十七课：模型适配层、上下文协议与多模型切换  
> 合并消息 ID：`e3e0678d-c900-42cc-a827-10a2cd1511aa`  
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

继续！上一课我们完成了测试策略、自动修复与验证闭环。这一课进入 Coding Harness 的另一个核心模块：**模型适配层（Model Adapter）**。

这节课非常重要，因为你如果想开发自己的 Coding Harness，未来可能需要同时接入 DeepSeek、OpenAI 兼容接口、Anthropic 协议，以及支持工具调用的本地模型。如果把模型供应商的逻辑直接写进 Agent Loop，后续维护会越来越困难。

# Harness 第十七课：模型适配层、上下文协议与多模型切换

## 一、为什么 Harness 需要模型适配层？

假设你现在接入 DeepSeek，直接在业务代码中调用模型：

```ts
const response = await fetch(
  "https://api.deepseek.com/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      tools,
    }),
  },
);
```

这段代码本身没有问题。

问题在于，如果整个 Harness 都依赖这种请求格式，那么将来切换到 Anthropic Messages API、其他 OpenAI 兼容接口或本地模型时，你可能需要修改：

- Agent Loop。
- 消息序列化。
- Tool Call 解析。
- 流式输出处理。
- Token 使用量统计。
- 错误处理和重试逻辑。
- 模型能力判断。

这意味着模型供应商的变化侵入了 Harness 的核心执行逻辑。

更合理的架构是：

<box border radius="xl" padding={3} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} align="center" gap={1}>
    <icon name="workflow" size="xl" />
    **Agent Loop**
    <text color="secondary" size="sm">只关心下一步应该做什么</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center" gap={1}>
    **Model Interface**
    <text color="secondary" size="sm">统一请求、响应、工具调用与错误语义</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="cloud" size="lg" />
        **OpenAI Adapter**
        <text color="secondary" size="sm">Chat Completions / Responses 等协议</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="message-square" size="lg" />
        **Anthropic Adapter**
        <text color="secondary" size="sm">Messages / Content Blocks</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="server" size="lg" />
        **Local Model Adapter**
        <text color="secondary" size="sm">本地推理服务</text>
      </box>
    </grid-item>
    <grid-item>
      <box background="surface" border radius="lg" padding={3} gap={1}>
        <icon name="plug" size="lg" />
        **Custom Adapter**
        <text color="secondary" size="sm">其他供应商或自定义协议</text>
      </box>
    </grid-item>
  </grid>
</box>

这里有一个重要设计原则：

**统一的是 Harness 内部的语义，不是强行要求所有模型使用相同的原生协议。**

---

## 二、设计统一的 Model Interface

我们先用 TypeScript 定义 Harness 内部的模型接口。

为什么使用 TypeScript？因为你熟悉前端和 Node.js，接口、联合类型和异步迭代器很适合用来表达这类设计。相同的架构原则也可以迁移到 Go。

### 1. 定义统一的消息类型

```ts
type Role =
  | "system"
  | "user"
  | "assistant"
  | "tool";

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

interface Message {
  role: Role;
  content: string | TextBlock[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}
```

这只是最小化的内部协议。

生产级 Coding Harness 往往还需要支持：

- 多模态内容。
- 不同模型的推理内容与签名数据。
- 拒绝回答标记。
- Tool Call 的增量流式事件。
- 提供商特定的上下文续接标识。
- 缓存控制和结构化输出约束。

尤其需要注意：如果把所有原生消息都压缩成简单的 `role + content`，可能会丢失某些模型恢复多轮工具调用所需的信息。

因此，内部协议要有版本控制，并允许在必要时保存受控的供应商特定元数据。

### 2. 定义统一请求与响应

```ts
interface ModelRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

interface ModelResponse {
  message: Message;
  finishReason:
    | "stop"
    | "tool_calls"
    | "length"
    | "refusal"
    | "other";

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };

  providerRequestId?: string;
}
```

`finishReason` 需要注意一个细节：模型因为输出长度达到上限而停止，与模型认为任务已经完成，是两回事。

如果 `finishReason === "length"`，Harness 不应直接把当前响应当作完整的最终答案。它需要根据模型协议和任务状态决定是否继续生成、压缩上下文或调整输出预算。

同样，`tool_calls` 只代表模型提出了工具调用，不代表工具已经执行。

### 3. 定义适配器接口

```ts
interface ModelAdapter {
  generate(
    request: ModelRequest,
  ): Promise<ModelResponse>;

  stream?(
    request: ModelRequest,
  ): AsyncIterable<ModelStreamEvent>;
}
```

不同模型的请求格式由对应的 Adapter 处理。

Agent Loop 不需要知道供应商的 URL，也不应该依赖供应商特定的响应字段。

---

## 三、工具调用协议：模型想调用工具，不代表工具已经执行

这是整个模型适配层最容易设计错误的地方。

假设模型返回：

```json
{
  "finish_reason": "tool_calls",
  "tool_calls": [
    {
      "id": "call_001",
      "type": "function",
      "function": {
        "name": "read_file",
        "arguments": "{\"path\":\"src/auth/login.go\"}"
      }
    }
  ]
}
```

这只是一个模型响应示例。

它表达的意思是：

> 模型建议 Harness 调用 `read_file` 工具，并传入指定参数。

真正的执行过程应该是：

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **模型生成 Tool Call**
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **解析与结构校验**
    <text color="secondary" size="sm">验证 JSON、参数 Schema 和工具名称</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Policy Engine**
    <text color="secondary" size="sm">检查权限、审批要求和预算</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box border radius="lg" padding={3} align="center">
    **Tool Runtime**
    <text color="secondary" size="sm">执行、持久化、捕获结果</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" /></box>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **工具结果重新进入模型上下文**
  </box>
</box>

因此，Adapter 只负责把原生协议转换成统一的 Tool Call 表示。

它不应该自行执行工具，也不应该绕过权限系统。

### 为什么必须保留 Tool Call ID？

模型发起调用时，可能一次返回多个工具调用：

```text
call_001 → read_file
call_002 → search_code
call_003 → get_git_diff
```

Harness 必须记录每次调用的状态和结果，并将结果与正确的调用 ID 关联。

如果模型协议要求工具结果通过对应 ID 返回，Adapter 还必须正确转换这种关联关系。

否则，多工具并发时可能发生结果错配，模型就会把一个文件的内容误认为另一个工具的返回结果。

---

## 四、流式输出：不能只处理文本 Token

很多人实现模型适配层时，只处理这一种事件：

```text
收到一段文本 → 输出给用户
```

但在 Coding Harness 中，模型流可能包含：

- 文本增量。
- Tool Call 的名称和参数增量。
- 推理或其他非展示内容。
- 使用量信息。
- 结束原因。
- 错误事件。

我们可以设计一个统一的流事件类型：

```ts
type ModelStreamEvent =
  | {
      type: "text_delta";
      text: string;
    }
  | {
      type: "tool_call_start";
      id: string;
      name: string;
    }
  | {
      type: "tool_call_delta";
      id: string;
      argumentsDelta: string;
    }
  | {
      type: "usage";
      inputTokens?: number;
      outputTokens?: number;
    }
  | {
      type: "finish";
      reason: ModelResponse["finishReason"];
    }
  | {
      type: "error";
      error: Error;
    };
```

注意，真实供应商可能使用完全不同的流式事件协议。这个联合类型是 Harness 自己定义的内部事件格式。

### 一个重要细节：参数还没传完时，不要执行工具

假设流式输出是：

```text
{"path":"src/auth/
login.go"}
```

这只是分段示意。真实的参数 JSON 可能被拆成任意多个片段。

因此：

1. 先累积同一 Tool Call 的参数增量。
2. 等到供应商明确标识该调用的参数输出完成。
3. 解析完整 JSON。
4. 校验 Schema。
5. 执行权限检查。
6. 再进入 Tool Runtime。

**绝不能因为已经收到了工具名称，就提前执行尚未完整生成的参数。**

此外，如果流在参数中途断开，Harness 应将这次生成视为不完整，而不是把残缺参数交给工具执行。

---

## 五、模型切换：不能简单地失败后换一家

假设你配置了两个模型：

```text
Primary:
  deepseek-chat

Fallback:
  another-provider/model-x
```

当主模型请求失败时，你可能希望自动切换到备用模型。

但模型切换涉及的不只是请求地址。

不同模型之间可能存在差异：

| 维度 | 可能出现的问题 |
|---|---|
| 上下文窗口 | 新模型无法容纳原来的完整上下文 |
| Tool Calling | 工具调用格式和支持能力不同 |
| 结构化输出 | JSON Schema 支持程度不同 |
| 推理能力 | 复杂代码任务的表现不同 |
| 多模态能力 | 图片、音频或其他内容不一定支持 |
| 推理状态 | 原模型的特定推理数据不能直接迁移 |
| Token 预算 | 相同预算不代表相同成本或效果 |

所以，模型切换前需要执行能力检查。

### 1. 为模型声明能力

```ts
interface ModelCapabilities {
  toolCalling: boolean;
  streaming: boolean;
  structuredOutput: boolean;
  vision: boolean;
  maxContextTokens: number;
}

interface ModelProfile {
  id: string;
  provider: string;
  capabilities: ModelCapabilities;
}
```

Harness 可以根据任务要求选择模型。

例如，任务需要工具调用、至少 64K 的上下文窗口，但不需要图片理解，那么模型选择器就应该先排除不满足硬性要求的模型。

实际项目中，能力信息应来自可信的模型配置和供应商文档，并允许针对具体部署进行覆盖。不能只因为模型名称里包含 `pro` 或 `vision`，就假设它一定支持某种能力。

### 2. 区分两种切换

**请求失败后的切换**

例如主模型返回限流错误。Harness 可以判断错误是否可重试，再决定等待、重试或切换备用模型。

**任务执行过程中的切换**

例如主模型已经提出了一个 Tool Call，工具执行失败，随后模型服务不可用。

这时不能简单地把原始消息数组交给另一个模型，就认为上下文完整。

Harness 需要确认：

- 已经执行的工具结果是否完整。
- Tool Call 与 Tool Result 的关联是否有效。
- 是否存在未完成的工具调用。
- 新模型是否能理解当前内部协议。
- 原模型特有的推理状态是否可以省略或需要重新生成。
- 当前任务是否还有足够的时间和预算。

对于工具副作用结果未知的任务，应先执行恢复或对账流程，再切换模型继续执行。

---

## 六、上下文协议：为什么不能无限追加消息？

假设 Agent 已经执行了 50 次工具调用。

如果每轮都把所有消息原样发送给模型，上下文就可能越来越大。

一个粗略的上下文预算可以表示为：

\[
T_{\text{input}} + T_{\text{output}} + T_{\text{reserve}}
\leq T_{\text{context}}
\]

其中：

- \(T_{\text{input}}\)：当前请求输入 Token。
- \(T_{\text{output}}\)：为本轮输出预留的 Token。
- \(T_{\text{reserve}}\)：协议、工具结果或其他必要开销的预留。
- \(T_{\text{context}}\)：模型可用上下文上限。

注意，真实 API 的上下文计费和限制规则可能因模型而异，这个公式是用于规划预算的通用近似模型。

Harness 可以采用分层策略：

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="pin" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **固定上下文**

      <text size="sm" color="secondary">用户目标、明确约束、验收条件、安全策略。</text>
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="file-text" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **任务状态与摘要**

      <text size="sm" color="secondary">已完成步骤、关键发现、修改文件、未解决问题。</text>
    </box>
  </row>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="history" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **可检索历史**

      <text size="sm" color="secondary">较早的工具结果、长日志、历史模型响应和文件内容。</text>
    </box>
  </row>
</box>

当上下文接近上限时，Harness 可以压缩历史、检索必要信息或创建新的执行轮次。

但有一条规则必须遵守：**不能为了压缩上下文而丢失尚未完成的 Tool Call、用户约束、关键失败证据或未知副作用状态。**

尤其是多轮工具调用协议，某些供应商要求消息序列严格匹配。压缩器必须理解协议约束，不能简单删除任意几条消息。

---

## 七、把模型适配层接入 Harness

我们把整体结构串起来：

```text
Task Scheduler
      ↓
Agent Loop
      ↓
Context Builder
      ↓
Model Router
      ↓
Model Adapter
      ↓
LLM Provider
      ↓
Normalized Model Response
      ↓
Tool Runtime / Final Response
```

其中：

- `Task Scheduler` 管理任务调度和恢复。
- `Agent Loop` 决定继续执行、调用工具、重规划或结束。
- `Context Builder` 组织模型所需的上下文。
- `Model Router` 根据能力、预算和错误策略选择模型。
- `Model Adapter` 转换供应商协议。
- `Tool Runtime` 执行经过校验和授权的工具调用。

建议你把模型适配层做成一个独立模块，例如：

```text
internal/
├── harness/
│   ├── runner.go
│   ├── state_machine.go
│   └── verification.go
├── model/
│   ├── types.go
│   ├── adapter.go
│   ├── router.go
│   ├── context.go
│   └── providers/
│       ├── openai/
│       ├── anthropic/
│       └── compatible/
├── tool/
│   ├── registry.go
│   ├── executor.go
│   └── policy.go
└── workspace/
    ├── git.go
    └── sandbox.go
```

这里的目录结构是建议方案，不是固定标准。真正重要的是依赖方向：核心 Harness 依赖内部接口，而不是依赖某家模型供应商的具体 SDK。

---

## 八、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  你的 Harness 正在使用模型 A 执行代码修改任务。模型 A 返回了一个 Tool Call，但对应的工具结果尚未完成持久化。此时模型 A 服务发生故障，系统决定切换到模型 B。

  你认为最合理的处理方式是什么？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 立即把原始消息数组发送给模型 B，让它自行决定是否重新调用工具。</radio>
    <radio value="B">B. 先恢复并核实未完成的 Tool Call，确保副作用和结果状态明确，再转换上下文协议、检查模型 B 的能力与预算，然后继续执行。</radio>
    <radio value="C">C. 删除所有历史消息，只给模型 B 发送用户最初的请求。</radio>
    <radio value="D">D. 永远禁止切换模型，因为不同模型之间不能共享任何任务状态。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "回答正确！" : "再想一想"}</title>
      {#if answer === "B"}
        正确。模型切换不只是更换 API 地址。Harness 必须先解决未完成调用的恢复问题，确保不会因为重新生成而重复产生副作用，然后再根据新模型的协议和能力继续任务。
      {:else}
        关键在于分离模型故障和任务状态。模型可以切换，但已经发生的工具副作用、持久化记录和用户约束不能随模型一起丢失。
      {/if}
    </box>
  {/if}
</box>

下一课我们将进入 **第十八课：Harness 的记忆系统、项目索引与代码检索**，学习如何将仓库结构、符号索引、历史执行记录和任务摘要组织成可检索的上下文，避免 Agent 每次都从头扫描整个项目。
