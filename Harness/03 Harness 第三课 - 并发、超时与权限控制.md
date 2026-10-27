---
title: "03 Harness 第三课 - 并发、超时与权限控制"
aliases:
  - "Harness 第三课 - 并发、超时与权限控制"
tags:
  - harness
  - ai-agent
  - verbatim
  - agent-loop
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "e8f98fa1-1514-43b2-bb4c-d019dd79912a"
source_turn_id: "bbb2197d-53cc-4d71-a5b8-3620cc3d7c34"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：03  
> 原始章节：原回答完整内容  
> 合并消息 ID：`e8f98fa1-1514-43b2-bb4c-d019dd79912a`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一节
> ~~~

返回：[[Harness 知识地图]]

---

# 第三课：Tool Runtime 的并发、超时与权限控制

上一课，我们已经实现了 Tool Registry 和 Tool Executor。现在要解决的，是一个真正的 Agent 在执行任务时必然会遇到的问题：

**当模型一次提出多个工具调用时，Harness 应该怎么安全、高效地执行它们？**

我们继续用 TypeScript 学习，后面再把这些设计映射到 Go。

## 一、串行执行还是并行执行？

假设你让 Coding Agent 分析一个 Go 项目，模型一次返回三个工具调用：

- `read_file("main.go")`
- `read_file("go.mod")`
- `run_command("go test ./...")`

最简单的实现是串行执行：

```typescript
for (const call of toolCalls) {
  await executor.execute(call, context);
}
```

它的优点是简单，缺点是执行时间可能比较长。

假设三个操作分别耗时 2 秒、1 秒、5 秒：

<box border radius="xl" padding={3} gap={3}>
  **串行执行**
  <text color="secondary" size="sm">前一个执行完，才开始下一个。</text>
  <box gap={1}>
    {#each [{name:"read_file(main.go)",start:0,duration:2},{name:"read_file(go.mod)",start:2,duration:1},{name:"go test ./...",start:3,duration:5}] as task}
      <row key={task.name} align="center" gap={2}>
        <box width="138px">
          <text size="xs">{task.name}</text>
        </box>
        <box flex="1" background="surface-secondary" height="22px" radius="sm" clip>
          <box background="#64748b" height="22px" width={`${task.duration/8*100}%`} padding={{x:1}} align="center" justify="center">
            <text color="#ffffff" size="xs">{task.duration}s</text>
          </box>
        </box>
      </row>
    {/each}
  </box>
  <text color="secondary" size="sm">总耗时约 8 秒（假设没有额外开销）。</text>
  <divider/>
  **并行执行**
  <text color="secondary" size="sm">互不冲突的操作可以同时启动。</text>
  <box gap={1}>
    {#each [{name:"read_file(main.go)",duration:2},{name:"read_file(go.mod)",duration:1},{name:"go test ./...",duration:5}] as task}
      <row key={task.name} align="center" gap={2}>
        <box width="138px">
          <text size="xs">{task.name}</text>
        </box>
        <box flex="1" background="surface-secondary" height="22px" radius="sm" clip>
          <box background="#0f766e" height="22px" width={`${task.duration/5*100}%`} padding={{x:1}} align="center" justify="center">
            <text color="#ffffff" size="xs">{task.duration}s</text>
          </box>
        </box>
      </row>
    {/each}
  </box>
  <text color="secondary" size="sm">理想情况下总耗时约 5 秒，即最慢操作的耗时。</text>
</box>

但是，**并不是模型一次返回的所有工具调用都可以安全地并行执行。**

例如：

- 两个 `read_file` 通常可以并行。
- 两个互不相关的文件写入，可能可以并行。
- `write_file("main.go")` 和 `read_file("main.go")` 同时执行，可能读到旧内容或产生竞态。
- 两个 `run_command` 如果同时操作 Git 索引或共享数据库，也可能相互干扰。

因此，Harness 必须同时考虑效率与执行安全。

## 二、实现一个受控的并发执行器

先看一个常见错误：直接使用 `Promise.all()`。

```typescript
const results = await Promise.all(
  toolCalls.map((call) => executor.execute(call, context)),
);
```

这段代码会立即启动所有操作。假如模型一次提出 100 个工具调用，就可能同时创建 100 个任务。

更好的方式是设置并发上限。

下面实现一个简单的并发调度器：

```typescript
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, () => runWorker()),
  );

  return results;
}
```

调用方式：

```typescript
const results = await mapWithConcurrency(
  toolCalls,
  3,
  (call) => executor.execute(call, context),
);
```

这里的 `3` 表示最多同时执行三个工具调用。

这个实现有三个特点：

1. 并发数量受到限制，不会一次启动所有任务。
2. 结果数组保持输入顺序，即使任务完成顺序不同。
3. 单个任务抛出未捕获异常时，整体 Promise 会失败；已经启动的其他任务并不会自动取消。

第三点非常重要。在 Harness 中，我们通常希望单个工具失败只影响对应的调用，而不是让整个批次意外崩溃。上一课的 Executor 已经把工具异常转换为 `ToolResult`，所以这里可以直接复用。

不过，这个调度器只解决**并发数量**，并没有解决**操作之间的冲突**。

## 三、真正困难的问题：工具之间的竞争

假设模型同时要求：

```text
call_1: write_file("config.json")
call_2: read_file("config.json")
```

如果两个操作同时执行，读取结果取决于实际执行顺序。更复杂的情况是，两个工具分别修改同一个文件，后写入的操作可能覆盖前一个操作的结果。

这类问题叫作 Race Condition（竞态条件）。

因此，生产级 Harness 通常需要两层控制：

<box border radius="xl" padding={3} gap={2}>
  <box background="surface-secondary" radius="lg" padding={3} gap={1}>
    **第一层：并发限制**
    <text size="sm">限制同时执行多少个任务，避免资源耗尽。</text>
  </box>
  <box align="center"><icon name="arrow-down" color="secondary" size="lg"/></box>
  <box background="surface" border radius="lg" padding={3} gap={1}>
    **第二层：冲突控制**
    <text size="sm">检查任务是否共享资源、是否有读写依赖，决定哪些任务必须串行。</text>
  </box>
</box>

冲突控制可以从简单的资源锁开始，例如为每个文件建立读写锁；再进一步，可以给工具声明资源访问范围和副作用类型。

| 工具类型 | 典型策略 |
|---|---|
| 读取不同文件 | 通常允许并行 |
| 读取同一文件 | 通常允许并行，但要考虑外部修改 |
| 写入同一文件 | 默认串行 |
| 读写同一文件 | 需要协调顺序 |
| 执行任意 Shell 命令 | 默认谨慎，不能只凭工具名称判断是否安全 |

注意：不能只用 `readOnly: true` 就认定工具绝对安全。一个看似只读的 Shell 命令，也可能通过其他程序修改文件。

## 四、工具超时：模型不能一直等下去

再看另一个常见问题。

模型调用 `run_command("go test ./...")`，但是测试卡住了。没有超时机制的话，这个工具可能一直占用资源，导致 Agent 无法继续。

我们可以先给每次调用设置一个超时信号：

```typescript
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();

      reject(new Error("TOOL_TIMEOUT"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation(controller.signal),
      timeout,
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
```

使用示例：

```typescript
const result = await withTimeout(
  (signal) =>
    runCommand(["go", "test", "./..."], { signal }),
  30_000,
);
```

这里有一个非常容易踩的坑：

**`Promise.race()` 超时，只能保证调用方停止等待；它本身不能保证底层操作已经停止。**

所以 `runCommand` 必须真正支持取消。例如，Node.js 中可以把 `AbortSignal` 传给子进程管理逻辑，在超时时终止进程，并处理子进程的退出事件。

对于 Shell 工具，还要考虑整个进程树：只杀死父进程，未必能结束它启动的所有子进程。在 Linux 上，生产实现通常需要结合进程组、容器或其他隔离机制。

另外，工具超时后也不能直接假定操作没有产生副作用。比如一次写文件操作可能已经完成写入，只是结果尚未返回。

因此，重试前还要判断操作是否幂等，避免重复执行产生破坏。

## 五、权限控制：模型提出请求，不代表可以执行

这是 Harness Engineering 中最值得重视的设计之一。

假设模型提出：

```json
{
  "name": "run_command",
  "arguments": {
    "command": "rm -rf ./"
  }
}
```

即使这个工具已经注册、参数完全合法，也不意味着 Harness 应该执行它。

这里要区分三件事：

- **注册**：这个工具存在吗？
- **校验**：参数符合要求吗？
- **授权**：当前任务允许执行这个操作吗？

三者不能混为一谈。

### 设计一个 Policy Engine

我们可以先设计简单的策略接口：

```typescript
type ToolPolicyInput = {
  toolName: string;
  arguments: unknown;
  workspace: string;
};

type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

interface PolicyEngine {
  authorize(
    input: ToolPolicyInput,
  ): Promise<PolicyDecision>;
}
```

执行器应该在工具执行前检查授权：

```typescript
const decision = await policy.authorize({
  toolName: call.name,
  arguments: args,
  workspace: context.workspace,
});

if (!decision.allowed) {
  return {
    toolCallId: call.id,
    name: call.name,
    ok: false,
    error: {
      code: "PERMISSION_DENIED",
      message: decision.reason,
    },
  };
}

// 获得授权后，才能执行工具
const output = await tool.execute(args, context);
```

这段代码展示了调用顺序，实际整合时应将它放入上一课的 `ToolExecutor.execute()` 中，并且把授权错误与工具执行错误分开处理。

在真实的 Coding Harness 中，策略通常还会考虑：

- 工具是否只读，还是会修改外部状态。
- 操作是否超出允许的工作目录。
- 是否涉及网络访问、凭据或敏感文件。
- 是否需要用户审批。
- 当前会话是否已经授权过同类操作。

**用户审批不是沙箱。** 审批负责决定是否允许执行，沙箱负责限制获准操作实际能触及的资源，两者需要配合。

## 六、把这三种能力放进完整的执行流程

现在，我们可以将工具执行的核心流程概括为：

<box border radius="xl" padding={3} align="center" gap={1}>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **接收 Tool Call**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **查找工具 + 校验参数**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **检查权限与资源冲突**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **在并发限制内执行**
    <text color="secondary" size="sm">设置超时、监听取消信号</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="#173D35" theme="dark" radius="lg" padding={3} width="100%" align="center">
    **返回统一 Tool Result**
    <text size="sm">成功、执行失败、超时或权限拒绝</text>
  </box>
</box>

还有一点：工具执行结果需要被视为不可信数据。工具可能读取到恶意文件内容，或者命令输出中包含试图诱导模型泄露秘密的指令。Harness 应将这些内容作为工具结果传递，而不能把它们提升为可信的系统指令。

## 七、来做一个架构判断题

{@body const [answer,setAnswer] = DIL.useState("C")}
{@body const [submitted,setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景：** 模型在同一轮请求中提出三个工具调用：

  - A：读取 `main.go`
  - B：读取 `go.mod`
  - C：执行 `go test ./...`

  假设 A、B 只读取文件，C 会编译和运行项目测试。当前没有额外的文件锁，也无法保证测试不会修改项目文件。

  你认为 Harness 最合理的默认策略是什么？

  <radio-group value={answer} onChange={(v) => {setAnswer(v);setSubmitted(false)}} direction="col">
    <radio value="A">A. 所有工具必须串行执行，因为并行总是不安全。</radio>
    <radio value="B">B. 三个工具始终并行，因为模型已经决定了调用顺序。</radio>
    <radio value="C">C. 依据资源访问和副作用判断是否并行；无法确认安全时采取保守策略。</radio>
    <radio value="D">D. 只检查参数是否合法，不需要考虑工具之间的影响。</radio>
  </radio-group>
  <button block onClick={() => {setSubmitted(true);GenUI.issueNewTurn("Harness 第三课架构判断题，我选择 "+answer+"。请批改答案，并继续讲解工具冲突控制与 Go 中的实现。")}}>提交答案</button>
  {#if submitted}
    <text color="secondary" size="sm">已提交，下一条回复会批改并继续讲解。</text>
  {/if}
</box>

下一课我们会深入研究**工具冲突控制、任务取消，以及如何用 Go 的 goroutine、context.Context 和 semaphore 实现相同的 Runtime**。这会把你已经掌握的 Agent Loop 与更接近生产环境的 Harness 工程连接起来。
