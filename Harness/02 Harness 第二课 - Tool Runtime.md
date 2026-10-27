---
title: "02 Harness 第二课 - Tool Runtime"
aliases:
  - "Harness 第二课 - Tool Runtime"
tags:
  - harness
  - ai-agent
  - verbatim
  - agent-loop
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "7e9cd20f-3c03-4a7e-ba1d-2c4d1e7954d3"
source_turn_id: "bbb21b86-92ed-4f3d-a20f-79af7241b1ae"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：02  
> 原始章节：原回答完整内容  
> 合并消息 ID：`7e9cd20f-3c03-4a7e-ba1d-2c4d1e7954d3`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 我完成了 Harness 第一课的小测，选择 B。请批改答案，并继续讲解 Tool Runtime 的实现。
> ~~~

返回：[[Harness 知识地图]]

---

答对了！🎉 **B 是正确答案。**

模型只是提出 `read_file` 调用请求，真正读取文件的是 Harness 中的工具执行器。Harness 还需要检查工具是否存在、参数是否合法，以及当前操作是否获得授权。

这也符合 OpenAI 对 Agent Loop 的描述：模型请求工具后，由运行器执行工具、将结果追加到对话，再继续调用模型，直到满足结束条件。<Cite refs={["turn814349search0","turn814349search8"]}/>

接下来进入第二课。我们不光讲概念，还要亲手设计一个可以扩展的 Tool Runtime。

# 第二课：Tool Runtime 的设计与实现

## 一、先理解 Tool Runtime 解决什么问题

假设模型能使用三个工具：

- `read_file`：读取文件。
- `write_file`：写入文件。
- `run_command`：执行终端命令。

如果把所有工具的判断和执行代码都写进 Agent Loop，会很快变成这样：

```typescript
if (call.name === "read_file") {
  // 读取文件
} else if (call.name === "write_file") {
  // 写入文件
} else if (call.name === "run_command") {
  // 执行命令
}
```

刚开始没问题，但当工具增加到几十个、上百个时，Agent Loop 就会越来越难维护。

**Tool Runtime 的核心任务，就是把工具的定义、注册、校验、授权和执行统一管理起来。**

它通常包含下面几个部分：

<box border radius="xl" padding={3} gap={2} align="center">
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **模型输出 Tool Call**
    <text color="secondary" size="sm">name + arguments + call ID</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **Tool Registry**
    <text color="secondary" size="sm">根据工具名称查找定义</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **Schema Validator**
    <text color="secondary" size="sm">检查参数类型、必填字段和约束</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **Policy / Approval**
    <text color="secondary" size="sm">检查权限，必要时请求用户批准</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="#173D35" theme="dark" radius="lg" padding={3} width="100%" align="center">
    **Tool Executor**
    <text size="sm">执行函数，捕获错误，生成统一结果</text>
  </box>
</box>

注意，这是一种推荐的架构划分，不是所有 Agent 都必须严格使用相同的模块边界。

## 二、先设计一个统一的 Tool 接口

我们先用 TypeScript 实现。后面再把它接到 Go Runtime、MCP 和 Skills 上。

一个工具至少需要四样东西：

| 字段 | 作用 |
|---|---|
| `name` | 唯一标识，例如 `read_file` |
| `description` | 告诉模型这个工具能做什么 |
| `parameters` | 定义工具接受哪些参数 |
| `execute` | 真正执行操作的函数 |

此外，实际工程还应该有权限策略、超时、调用 ID、日志和执行结果规范。

先安装参数校验库 Zod：

```bash
pnpm add zod
pnpm add -D tsx typescript @types/node
```

建议项目结构如下：

```text
harness-demo/
├── src/
│   └── runtime/
│       ├── types.ts
│       ├── registry.ts
│       ├── executor.ts
│       └── tools/
│           └── read-file.ts
├── workspace/
│   └── hello.go
└── package.json
```

## 三、第一步：定义工具的类型

文件：`src/runtime/types.ts`

```typescript
import { z } from "zod";

export interface ToolContext {
  workspace: string;
  signal?: AbortSignal;
}

export interface ToolDefinition<
  S extends z.ZodType = z.ZodType,
> {
  name: string;
  description: string;
  parameters: S;

  execute: (
    args: z.infer<S>,
    context: ToolContext,
  ) => Promise<unknown> | unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  ok: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

这里有个很值得理解的设计：`ToolDefinition` 使用泛型 `S`，使参数 Schema 和执行函数的参数类型关联起来。

例如，一个工具要求：

```typescript
z.object({
  path: z.string(),
});
```

那么 `execute` 中的 `args.path` 就会被 TypeScript 识别为字符串，而不需要手工重复定义参数类型。

**Schema 不仅是给模型看的参数描述，也是 Runtime 校验实际输入的依据。**

不过，类型检查只发生在编译阶段，模型传来的 JSON 仍然必须在运行时验证。

## 四、第二步：实现 Tool Registry

文件：`src/runtime/registry.ts`

```typescript
import type { ToolDefinition } from "./types";

export class ToolRegistry {
  private readonly tools = new Map<
    string,
    ToolDefinition
  >();

  register(tool: ToolDefinition): void {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`);
    }

    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  definitions() {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    }));
  }
}
```

上面的 `zodToJsonSchema` 是一个待实现的转换函数。实际项目里，可以使用 `zod-to-json-schema`，或者使用支持 Zod 的 Schema 转换方案。为避免版本差异，下面先把注册与执行机制讲清楚。

为什么要单独设计 Registry？

因为模型可以提出任意工具名称，但它不能通过报出一个名字，就让 Runtime 自动执行任意函数。

例如模型返回：

```json
{
  "name": "delete_database",
  "arguments": {}
}
```

如果 Registry 里没有这个工具，Runtime 就应该拒绝执行，而不是尝试动态寻找函数。

还有一个重要原则：**给模型暴露的工具列表，应该只是当前任务获准使用的工具子集，而不是整个服务器上所有可调用的函数。**

## 五、第三步：编写一个真正的工具

我们实现一个 `read_file`，但不允许它读取工作目录之外的文件。

文件：`src/runtime/tools/read-file.ts`

```typescript
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { ToolDefinition } from "../types";

export const readFileTool: ToolDefinition<
  typeof readFileSchema
> = {
  name: "read_file",
  description: "Read a UTF-8 text file inside the workspace.",

  parameters: readFileSchema,

  async execute({ path: filePath }, context) {
    if (context.signal?.aborted) {
      throw new Error("Operation cancelled");
    }

    const root = await realpath(context.workspace);
    const target = await realpath(
      path.resolve(root, filePath),
    );

    const relative = path.relative(root, target);

    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error("Path is outside the workspace");
    }

    const content = await readFile(target, "utf8");

    return {
      path: relative,
      content,
    };
  },
};

const readFileSchema = z.object({
  path: z.string().min(1).max(500),
}).strict();
```

这段代码展示了两个重要原则：

1. **输入必须经过校验。** `.strict()` 会拒绝 Schema 未声明的额外字段。
2. **不能只相信模型提供的路径。** 通过解析真实路径，可以阻止常见的 `../../` 路径穿越攻击。

注意：这仍然不是完整的安全沙箱。文件可能在校验后被替换，符号链接可能引入竞态；生产级系统还需要操作系统级隔离或安全的文件访问机制。`AbortSignal` 在这里也只是检查取消状态，尚未实现对底层文件读取的强制取消。

## 六、第四步：实现统一执行器

这是 Tool Runtime 的关键模块。

文件：`src/runtime/executor.ts`

```typescript
import type {
  ToolCall,
  ToolContext,
  ToolResult,
} from "./types";

import { ToolRegistry } from "./registry";

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
  ) {}

  async execute(
    call: ToolCall,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.registry.get(call.name);

    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        ok: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Unknown tool: ${call.name}`,
        },
      };
    }

    try {
      const args = tool.parameters.parse(call.arguments);

      const output = await tool.execute(args, context);

      return {
        toolCallId: call.id,
        name: call.name,
        ok: true,
        output,
      };
    } catch (error) {
      return {
        toolCallId: call.id,
        name: call.name,
        ok: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Unknown error",
        },
      };
    }
  }
}
```

这里有三件事值得特别关注：

- 工具名称必须先经过 Registry 查询。
- 参数必须先经过 Schema 校验。
- 工具失败时返回统一的错误结果，而不是让整个 Agent Loop 意外崩溃。

在生产环境中，还应该把参数校验错误与工具执行错误区分开，增加超时、授权、错误脱敏和执行审计。对于敏感工具，不能把所有异常原样返回给模型，否则可能泄露服务器路径、凭据或内部实现信息。

另外，`execute` 的错误捕获不能代替权限控制。真正执行写文件、删文件或运行 Shell 之前，还需要专门的 Policy Engine。

## 七、把它们组合起来运行

先创建一个工作目录和测试文件：

```bash
mkdir -p workspace
echo 'package main' > workspace/hello.go
```

然后创建 `src/demo.ts`：

```typescript
import path from "node:path";

import { ToolRegistry } from "./runtime/registry";
import { ToolExecutor } from "./runtime/executor";
import { readFileTool } from "./runtime/tools/read-file";

const registry = new ToolRegistry();
registry.register(readFileTool);

const executor = new ToolExecutor(registry);

const result = await executor.execute(
  {
    id: "call_001",
    name: "read_file",
    arguments: {
      path: "hello.go",
    },
  },
  {
    workspace: path.resolve("workspace"),
  },
);

console.log(JSON.stringify(result, null, 2));
```

运行前，需要在 `registry.ts` 中补上 Schema 转换的实现。你也可以先暂时删除未使用的 `definitions()` 方法，只验证 Registry 和 Executor 的运行流程。

预期的执行结果类似：

```json
{
  "toolCallId": "call_001",
  "name": "read_file",
  "ok": true,
  "output": {
    "path": "hello.go",
    "content": "package main\n"
  }
}
```

此时我们已经有了一个脱离模型也能独立测试的 Tool Runtime。

这非常重要：**工具执行层不应该依赖模型才能工作。** 你可以直接用单元测试验证它的参数校验、权限拒绝和错误处理，然后再将它接入 Agent Loop。

## 八、再往前走一步：Tool Call 不等于普通函数调用

模型输出工具调用后，Harness 还要考虑执行结果如何返回模型。

例如：

<box border radius="lg" padding={3} gap={2}>
  <text color="secondary" size="sm">模型发出的请求</text>
  <text preserveWhitespace>{`name: read_file
arguments: {"path":"hello.go"}
call_id: call_001`}</text>
  <divider color="subtle"/>
  <text color="secondary" size="sm">Runtime 执行结果</text>
  <text preserveWhitespace>{`toolCallId: call_001
ok: true
output: {"content":"package main\\n"}`}</text>
  <divider color="subtle"/>
  <text color="secondary" size="sm">Harness 下一步</text>
  将工具结果按照所用模型 API 的协议写回消息历史，再请求模型继续工作。
</box>

为什么要保留 `toolCallId`？

因为一次模型响应可能包含多个工具调用。Harness 必须把每个结果关联到正确的调用，不能把一个工具的输出错配给另一个工具。OpenAI 的 Agent Runner 也会把工具调用结果追加到对话中，再继续执行循环。<Cite refs={["turn814349search0","turn786831view1"]}/>

## 九、这一课真正要掌握的架构原则

到这里，你应该能够区分三个层次：

- **Tool Definition**：描述工具的能力、参数与执行函数。
- **Tool Runtime**：注册、校验、授权并执行工具。
- **Agent Loop**：决定何时调用工具、何时把结果交回模型、何时结束任务。

接下来，我们会进入 Harness 工程里一个更棘手的问题：多个工具同时被模型调用时，究竟应该串行执行还是并行执行？如果某个工具超时、用户取消任务，或者一个工具修改了另一个工具正在读取的文件，又该怎么处理？

这就是下一节 **Tool Runtime 的并发、超时与权限控制** 要解决的问题。
