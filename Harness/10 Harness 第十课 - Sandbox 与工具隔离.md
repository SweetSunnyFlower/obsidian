---
title: "10 Harness 第十课 - Sandbox 与工具隔离"
aliases:
  - "Harness 第十课 - Sandbox 与工具隔离"
tags:
  - harness
  - ai-agent
  - verbatim
  - reliability
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "f634b99b-425c-4d93-8345-88dd457a4933"
source_turn_id: "f2f3eb35-f9d9-4c84-9c2e-8114d6702bd5"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：10  
> 原始章节：原回答完整内容  
> 合并消息 ID：`f634b99b-425c-4d93-8345-88dd457a4933`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> Harness 第九课小测，我选择 C。请批改答案，并继续第十课：Sandbox 与工具隔离。
> ~~~

返回：[[Harness 知识地图]]

---

# Harness Engineering 第 10 课：Sandbox 与工具隔离

## 一、先批改第九课小测

你的答案是 **C，完全正确！**

核心原因：**审批授权的是一个具体操作，而不是某个工具的永久使用权。**

原始请求是写入：

```text
/workspace/project/config.go
```

审批后，模型却将路径改成：

```text
/etc/ssh/sshd_config
```

即使工具名仍然是 `write_file`，这也已经是一个不同的操作。

正确处理流程：

1. 检测到参数与已批准请求不一致。
2. 使原审批对当前请求失效。
3. 重新执行策略评估。
4. 根据新操作的风险拒绝执行，或要求用户重新审批。
5. 只有通过授权检查，并满足执行环境的安全约束，才能真正执行。

特别注意：即使用户重新批准了这次操作，也不代表它一定能执行。**Policy Engine 决定操作是否被授权，Sandbox 决定操作在系统层面能接触什么资源。** 两者必须同时工作。

上一课解决的是“谁有权批准”，今天解决的是更底层的问题：

> 如果模型生成了危险命令，甚至 Harness 的权限检查出现漏洞，我们怎样限制这个命令实际能造成的损害？

这就是 Sandbox 与工具隔离要解决的问题。

---

## 二、为什么有了权限系统，还需要 Sandbox？

假设你正在开发一个类似 Claude Code 或 Codex 的 Coding Agent。

用户要求：

> 修复项目中的 Bug，并运行测试。

模型决定调用 Shell 工具：

```bash
go test ./...
```

这条命令本身看起来很正常。但如果 Shell 工具直接运行在 Harness 服务进程所在的宿主机上，命令实际上可能拥有远超任务需要的能力。

例如，它可能：

- 读取环境变量中的 API Key、数据库密码；
- 修改项目目录以外的文件；
- 访问本机的 Unix Socket 或其他服务；
- 发起网络请求并上传源代码；
- 启动后台进程，消耗 CPU 和内存；
- 利用项目里的恶意脚本，在构建或测试期间执行其他操作。

这里有一个非常容易忽略的事实：

**运行测试不等于只执行测试代码。**

例如，Node.js 项目的 `npm test` 可能执行 `package.json` 中定义的任意脚本；Go 测试也可以通过文件、网络和子进程 API 执行大量操作。

因此，Harness 不能仅凭“这是一个测试命令”就认定执行安全。

### 权限检查与 Sandbox 的区别

<box border radius="lg" padding={3} gap={3}>
  <box gap={1}>
    <title size="md">Policy Engine：决定能不能做</title>
    <text color="secondary" size="sm">回答授权问题</text>
    - 这个用户是否允许写文件？
    - 这个工具是否允许访问目标资源？
    - 这个操作是否需要审批？
  </box>
  <divider color="subtle" />
  <box gap={1}>
    <title size="md">Sandbox：限制实际上能做什么</title>
    <text color="secondary" size="sm">回答执行边界问题</text>
    - 进程最多能读写哪些目录？
    - 能否访问外网或宿主机服务？
    - 能使用多少 CPU、内存和运行时间？
    - 能否访问宿主机的凭证和其他进程？
  </box>
</box>

举个例子：Policy Engine 允许 Agent 在项目目录内运行测试，但测试脚本试图读取 `/home/agent/.ssh/id_ed25519`。

如果只有应用层权限检查，脚本仍可能利用进程本身的操作系统权限读取文件。

如果 Sandbox 正确配置，进程就不应该有机会访问这个宿主机文件。

这就是纵深防御（Defense in Depth）：即使一层防护失效，另一层仍能限制损害。

## 三、Sandbox 的五层隔离模型

在实际的 Coding Harness 中，我建议把隔离分成五层，而不是把所有安全问题都寄托在 Docker 上。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="42px" align="center" justify="center">
      <icon name="folder-lock" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 1 层：文件系统隔离**

      限制工作目录、只读目录、临时目录和敏感文件的访问。注意符号链接、挂载点和宿主机目录映射。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="42px" align="center" justify="center">
      <icon name="network" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 2 层：网络隔离**

      默认限制出站网络，按需允许指定目标。防止代码向外传输数据或访问内网、云元数据服务。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="42px" align="center" justify="center">
      <icon name="cpu" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 3 层：资源限制**

      设置 CPU、内存、进程数、磁盘空间、运行时长和输出大小，避免资源耗尽。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="42px" align="center" justify="center">
      <icon name="shield" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 4 层：操作系统权限**

      使用独立身份、Linux namespaces、cgroups、seccomp、Capabilities 等机制减少进程权限。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="42px" align="center" justify="center">
      <icon name="activity" size="xl" />
    </box>
    <box flex="1" gap={1}>
      **第 5 层：生命周期与审计**

      控制进程创建、取消、清理和回收；记录执行命令、退出状态、资源消耗和安全事件。
    </box>
  </row>
</box>

这五层互相补充。例如，`context.Context` 可以取消执行流程，但它不能独自阻止恶意进程访问宿主机文件；Docker 可以提供隔离，但错误的特权配置又可能破坏这层隔离。

## 四、先纠正一个 Go 开发中很常见的误区

你可能会这样执行命令：

```go
cmd := exec.CommandContext(
    ctx,
    "bash",
    "-c",
    userCommand,
)

output, err := cmd.CombinedOutput()
```

这段代码的问题不是 `CommandContext` 本身有缺陷，而是它承担不了 Sandbox 的职责。

### `exec.CommandContext` 能做什么？

- 在上下文取消时，尝试终止它启动的直接子进程。
- 在启动或等待进程时返回错误。
- 帮助实现超时和取消控制。

### 它不能自动做什么？

- 限制文件系统访问。
- 限制网络连接。
- 限制 CPU、内存和进程数量。
- 保证整个进程树都被终止。
- 阻止 Shell 解析危险命令。
- 阻止进程访问当前用户本来就能访问的凭证。

尤其要注意：

```go
exec.CommandContext(ctx, "bash", "-c", userCommand)
```

如果 `userCommand` 来自模型，模型输出就相当于不可信输入。即使你使用 `CommandContext`，Shell 仍然会解释这段命令。

对于普通可执行程序，优先采用参数数组：

```go
cmd := exec.CommandContext(
    ctx,
    "go",
    "test",
    "./...",
)
```

这里没有经过 Shell 展开，但**参数数组不是 Sandbox**。如果程序本身具有过高权限，它仍然可能造成损害。

还有一个容易踩的坑：`CombinedOutput()` 会将输出累积到内存中。恶意程序可以无限输出，造成内存耗尽。生产实现需要限制输出大小，并且要明确处理截断、进程终止和输出管道关闭。

---

## 五、在 Go Harness 中设计 Sandbox 接口

我们先不要把业务代码与 Docker、Kubernetes 或某一种具体 Sandbox 技术绑死。

Harness 应该定义统一的执行接口，底层可以替换成 Docker、专用 Sandbox Runtime 或其他隔离后端。

建议目录：

```text
harness/
├── policy/
│   └── engine.go
├── sandbox/
│   ├── types.go
│   ├── runtime.go
│   └── docker.go
├── tool/
│   └── executor.go
└── runtime/
    └── runner.go
```

### 第一步：定义执行请求

`sandbox/types.go`

```go
package sandbox

import (
    "context"
    "time"
)

type Limits struct {
    Timeout     time.Duration
    MemoryBytes int64
    CPUQuota    int64
    PIDs        int64
    MaxOutput   int64
}

type Request struct {
    TaskID    string
    WorkingDir string

    // 程序与参数分开，不默认经过 Shell。
    Program string
    Args    []string

    // 仅允许传入经过策略筛选的环境变量。
    Env map[string]string

    Limits Limits
}

type Result struct {
    ExitCode  int
    Stdout    []byte
    Stderr    []byte
    Truncated bool
}

type Runtime interface {
    Execute(
        ctx context.Context,
        req Request,
    ) (Result, error)
}
```

这里有几个设计选择值得特别说明。

**第一，环境变量不能直接继承宿主机的全部环境。**

如果直接使用 `os.Environ()`，可能把 API Key、数据库密码、云凭证等带入执行环境。更安全的方式是使用明确的环境变量白名单，只提供构建或测试所必需的变量。

**第二，`WorkingDir` 不是安全边界。**

设置工作目录为 `/workspace/project`，不代表进程只能访问这个目录。实际访问范围仍然由操作系统权限、挂载和隔离策略决定。

**第三，资源限制需要真正落地。**

`Limits` 只是配置数据。Runtime 必须把它转换为底层平台的硬性限制；如果限制没有应用成功，应拒绝启动，而不是默默降级为不受限执行。

### 第二步：Harness 的调用方式

下面是一个只展示控制流程的示例。它还不是完整的 Sandbox 实现：

```go
func RunCommand(
    ctx context.Context,
    runtime sandbox.Runtime,
    taskID string,
) (sandbox.Result, error) {
    req := sandbox.Request{
        TaskID:     taskID,
        WorkingDir: "/workspace/project",
        Program:    "go",
        Args:       []string{"test", "./..."},
        Env: map[string]string{
            "PATH": "/usr/local/go/bin:/usr/bin:/bin",
            "HOME": "/tmp/agent-home",
        },
        Limits: sandbox.Limits{
            Timeout:     2 * time.Minute,
            MemoryBytes: 512 * 1024 * 1024,
            CPUQuota:    100000,
            PIDs:        128,
            MaxOutput:   1 * 1024 * 1024,
        },
    }

    return runtime.Execute(ctx, req)
}
```

这里的 `CPUQuota` 只是一个由底层 Runtime 解释的配置字段示例，不能直接理解为跨平台通用的 CPU 数量。不同运行时对 CPU 配额的单位和语义可能不同，接口应明确其定义。

还要注意：即使请求设置了两分钟超时，底层 Runtime 也必须负责终止整个执行单元、回收资源并确认清理状态。只取消 Go 协程并不意味着外部进程已经停止。

## 六、用 Docker 实现第一版隔离 Runtime

对于你正在学习的 Coding Harness，Docker 是一个适合入门的执行后端。它能帮助你把代码执行进程与 Harness 服务进程分开，但配置不当的容器并不一定安全。

先看一个比较合理的容器安全配置。

<box border radius="lg" padding={3} gap={2}>
  **执行容器的安全原则**
  <row align="start" gap={2}>
    <icon name="check-circle" color="success" size="lg" />
    <box flex="1" gap={1}>
      **只挂载需要的目录**

      项目目录按需求读写，其他宿主机路径不挂载；缓存和临时目录尽可能独立。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="check-circle" color="success" size="lg" />
    <box flex="1" gap={1}>
      **默认无网络**

      如果测试需要下载依赖，使用单独的受控依赖获取流程，或经过限制的网络代理。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="check-circle" color="success" size="lg" />
    <box flex="1" gap={1}>
      **非特权运行**

      禁止 `--privileged`，移除不必要的 Linux Capabilities，并启用适当的 seccomp 配置。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="check-circle" color="success" size="lg" />
    <box flex="1" gap={1}>
      **设置硬性资源上限**

      限制内存、CPU、PID 数量、运行时长和日志输出，避免资源耗尽。
    </box>
  </row>
</box>

### 一个可用于本地验证的 Docker 命令

下面的示例假设你已经准备好了可信的 Go 工具链镜像，并且项目目录是当前目录下的 `project`。

```bash
mkdir -p ./project ./agent-tmp

docker run --rm \
  --name harness-task-test \
  --network none \
  --read-only \
  --user 10001:10001 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 512m \
  --cpus 1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m,mode=1777 \
  --mount type=bind,src="$(pwd)/project",dst=/workspace,readonly \
  --workdir /workspace \
  --env HOME=/tmp \
  --env GOCACHE=/tmp/go-cache \
  --env GOMODCACHE=/tmp/go-mod-cache \
  --entrypoint /usr/local/go/bin/go \
  your-trusted-go-image:1.26 \
  test ./...
```

这条命令有意将项目目录挂载为只读，所以适合验证测试执行，不适合需要修改源码或生成项目文件的任务。实际镜像名称、Go 路径和目录权限需要按你的环境调整。

其中几个配置很关键：

- `--network none`：不提供常规外部网络连接，但不应把它当作所有网络隔离场景的完整保证。
- `--read-only`：容器根文件系统只读。
- `--mount ... readonly`：项目目录只读，容器不能通过这个挂载修改宿主机文件。
- `--cap-drop ALL`：移除容器默认授予的 Linux Capabilities。
- `--pids-limit`、`--memory`、`--cpus`：限制部分资源消耗。
- `--security-opt no-new-privileges:true`：阻止进程通过 `execve` 获取新的特权。

这里还有一个重要的实践细节：`--tmpfs` 的 `noexec` 属性会影响依赖它执行文件的程序，因此具体挂载选项需要结合构建工具的行为验证。

### 如果 Agent 需要修改代码呢？

你需要将工作目录改为可写挂载：

```bash
--mount type=bind,src="$(pwd)/project",dst=/workspace
```

但这会允许容器内进程修改宿主机的项目文件。因此，不应该让不可信任务直接获得唯一的工作副本。

更稳妥的做法是：

1. 为每个任务创建独立的工作副本或临时工作树。
2. 将该副本挂载到容器中。
3. 在容器内修改、编译和测试。
4. 检查 Git diff、生成文件和测试结果。
5. 经策略检查后，再将允许的修改合并回主工作区。

这样，任务失败或恶意脚本破坏文件时，影响范围更容易控制。

**安全边界提醒：** Docker 共享宿主机内核。对于运行不可信代码、面向多租户的服务或高价值凭证场景，应进一步评估专用 Sandbox Runtime、微虚拟机或独立虚拟机。不要仅凭一个 Docker 命令就认为已经获得强隔离。

---

## 七、网络隔离比看起来更复杂

假设你的 Agent 需要执行：

```bash
go test ./...
```

如果依赖还没有下载，Go 可能需要访问模块代理。于是开发者很容易直接开启容器网络。

问题是：一旦允许任意出站网络，恶意测试代码也可能向外发送环境变量、源码或令牌。

更好的设计是将网络能力拆开：

<box border radius="lg" padding={3} gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="package" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **依赖获取阶段**

      使用受控的依赖代理或独立下载任务。对依赖来源、版本和校验信息进行管理。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="shield-check" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **执行阶段**

      默认关闭网络；只有任务明确需要网络能力时才按策略开放。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="md" size="40px" align="center" justify="center">
      <icon name="network" size="lg" />
    </box>
    <box flex="1" gap={1}>
      **受控网络代理**

      通过网络策略或代理限制可访问的目标，并防止访问云元数据、内网管理端口和其他不应触达的服务。
    </box>
  </row>
</box>

仅仅把域名加入白名单也不一定够，因为 DNS 解析、重定向、代理配置和访问内网地址都可能影响实际目的地。生产环境应在网络层执行约束，并防范 SSRF 和 DNS rebinding 等风险。

同样，Docker 的 `--network none` 不等于你的整个服务不需要网络：Harness 主进程仍然可以访问模型 API，只有被隔离的执行容器采用无网络策略。这也是为什么要把模型调用进程与不可信代码执行进程分离。

## 八、Sandbox 与 Harness 生命周期如何结合？

结合前面学过的 Session、持久化、错误处理和审批系统，你会发现 Sandbox 不只是启动一个容器，而是一个需要管理生命周期的执行子系统。

建议为每次执行建立独立的 `SandboxRun`：

```go
type SandboxRun struct {
    ID        string
    TaskID    string
    ToolCallID string

    Status string

    ContainerID string

    StartedAt  time.Time
    FinishedAt *time.Time

    ExitCode *int
    Error    string
}
```

执行状态可以设计为：

```text
created
   ↓
starting
   ↓
running
   ├──→ succeeded
   ├──→ failed
   ├──→ timed_out
   └──→ cancelled
          ↓
       cleaning
          ↓
       cleaned
```

这里要区分两个概念：

- **任务执行结果**：测试成功、命令失败、超时或取消。
- **资源清理结果**：容器是否停止、临时文件是否清理、资源是否释放。

例如，测试命令已经超时，但容器还没有成功停止。此时不能简单地把一切标记为完成，因为后台仍然可能有进程在运行。

推荐的生命周期如下：

1. 持久化 `SandboxRun` 记录。
2. 验证执行镜像、目录、环境变量和资源限制。
3. 创建容器并记录容器标识。
4. 启动进程并收集有大小限制的输出。
5. 等待结束、取消或超时。
6. 停止执行单元，确认进程终止。
7. 保存退出码、输出摘要、错误和审计事件。
8. 清理临时资源，并将清理状态持久化。

这也连接了第六课的任务恢复机制：如果 Harness 在容器启动后崩溃，恢复流程应该通过已保存的 `SandboxRun` 和容器标识进行核对，而不是直接启动第二个相同任务。

还需要防止两个并发 Worker 同时恢复同一个任务。可以通过任务租约、原子状态转换和唯一执行标识来控制所有权。

## 九、生产级 Sandbox 最容易遗漏的六个问题

<box gap={2}>
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="secondary" size="lg" />
    <box flex="1" gap={1}>
      **1. 只终止直接子进程**

      Shell 可能启动后台子进程。需要通过容器、进程组或其他可靠的执行单元管理整个进程树，并验证终止结果。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="secondary" size="lg" />
    <box flex="1" gap={1}>
      **2. 输出无限增长**

      使用有界缓冲或持续排空的管道，设置最大输出量，避免 `CombinedOutput()` 将大量输出累积在内存中。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="secondary" size="lg" />
    <box flex="1" gap={1}>
      **3. 宿主机目录暴露**

      不挂载 Docker Socket、SSH 私钥、宿主机根目录或不必要的凭证目录。容器内进程一旦能访问 Docker Socket，可能获得控制宿主机容器的能力。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="secondary" size="lg" />
    <box flex="1" gap={1}>
      **4. 镜像和依赖不可信**

      固定镜像版本或摘要，控制依赖来源。不要默认信任模型指定的镜像名、构建脚本或外部下载地址。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="secondary" size="lg" />
    <box flex="1" gap={1}>
      **5. 容器以过高权限运行**

      避免 `--privileged`、不必要的宿主机命名空间共享和过度宽松的挂载。根据威胁模型评估内核漏洞及容器逃逸风险。
    </box>
  </row>
  <row align="start" gap={2}>
    <icon name="alert-triangle" color="secondary" size="lg" />
    <box flex="1" gap={1}>
      **6. 把“启动成功”当作“隔离成功”**

      必须确认关键限制确实生效。资源限制或安全配置未能应用时，应拒绝运行不可信代码。
    </box>
  </row>
</box>

## 十、第十课总结：你应该建立什么样的心智模型？

把今天的知识放回完整的 Harness 架构中：

| 子系统 | 主要回答的问题 |
|---|---|
| Agent Loop | 接下来应该做什么？ |
| Tool Runtime | 如何规范地执行工具调用？ |
| Policy Engine | 这个操作是否被授权？ |
| Approval Service | 需要谁批准什么操作？ |
| Sandbox Runtime | 这个进程实际能接触哪些资源？ |
| Task Store | 任务和执行状态如何恢复？ |
| Observability | 出错后如何追踪和定位？ |

它们不是彼此替代的组件，而是共同组成 Harness 的执行控制面。

对于你的 Go Coding Harness，我建议先完成一个最小但完整的闭环：**工具调用 → 权限检查 → 创建独立执行环境 → 限制资源 → 运行命令 → 收集结果 → 清理环境 → 持久化状态**。先把边界和生命周期做正确，再逐步增加并行执行、网络代理和更强的隔离后端。

---

## 第十课小测

现在来一道与真实工程实现有关的判断题。

你的 Go Harness 使用 `exec.CommandContext` 执行模型生成的命令，并设置了 30 秒超时。为了避免命令访问敏感文件，你又在代码里检查了命令字符串中是否包含 `/etc`。

你认为下面哪种判断最正确？

{@body const [answer, setAnswer] = DIL.useState("")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={3} gap={3}>
  <radio-group value={answer} onChange={v => {setAnswer(v); setSubmitted(false)}} direction="col">
    <radio value="A">A. 这样就足够安全了，因为命令超时会自动终止所有相关进程。</radio>
    <radio value="B">B. 只要过滤掉 `/etc`、`/root` 等字符串，就能可靠阻止文件系统越权。</radio>
    <radio value="C">C. 这只能提供有限的应用层检查；还需要受限执行环境、真实的文件系统与网络隔离、资源限制，以及可靠的进程树清理机制。</radio>
    <radio value="D">D. 把命令改成 `exec.CommandContext(ctx, "bash", "-c", command)` 就能获得独立的执行环境。</radio>
  </radio-group>
  <button block disabled={!answer} onClick={() => {setSubmitted(true); GenUI.issueNewTurn("Harness 第十课小测，我选择 "+answer+"。请批改答案，并继续下一课。")}}>提交答案并继续下一课</button>
  {#if submitted}
    <text color="secondary" size="sm">已提交，下一步将批改答案并继续课程。</text>
  {/if}
</box>

下一课建议进入 **第十一课：工具执行结果、结构化输出与验证机制**。我们会讨论工具返回值如何设计、如何区分业务失败与运行时失败、如何验证模型生成的代码和文件，以及怎样避免模型把“命令退出了”误判为“任务已经完成”。
