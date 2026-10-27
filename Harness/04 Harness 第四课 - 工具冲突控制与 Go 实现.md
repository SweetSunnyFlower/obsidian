---
title: "04 Harness 第四课 - 工具冲突控制与 Go 实现"
aliases:
  - "Harness 第四课 - 工具冲突控制与 Go 实现"
tags:
  - harness
  - ai-agent
  - verbatim
  - agent-loop
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "10253f75-9395-4a5b-94c6-96822c59decb"
source_turn_id: "bbb212b8-aab1-4512-a0ce-e4e0bba9b93b"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：04  
> 原始章节：原回答完整内容  
> 合并消息 ID：`10253f75-9395-4a5b-94c6-96822c59decb`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第三课架构判断题，我选择 C。请批改答案，并继续讲解工具冲突控制与 Go 中的实现。
> ~~~

返回：[[Harness 知识地图]]

---

答对了！🎯 **C 是最合理的选择。**

Harness 不能只看模型一次返回了多少个工具调用，还必须考虑工具之间的依赖关系、共享资源和副作用。如果无法确认并发执行是安全的，就应该采用保守策略。

这也是从“能跑的 Agent”走向“可靠的 Agent”的一个关键转折点。

# 第四课：工具冲突控制与 Go Runtime 实现

这一课我们用 Go 来实现。你熟悉 Go 后端开发，所以重点放在架构设计、并发原语和 Harness 的实际运行机制上。

学完之后，你应该能够回答三个问题：

1. 如何判断两个工具能否并行执行？
2. 如何避免多个工具同时修改同一个文件？
3. 如何用 `context.Context`、goroutine 和 semaphore 构建受控的 Tool Runtime？

## 一、为什么限制并发数还不够？

上一课我们实现了并发上限，例如最多同时运行 3 个工具。

```go
sem := make(chan struct{}, 3)
```

这只能限制同时执行的任务数量，不能保证任务之间没有冲突。

假设模型提出两个工具调用：

<box border radius="xl" padding={3} gap={3}>
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="file-pen" size="lg"/>
      **工具 A：write_file**
    </row>
    <text color="secondary" size="sm">把 config.json 改成新的配置。</text>
  </box>
  <divider color="subtle"/>
  <box gap={1}>
    <row align="center" gap={2}>
      <icon name="file-search" size="lg"/>
      **工具 B：read_file**
    </row>
    <text color="secondary" size="sm">读取 config.json，检查配置内容。</text>
  </box>
  <divider color="subtle"/>
  <text color="secondary" size="sm">如果两者同时执行，B 可能读到旧内容、部分写入的内容，或者新内容。结果取决于底层实现。</text>
</box>

因此，我们需要区分两个概念：

- **Concurrency Limit（并发上限）**：限制有多少任务同时运行。
- **Conflict Control（冲突控制）**：决定哪些任务可以同时访问同一个资源。

前者解决资源占用问题，后者解决正确性问题。

## 二、Harness 如何知道工具之间是否冲突？

一个重要设计是：让工具声明自己会访问哪些资源，以及访问方式是什么。

例如：

| 工具 | 资源 | 访问模式 |
|---|---|---|
| `read_file("main.go")` | `file:main.go` | 读 |
| `read_file("go.mod")` | `file:go.mod` | 读 |
| `write_file("main.go")` | `file:main.go` | 写 |
| `run_command("go test ./...")` | 项目工作区 | 未知副作用 |

这里可以建立一套简单规则：

- 同一个资源的多个读操作，可以并行。
- 同一个资源的写操作，默认互斥。
- 同一资源的读和写，默认互斥。
- 资源范围不明确的操作，例如任意 Shell 命令，采取更保守的策略。

最后一条尤其重要：不能仅凭工具名称推断它是否安全。`go test` 通常会读取源码、编译并执行测试，但测试代码也可能写文件、访问数据库或发起网络请求。

## 三、先设计资源访问模型

在 Go 中，我们可以定义工具调用的资源声明：

```go
package harness

type AccessMode int

const (
    Read AccessMode = iota
    Write
)

type ResourceAccess struct {
    Key  string
    Mode AccessMode
}

type ToolCall struct {
    ID        string
    Name      string
    Arguments map[string]any
}

type ToolPlan struct {
    Call      ToolCall
    Resources []ResourceAccess
}
```

例如，一个读取文件的工具可以声明：

```go
ToolPlan{
    Call: ToolCall{
        ID:   "call_1",
        Name: "read_file",
    },
    Resources: []ResourceAccess{
        {
            Key:  "file:main.go",
            Mode: Read,
        },
    },
}
```

写入同一个文件时，声明为：

```go
Resources: []ResourceAccess{
    {
        Key:  "file:main.go",
        Mode: Write,
    },
}
```

这样，调度器不需要理解每个工具的业务逻辑，只需要根据资源声明决定是否存在冲突。

但有一个前提：**资源声明必须可信，不能直接把模型提供的字符串当作安全依据。**

例如，模型可能用不同路径表示同一个文件：

```text
main.go
./main.go
src/../main.go
```

如果资源键没有经过路径规范化，就可能漏掉冲突。真实实现需要根据工具的执行环境，将路径解析成规范化的资源标识。

## 四、实现一个 Go 资源锁管理器

这里采用 `sync.RWMutex`：

- `RLock()`：允许多个读取者同时访问。
- `Lock()`：写入者独占访问。
- 读写互斥。

文件：`resource_locker.go`

```go
package harness

import "sync"

type ResourceLocker struct {
    mu    sync.Mutex
    locks map[string]*sync.RWMutex
}

func NewResourceLocker() *ResourceLocker {
    return &ResourceLocker{
        locks: make(map[string]*sync.RWMutex),
    }
}

func (l *ResourceLocker) get(key string) *sync.RWMutex {
    l.mu.Lock()
    defer l.mu.Unlock()

    if lock, ok := l.locks[key]; ok {
        return lock
    }

    lock := &sync.RWMutex{}
    l.locks[key] = lock
    return lock
}

func (l *ResourceLocker) Acquire(
    accesses []ResourceAccess,
) func() {
    // 合并重复资源声明：
    // 同一工具既读又写同一资源时，按写操作处理。
    modes := make(map[string]AccessMode)

    for _, access := range accesses {
        old, exists := modes[access.Key]
        if !exists || access.Mode == Write || old == Write {
            modes[access.Key] = Write
        } else {
            modes[access.Key] = Read
        }
    }

    // 固定排序，防止多资源锁之间发生死锁。
    keys := make([]string, 0, len(modes))
    for key := range modes {
        keys = append(keys, key)
    }

    sort.Strings(keys)

    locks := make([]*sync.RWMutex, 0, len(keys))

    for _, key := range keys {
        lock := l.get(key)

        if modes[key] == Write {
            lock.Lock()
        } else {
            lock.RLock()
        }

        locks = append(locks, lock)
    }

    return func() {
        // 按获取锁的反方向释放。
        for i := len(keys) - 1; i >= 0; i-- {
            if modes[keys[i]] == Write {
                locks[i].Unlock()
            } else {
                locks[i].RUnlock()
            }
        }
    }
}
```

这段代码还需要导入：

```go
import "sort"
```

现在，你就拥有了一个简单的资源锁管理器。

但要特别注意：这个版本是教学实现，还存在工程上的限制。

1. `RWMutex` 的加锁操作不能直接响应 `context.Context` 取消。
2. `locks` 中的锁会一直保留，需要考虑资源键数量增长带来的内存占用。
3. 它只能协调共享同一个 `ResourceLocker` 实例的调用，不能自动协调其他进程或服务器。
4. 资源锁不能代替操作系统级沙箱，也无法自动检测未声明的副作用。

对于生产级 Runtime，如果任务可能长期等待资源锁，就应采用可取消的锁获取机制，或者由统一调度器控制资源占用。

## 五、并发执行时，如何处理同一批工具之间的冲突？

这里有一个很容易忽略的问题。

假设模型同一轮返回：

```text
1. write_file("config.json")
2. read_file("config.json")
```

即使我们给两个操作加锁，也只能保证它们不会同时访问文件，**不能保证写操作一定先于读操作执行**。

如果读操作先获得锁，它仍然可能读到旧数据。

因此，对于同一轮模型输出的工具调用，我们可以采用一种简单而安全的策略：

- 如果所有调用都没有资源冲突，就允许并行。
- 如果存在冲突，就按照模型返回的顺序串行执行这一批调用。

这是一个适合初版 Harness 的保守策略。后续可以再实现依赖图调度，让无冲突的调用并行，有依赖的调用按顺序执行。

下面是一个冲突检测函数：

```go
func HasConflict(a, b []ResourceAccess) bool {
    for _, left := range a {
        for _, right := range b {
            if left.Key != right.Key {
                continue
            }

            // 同一资源：只要其中一个操作是写，就存在冲突。
            if left.Mode == Write || right.Mode == Write {
                return true
            }
        }
    }

    return false
}
```

在调度一批工具调用时：

```go
func HasBatchConflict(plans []ToolPlan) bool {
    for i := 0; i < len(plans); i++ {
        for j := i + 1; j < len(plans); j++ {
            if HasConflict(
                plans[i].Resources,
                plans[j].Resources,
            ) {
                return true
            }
        }
    }

    return false
}
```

调度逻辑可以先写成：

```go
if HasBatchConflict(plans) {
    // 保守策略：整批串行，并按原始顺序执行。
    for _, plan := range plans {
        result := executePlan(ctx, plan)
        results = append(results, result)
    }
} else {
    // 没有已知冲突，可以进入受控并发执行。
    results = executePlansConcurrently(ctx, plans)
}
```

这里的 `executePlan` 和 `executePlansConcurrently` 是待实现的调度函数。

还有个重要边界：如果工具的副作用未知，应该将它声明为访问工作区等较大范围资源的独占操作，而不是给它一个空的资源列表。否则调度器会错误地认为它与其他工具没有冲突。

## 六、Go 中的并发上限与取消机制

现在来看另一个核心原语：`context.Context`。

在 Go 的 Harness 中，Context 通常贯穿一次任务的整个生命周期，用于传递取消信号和截止时间。

我们可以使用带缓冲的 Channel 实现一个简单的 semaphore。

```go
package harness

import (
    "context"
    "errors"
)

var ErrToolTimeout = errors.New("tool timeout")

type Semaphore chan struct{}

func NewSemaphore(limit int) Semaphore {
    if limit < 1 {
        panic("limit must be positive")
    }

    return make(chan struct{}, limit)
}

func (s Semaphore) Acquire(ctx context.Context) error {
    select {
    case s <- struct{}{}:
        // 防止等待期间 Context 已取消，却刚好取得了令牌。
        if err := ctx.Err(); err != nil {
            <-s
            return err
        }

        return nil

    case <-ctx.Done():
        return ctx.Err()
    }
}

func (s Semaphore) Release() {
    <-s
}
```

调用方式：

```go
sem := NewSemaphore(3)

func executeWithLimit(
    ctx context.Context,
    call ToolCall,
) error {
    if err := sem.Acquire(ctx); err != nil {
        return err
    }
    defer sem.Release()

    return executeTool(ctx, call)
}
```

这里的 `executeTool` 是你的实际工具执行函数。

这段代码的核心价值是：如果当前已经有三个工具在运行，第四个工具就必须等待；等待期间，如果任务被取消，它可以及时退出，而不是无限等待资源。

### 给工具设置截止时间

Go 可以直接使用 `context.WithTimeout`：

```go
func executeWithTimeout(
    parent context.Context,
    call ToolCall,
) error {
    ctx, cancel := context.WithTimeout(
        parent,
        30*time.Second,
    )
    defer cancel()

    return executeTool(ctx, call)
}
```

还需要导入：

```go
import "time"
```

但要注意：**Context 取消是协作式的，不会自动杀死任意 Go 函数。**

工具必须主动检查 `ctx.Done()`，或者把 Context 传递给支持取消的 API。例如：

- HTTP 请求：使用 `http.NewRequestWithContext`。
- 数据库操作：使用支持 Context 的查询接口。
- 长时间循环：定期检查 `ctx.Err()`。
- 外部 Shell 命令：使用 `exec.CommandContext`，并进一步考虑进程组与子进程清理。

如果工具忽略 Context，单纯调用 `cancel()` 并不能保证它停止运行。

## 七、把它们组合成一个 Harness 调度流程

现在，我们已经有了三种重要能力：

- `Semaphore`：限制并发数。
- `ResourceLocker`：协调共享资源的读写。
- `context.Context`：管理取消与截止时间。

接下来应该将它们放进一个统一的调度流程中。

<box border radius="xl" padding={3} align="center" gap={1}>
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **接收一批 Tool Calls**
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **生成可信的资源访问计划**
    <text color="secondary" size="sm">规范化路径，识别读写范围与副作用</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **构建依赖关系**
    <text color="secondary" size="sm">冲突任务排序，无冲突任务允许并行</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box background="#173D35" theme="dark" radius="lg" padding={3} width="100%" align="center">
    **受控执行**
    <text size="sm">并发上限 + 资源锁 + 权限审批 + 超时取消</text>
  </box>
  <icon name="arrow-down" color="secondary" size="lg"/>
  <box border radius="lg" padding={3} width="100%" align="center">
    **汇总结果，交回 Agent Loop**
    <text color="secondary" size="sm">成功、失败、超时、拒绝和取消均有明确状态</text>
  </box>
</box>

这才是 Tool Runtime 的完整设计思路。

这里再强调一个工程原则：**不要让模型自己决定权限，也不要完全相信模型声明的资源访问范围。** 工具的实际能力、资源访问规则和权限边界必须由 Harness 及其执行环境控制。

## 八、这一课之后，你应该形成什么认知？

我们从最初的 `executeTool()`，逐步扩展到了：

| 能力 | 解决的问题 |
|---|---|
| Registry | 工具是否存在 |
| Schema Validation | 参数是否合法 |
| Policy Engine | 操作是否获准 |
| Semaphore | 同时运行多少任务 |
| Resource Lock | 共享资源如何协调 |
| Context | 如何取消任务 |
| Timeout | 如何限制执行时长 |
| Scheduler | 如何安排工具的执行顺序 |

这些模块并不是必须拆成七八个独立服务。对于初版 Harness，它们完全可以是同一个 Go 进程里的几个组件。关键是职责清晰、接口明确，方便以后扩展。

---

## 九、下一课：Context Engineering 与上下文管理

我们已经解决了工具如何执行，接下来需要回答一个更根本的问题：

**当 Agent 连续工作几十轮、调用了上百次工具后，它怎么保证模型仍然知道自己正在做什么？**

例如，Coding Agent 已经：

- 读取了 20 个文件。
- 执行了 15 次终端命令。
- 修改了 6 个文件。
- 收到了大量测试输出。

如果把所有内容都无脑塞进模型请求，不仅成本越来越高，还可能超过模型的上下文窗口，甚至让关键指令淹没在大量工具输出中。

下一课我们将学习：

1. Context Window、Token Budget 和上下文预算。
2. 对话历史为什么不能无限增长。
3. 消息裁剪与 Context Compaction 的区别。
4. 如何设计 Harness 的上下文压缩与恢复机制。
5. 如何区分对话历史、任务状态、项目记忆和 Skills。

这一部分会直接影响你以后实现 Pi、Codex 或 Claude Code 风格的长任务 Agent。


