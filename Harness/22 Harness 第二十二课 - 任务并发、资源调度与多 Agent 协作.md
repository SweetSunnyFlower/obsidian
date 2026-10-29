---
title: "Harness 第二十二课 - 任务并发、资源调度与多 Agent 协作"
aliases:
  - "Harness 第二十二课 - 任务并发、资源调度与多 Agent 协作"
tags:
  - harness
  - ai-agent
  - verbatim
  - concurrency
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "1fa7dd38-840e-4769-9d60-555d2daf2690"
source_user_message_id: "3024ebbc-0743-44bc-8a1d-8c79be684487"
source_content_sha256: "dcde7d1f6c5ecd77c9c8e89a6270f90ea4a861e402cebb7a7c748515e96887f0"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：22  
> 原始章节：Harness 第二十二课：任务并发、资源调度与多 Agent 协作  
> 合并消息 ID：`1fa7dd38-840e-4769-9d60-555d2daf2690`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一节
> ~~~

返回：[[Harness 知识地图]]

---

继续！上一课我们学习了 Coding Harness 的安全边界与纵深防御。今天进入第二十二课：**任务并发、资源调度与多 Agent 协作**。

这节课要解决一个很实际的问题：当你开发的 Coding Harness 可以同时运行多个任务，甚至让多个 Agent 一起修改同一个项目时，怎么保证它们不会互相覆盖代码、重复执行操作，或者把一个本来简单的任务搞得更复杂？

# Harness 第二十二课：任务并发、资源调度与多 Agent 协作

## 一、为什么不能简单地启动多个 Agent？

假设用户要求：

> 重构用户模块，补充单元测试，并优化数据库查询。

你决定启动三个 Agent：

- Agent A：修改用户服务。
- Agent B：编写用户模块测试。
- Agent C：优化数据库查询。

看起来很合理，但实际可能发生这样的事情：

<box border radius="xl" padding={3} gap={3}>
  <box background="surface-secondary" radius="lg" padding={3} align="center">
    **共享工作区 `project/`**
  </box>
  <grid columns={3} gap={2}>
    <grid-item>
      <box border radius="lg" padding={2} gap={1} align="center">
        <icon name="bot" size="lg" />
        **Agent A**
        <text color="secondary" size="xs">修改 service.go</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={2} gap={1} align="center">
        <icon name="bot" size="lg" />
        **Agent B**
        <text color="secondary" size="xs">修改 service_test.go</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={2} gap={1} align="center">
        <icon name="bot" size="lg" />
        **Agent C**
        <text color="secondary" size="xs">修改 repository.go</text>
      </box>
    </grid-item>
  </grid>
  <divider />
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="danger" size="lg" />
    <box flex="1" gap={1}>
      **可能出现的问题**

      - Agent A 修改了函数签名，Agent B 仍基于旧签名编写测试。
      - Agent C 修改了查询接口，Agent A 的代码无法编译。
      - 多个 Agent 同时运行格式化工具，覆盖彼此的修改。
      - 一个 Agent 的 Git 操作影响其他 Agent 的工作。
    </box>
  </row>
</box>

这里的核心问题是：**任务可以并行，不代表资源可以无约束地并行访问。**

我们需要区分三个概念：

- **任务并发**：多个任务同时处于执行状态。
- **工具并发**：同一任务中的多个工具调用同时执行。
- **代码修改并发**：多个执行单元同时修改相同或相关的文件。

三者需要不同的控制机制，不能只设置一个 `maxConcurrency = 5` 就认为问题解决了。

---

## 二、先判断任务能不能拆分

在启动多个 Agent 之前，Harness 应先分析任务之间的依赖关系。

例如：

```text
重构用户模块
    │
    ├── A：分析现有用户服务
    │
    ├── B：分析数据库查询
    │
    └── C：分析现有测试
             │
             ▼
       统一重构方案
             │
             ▼
       修改公共接口
             │
       ┌─────┴─────┐
       ▼           ▼
   更新服务实现   更新测试
       │           │
       └─────┬─────┘
             ▼
          集成验收
```

你会发现，分析现有代码通常可以并行进行；但当多个修改依赖同一个公共接口时，就需要明确先后顺序。

这可以用有向无环图（DAG）描述。

设任务集合为：

\[
G=(V,E)
\]

其中：

- \(V\) 是任务节点。
- \(E\) 是依赖边。
- 如果任务 B 依赖任务 A，那么存在边 \(A \rightarrow B\)。

只有当一个任务的前置依赖都满足时，它才能进入可调度状态。

### 关键原则

**优先并行化只读分析，再谨慎并行化写操作。**

例如，多个 Agent 可以分别分析不同模块、提出方案、搜索调用关系，但不一定要立即同时修改同一个工作区。

---

## 三、资源锁：如何避免两个任务同时修改同一文件？

假设两个任务都需要修改：

```text
internal/user/service.go
```

如果没有冲突控制，它们可能先后读取同一份旧代码，然后各自写回，导致后写入的结果覆盖先写入的修改。

Harness 可以建立资源锁机制。

### 1. 定义资源

不要只把资源理解成文件。

资源可以包括：

- 文件或目录。
- Git 工作区。
- 数据库记录。
- 外部 API 的操作对象。
- 某个任务的状态记录。
- 共享测试环境。

### 2. 资源访问模式

可以把资源访问分为：

| 模式 | 含义 | 示例 |
|---|---|---|
| `Read` | 只读访问 | 搜索代码、读取文件 |
| `Write` | 修改资源 | 写文件、修改配置 |
| `Exclusive` | 独占操作 | 修改共享 Git 状态、清理共享环境 |

常见规则是：

- 多个只读操作可以同时执行。
- 写操作需要阻止冲突的读写操作。
- 独占操作需要更严格的协调。

但要注意，读写锁只有在所有相关访问都遵守同一协调机制时才有效。一个绕过锁直接写文件的工具，仍然可能造成冲突。

### 3. Go 中的最小锁示例

```go
package scheduler

import "sync"

type ResourceLocks struct {
    mu    sync.Mutex
    locks map[string]*sync.RWMutex
}

func NewResourceLocks() *ResourceLocks {
    return &ResourceLocks{
        locks: make(map[string]*sync.RWMutex),
    }
}

func (r *ResourceLocks) get(
    key string,
) *sync.RWMutex {
    r.mu.Lock()
    defer r.mu.Unlock()

    if r.locks[key] == nil {
        r.locks[key] = &sync.RWMutex{}
    }

    return r.locks[key]
}

func (r *ResourceLocks) ReadLock(
    key string,
) func() {
    lock := r.get(key)
    lock.RLock()

    return lock.RUnlock
}

func (r *ResourceLocks) WriteLock(
    key string,
) func() {
    lock := r.get(key)
    lock.Lock()

    return lock.Unlock
}
```

使用示例：

```go
unlock := locks.WriteLock(
    "file:internal/user/service.go",
)
defer unlock()

// 在锁保护下执行受协调的文件修改。
```

这个实现只适用于单进程内的基础协调，还不是完整的生产级资源锁管理器。

真实系统还需要考虑：

1. 锁的生命周期和回收。
2. 多资源锁的获取顺序，避免死锁。
3. 取消任务时如何安全释放锁。
4. 文件被重命名、目录被移动时如何处理资源标识。
5. 多 Worker 场景中的分布式锁或租约。
6. 锁失效后，旧 Worker 如何避免继续写入。

另外，`sync.RWMutex` 本身不能直接响应 `context.Context` 取消。对于需要可取消等待的任务，可以设计带有等待队列和上下文取消机制的锁管理器。

---

## 四、为什么 Git Worktree 往往比共享目录更适合多 Agent？

前面的资源锁可以限制冲突，但对于 Coding Harness，还有一种更实用的隔离方法：**为每个任务创建独立的 Git Worktree。**

例如：

```text
project/
├── .git/
├── main-worktree/
├── worktrees/
│   ├── task-101/
│   ├── task-102/
│   └── task-103/
```

概念上，每个任务都有自己的工作目录和分支：

```bash
git worktree add \
  -b agent/task-101 \
  ../worktrees/task-101 \
  HEAD
```

另一个任务可以创建独立工作区：

```bash
git worktree add \
  -b agent/task-102 \
  ../worktrees/task-102 \
  HEAD
```

这样，两个 Agent 修改相同路径时，通常不会直接覆盖彼此的工作区文件。

不过，Worktree 不是完整的安全沙箱：

- 多个 Worktree 仍然共享 Git 仓库的部分内部状态。
- 外部数据库、测试环境和网络资源仍可能冲突。
- 合并分支时仍可能出现代码冲突。
- 同一分支、索引文件和 Git 元数据的操作仍需要协调。
- 每个 Worktree 的依赖安装和构建过程仍可能争抢 CPU、内存和磁盘。

所以，推荐的组合是：

**独立 Worktree + 任务依赖 DAG + 资源锁 + 集成验收。**

这通常比单纯依赖共享目录中的文件锁更容易维护。

---

## 五、调度器应该如何选择下一个任务？

我们可以给每个任务定义以下属性：

```go
type Task struct {
    ID           string
    Dependencies []string
    ResourceKeys []string

    Priority int
    Status   string
}
```

其中：

- `Dependencies` 表示前置任务。
- `ResourceKeys` 表示任务需要访问的资源。
- `Priority` 表示调度优先级。
- `Status` 表示当前任务状态。

调度器选择任务时，需要检查：

1. 任务是否处于可运行状态。
2. 前置依赖是否全部完成。
3. 当前并发数是否超过上限。
4. 所需资源是否可用。
5. 是否满足任务预算和权限策略。
6. 任务是否已被其他 Worker 领取。

可以把基本流程表示为：

```text
获取待调度任务
      ↓
检查任务依赖
      ↓
检查并发额度
      ↓
检查资源冲突
      ↓
原子领取任务
      ↓
执行任务
      ↓
持久化执行结果
      ↓
释放资源并重新调度
```

这里最容易被忽略的是“原子领取任务”。

如果两个 Worker 同时读取到同一条 `queued` 记录，并且都认为自己可以执行，那么即使它们使用不同的进程，也可能重复处理同一任务。

因此，在多 Worker 系统中，任务领取必须由数据库事务、条件更新或其他原子协调机制保证。

---

## 六、多 Agent 协作：不仅要隔离，还要定义交付契约

多个 Agent 即使各自工作在独立 Worktree 中，也需要一种明确的协作协议。

例如，Agent A 负责修改服务实现，Agent B 负责编写测试。

不能只告诉它们：

> 你们各自完成自己的工作，然后合并。

更好的方式是定义交付契约：

```text
Agent A
├── 修改范围：internal/user/service.go
├── 预期输出：服务实现
├── 接口约束：保持现有公共方法签名
└── 验收条件：相关单元测试通过

Agent B
├── 修改范围：internal/user/service_test.go
├── 预期输出：覆盖新增行为的测试
├── 接口约束：使用已约定的服务接口
└── 验收条件：测试能够验证目标行为
```

如果需要修改公共接口，应先形成明确的接口方案，再让依赖它的任务继续执行。

这能减少 Agent 各自做出不同假设的情况。

### 集成阶段必须重新验证

即使每个 Agent 在自己的分支上都通过了测试，合并后仍然需要重新运行集成验证。

因为单独通过测试不意味着组合后也正确。

集成阶段至少应检查：

- 合并冲突。
- 公共接口兼容性。
- 完整编译与相关测试。
- 文件修改范围和权限。
- 多个任务是否重复实现同一功能。
- 代码变更是否满足原始用户需求。

最终由主 Harness 负责集成验收，而不是让各个子 Agent 自己宣布整体任务完成。

---

## 七、并发不是越高越好：建立资源预算

假设你的 Mac mini 同时运行 8 个 Agent，每个 Agent 又可能启动多个编译器、测试进程和子工具。

即使模型 API 不受影响，本地也可能出现：

- CPU 长时间满载。
- 内存耗尽，系统开始交换。
- 磁盘 I/O 竞争。
- 测试数据库被并发修改。
- 模型请求成本快速增加。

因此，Harness 应当对不同资源分别设置预算。

| 资源 | 可以控制的指标 |
|---|---|
| 模型请求 | 最大并发、请求速率、Token 预算 |
| 本地执行 | CPU、内存、进程数、执行时间 |
| 工作区 | 最大数量、磁盘占用、临时文件清理 |
| 测试环境 | 数据库隔离、端口分配、环境数量 |
| 任务调度 | 最大活动任务数、等待队列长度 |
| 外部服务 | API 限流、并发额度、重试预算 |

特别要注意，模型 API 的并发额度与本地 Shell 执行能力不是同一类资源，应该分别控制。

---

## 八、用什么策略决定一个任务是否值得拆分？

并行化存在协调成本。

可以用一个简化模型理解：

\[
T_{\text{parallel}}
\approx
\max(T_1,T_2,\ldots,T_n)
+
T_{\text{coordination}}
+
T_{\text{integration}}
\]

其中：

- \(T_i\) 是各子任务的执行时间。
- \(T_{\text{coordination}}\) 是任务协调成本。
- \(T_{\text{integration}}\) 是合并与集成验证成本。

这个公式是近似分析模型，不是精确的性能预测公式。

如果一个任务只需要修改一个小函数，那么拆成三个 Agent，可能反而更慢。

但如果任务包含多个相对独立的模块，例如分别分析认证、数据库查询和测试覆盖情况，那么并行只读分析可能显著缩短整体时间。

一个实用判断标准是：

**只有当子任务边界清晰、依赖明确、资源冲突可控，而且并行收益大于协调成本时，才应该增加 Agent。**

---

## 九、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  你开发的 Coding Harness 可以同时启动 4 个 Agent。它们分别在独立 Git Worktree 中修改不同模块，每个 Agent 单独运行测试都通过了。

  当 Harness 将这些分支集成后，项目出现编译错误，原因是两个 Agent 对同一个公共接口做出了不兼容的假设。

  最合理的改进是什么？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 把并发数从 4 提高到 8，让更多 Agent 帮忙解决冲突。</radio>
    <radio value="B">B. 建立明确的任务依赖和接口契约，在必要时先确定公共接口，并在集成后运行独立的完整验收。</radio>
    <radio value="C">C. 只要每个 Agent 的单独测试通过，就可以跳过集成测试。</radio>
    <radio value="D">D. 禁止所有 Agent 修改代码，只允许它们生成建议。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！独立工作区解决的是部分文件修改冲突，而不是接口兼容性。任务依赖、接口契约和集成验收必须共同发挥作用。
      {:else}
        关键在于区分工作区隔离与系统集成。即使每个 Agent 单独工作都正确，组合后的系统仍然可能不正确。
      {/if}
    </box>
  {/if}
</box>

## 下一课预告

第二十三课：**Harness 的事件日志、可观测性与故障诊断**。

我们将把任务状态、模型请求、工具调用、资源锁、Worker 租约和验收结果串成一条可追踪的执行链，让你在 Agent 卡住、重复调用工具、任务恢复失败或成本异常时，能够根据证据定位问题，而不是靠猜。
