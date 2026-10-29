---
title: "Harness 第二十四课 - Harness 的生产部署与运行可靠性"
aliases:
  - "Harness 第二十四课 - Harness 的生产部署与运行可靠性"
tags:
  - harness
  - ai-agent
  - verbatim
  - deployment
created: "2026-10-29"
updated: "2026-10-29"
type: chapter-note
status: active
source_message_id: "44791c28-da7d-48f2-9db3-88ca41c788e6"
source_user_message_id: "0660d4d1-d1a7-4767-9158-adba113cd05d"
source_content_sha256: "e3f63bd9483c9b6a6530f6d82dd078a81583405ab56bb9e9f900558fa9b9dc87"
sources:
  - "https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884"
---

> [!info] 原文映射
> 章节序号：24  
> 原始章节：Harness 第二十四课：Harness 的生产部署与运行可靠性  
> 合并消息 ID：`44791c28-da7d-48f2-9db3-88ca41c788e6`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae2bc8c-1084-83e8-80d1-1bd216d40884)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一课
> ~~~

返回：[[Harness 知识地图]]

---

继续！上一课我们学习了 Harness 的事件日志、Metrics、Tracing 和故障诊断。今天进入第二十四课：**Harness 的生产部署、配置管理、健康检查与优雅关闭**。

这节课我们不只关注 Agent 能不能运行，还要考虑一个更接近真实生产环境的问题：

> 当 Harness 正在执行一个耗时 20 分钟的 Coding 任务时，服务器突然需要发布新版本、进程被重启，或者配置发生变化，系统应该怎么办？

一个 Demo 可以在进程退出时直接结束任务，但生产级 Harness 必须尽可能做到：**安全停止接收新任务、妥善处理正在执行的任务、可靠保存状态，并在恢复后继续执行。**

# 第二十四课：Harness 的生产部署与运行可靠性

## 一、先理解：进程活着，不代表系统健康

假设你的 Harness 使用 Go 编写，提供 HTTP API，并在后台执行 Agent 任务。

最简单的启动方式可能是：

```go
func main() {
    app := NewHarness()

    if err := app.Run(); err != nil {
        log.Fatal(err)
    }
}
```

在开发环境里，这样可能完全够用。

但到了生产环境，至少有四种不同的健康状态。

<box border radius="xl" padding={3} gap={3}>
  <row align="start" gap={3}>
    <icon name="heart-pulse" size="xl" />
    <box flex="1" gap={1}>
      **1. Liveness：存活状态**

      <text color="secondary" size="sm">进程是否还活着？</text>

      如果主循环死锁、进程卡死，存活检查应该能够发现问题。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <icon name="check-circle" size="xl" />
    <box flex="1" gap={1}>
      **2. Readiness：就绪状态**

      <text color="secondary" size="sm">服务是否已经准备好接收新请求？</text>

      即使进程存在，如果数据库连接池尚未准备好，或者正在关闭，也不应该继续接收新任务。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <icon name="database" size="xl" />
    <box flex="1" gap={1}>
      **3. Dependency Health：依赖健康状态**

      <text color="secondary" size="sm">数据库、队列和其他关键依赖是否可用？</text>

      依赖异常不一定意味着进程必须退出。应当根据依赖的重要性决定是拒绝新任务、降级运行还是触发告警。
    </box>
  </row>
  <divider color="subtle" />
  <row align="start" gap={3}>
    <icon name="activity" size="xl" />
    <box flex="1" gap={1}>
      **4. Worker Health：执行器健康状态**

      <text color="secondary" size="sm">后台任务是否能够正常推进？</text>

      例如，Worker 长时间没有心跳、队列持续积压、任务持续超时，都可能意味着执行系统出现异常。
    </box>
  </row>
</box>

这四种状态不能简单合并成一个 `isHealthy` 布尔值。

例如，模型 API 暂时不可用时，HTTP 服务可能仍然能够正常返回任务状态，因此存活检查可以通过，而就绪状态是否通过，则取决于服务是否还能接受并可靠保存新任务。

---

## 二、生产环境的整体架构

建议把 Harness 的运行结构设计成下面这样：

<box border radius="xl" padding={3} gap={2} align="center">
  <box border radius="lg" padding={3} width="100%" align="center">
    **HTTP API / 用户请求**
    <text color="secondary" size="sm">创建任务、查询状态、取消任务</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **Task Orchestrator**
    <text color="secondary" size="sm">任务状态机、权限策略、调度与验收</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="lg" padding={3} width="100%" align="center">
    **持久化任务队列**
    <text color="secondary" size="sm">任务状态、领取租约、检查点、执行事件</text>
  </box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box border radius="lg" padding={3} gap={1} align="center">
        <icon name="server" size="xl" />
        **Worker A**
        <text color="secondary" size="xs">独立执行环境</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="lg" padding={3} gap={1} align="center">
        <icon name="server" size="xl" />
        **Worker B**
        <text color="secondary" size="xs">独立执行环境</text>
      </box>
    </grid-item>
  </grid>
  <icon name="arrow-down" color="secondary" />
  <box background="surface-secondary" radius="lg" padding={3} width="100%" align="center">
    **Observability + Completion Gate**
    <text color="secondary" size="sm">日志、指标、追踪、验收和审计</text>
  </box>
</box>

这里有两个重要设计原则。

**第一，API 服务与任务执行尽量解耦。**

HTTP 请求负责创建任务并返回 `task_id`，后台 Worker 负责执行任务。这样即使一个 Coding 任务执行 20 分钟，客户端也不需要一直保持 HTTP 请求。

**第二，任务状态必须持久化。**

如果任务只保存在 Go 进程的内存中，那么进程重启后，任务队列、执行进度和恢复信息都可能丢失。

生产环境应当把任务状态、执行记录、租约和必要的恢复信息保存到数据库或其他可靠存储中。

---

## 三、配置管理：不要把所有配置写死在代码里

Harness 的配置不只是数据库地址和监听端口，还涉及模型、工具权限、并发预算和执行环境。

例如：

```yaml
server:
  addr: ":8080"
  shutdown_timeout: 30s

worker:
  concurrency: 4
  poll_interval: 1s
  lease_duration: 60s
  heartbeat_interval: 15s

model:
  provider: "deepseek"
  request_timeout: 120s
  max_retries: 2

execution:
  max_task_duration: 20m
  max_tool_calls: 100
  max_output_bytes: 1048576
```

这是示例配置，具体参数需要根据任务耗时、模型延迟和资源预算调整。

### 1. 配置要分成三类

| 类型 | 示例 | 推荐处理方式 |
|---|---|---|
| 静态配置 | HTTP 端口、工作目录 | 启动时加载 |
| 运行参数 | 并发上限、轮询间隔 | 可通过受控机制动态调整 |
| 敏感配置 | API Key、数据库密码 | Secret Manager 或受保护的环境变量 |

不要把 API Key 写进 YAML 文件并提交到 Git 仓库。

另外，动态修改配置时也不能随意更换正在执行任务的运行参数。

例如，一个任务启动时使用模型 A，执行到一半配置突然切换为模型 B，可能造成工具调用协议、上下文格式或输出行为不一致。

比较稳妥的做法是：

- 任务启动时保存配置版本或关键配置快照。
- 新任务使用新配置。
- 已运行任务按明确的兼容策略继续使用原配置。
- 密钥轮换可以单独设计，避免把所有配置都永久固定。

---

## 四、Go 实战：实现健康检查与优雅关闭

下面通过一个简化的 Go HTTP 服务，学习生产环境中最重要的两个机制。

### 1. 实现健康检查接口

```go
package main

import (
	"encoding/json"
	"net/http"
	"sync/atomic"
)

type Health struct {
	ready atomic.Bool
}

func (h *Health) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health/live", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "alive",
		})
	})

	mux.HandleFunc("GET /health/ready", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		if !h.ready.Load() {
			http.Error(
				w,
				"not ready",
				http.StatusServiceUnavailable,
			)
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "ready",
		})
	})
}
```

这个实现中：

- `/health/live` 检查服务进程是否能够响应。
- `/health/ready` 检查服务是否允许接收新请求。
- `atomic.Bool` 用于安全地读写就绪状态。

注意：这只是最小示例。生产环境中的 Liveness 应避免因为某个外部依赖暂时不可用就直接触发无限重启；Readiness 则应结合数据库连接、任务持久化能力和关闭状态判断。

### 2. 为什么需要优雅关闭？

假设服务正在执行一个任务：

```text
Agent 执行任务
      ↓
收到 SIGTERM
      ↓
立即 os.Exit(0)
      ↓
任务执行中断
```

这种退出方式会丢失当前进程中的执行上下文，甚至可能留下状态不明的外部副作用。

更合理的流程是：

```text
收到 SIGTERM
      ↓
标记服务不再就绪
      ↓
停止接收新任务
      ↓
等待正在执行的任务退出或到达截止时间
      ↓
保存必要状态并清理资源
      ↓
关闭 HTTP 服务
      ↓
进程退出
```

### 3. 完整的最小可运行示例

下面的程序包含健康检查、HTTP 服务和优雅关闭机制。

```go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

type Health struct {
	ready atomic.Bool
}

func (h *Health) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health/live", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "alive",
		})
	})

	mux.HandleFunc("GET /health/ready", func(
		w http.ResponseWriter,
		r *http.Request,
	) {
		if !h.ready.Load() {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "ready",
		})
	})
}

func main() {
	health := &Health{}
	mux := http.NewServeMux()
	health.Register(mux)

	server := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	signalCtx, stop := signal.NotifyContext(
		context.Background(),
		syscall.SIGINT,
		syscall.SIGTERM,
	)
	defer stop()

	// 初始化必要依赖后，再将服务标记为就绪。
	health.ready.Store(true)

	serverErr := make(chan error, 1)

	go func() {
		log.Println("HTTP server listening on :8080")
		err := server.ListenAndServe()

		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}

		serverErr <- nil
	}()

	select {
	case <-signalCtx.Done():
		log.Println("shutdown signal received")

	case err := <-serverErr:
		if err != nil {
			log.Printf("HTTP server failed: %v", err)
		}
	}

	// 立即停止接收新任务。
	health.ready.Store(false)

	shutdownCtx, cancel := context.WithTimeout(
		context.Background(),
		30*time.Second,
	)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)

		if closeErr := server.Close(); closeErr != nil {
			log.Printf("force close failed: %v", closeErr)
		}
	}

	log.Println("HTTP server stopped")
}
```

启动：

```bash
go run .
```

检查服务：

```bash
curl -i http://localhost:8080/health/live
curl -i http://localhost:8080/health/ready
```

停止服务：

```bash
kill -TERM <PID>
```

这个程序展示了 HTTP 层的优雅关闭，但**还没有实现 Worker 的安全停止**。`http.Server.Shutdown` 不会自动等待你自己创建的后台 Agent Goroutine，也不会自动保存任务状态。

真正的 Harness 需要在关闭流程中额外协调 Worker。

---

## 五、Worker 的优雅关闭：不能只关闭 HTTP 服务

假设有 4 个 Worker 正在执行任务。

当服务收到终止信号时，应该区分两件事：

1. 不再领取新任务。
2. 已经领取的任务如何处理。

推荐的 Worker 关闭流程如下：

<box border radius="xl" padding={3} gap={2} align="center">
  <box border radius="md" padding={3} width="100%" align="center">
    **停止领取新任务**
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="md" padding={3} width="100%" align="center">
    **等待正在运行的任务**
    <text color="secondary" size="sm">在截止时间内尽量完成</text>
  </box>
  <icon name="arrow-down" color="secondary" />
  <box border radius="md" padding={3} width="100%" align="center">
    **截止时间到达？**
  </box>
  <grid columns={2} gap={2}>
    <grid-item>
      <box border radius="md" padding={2} align="center" gap={1}>
        <icon name="check-circle" color="success" size="lg" />
        **任务已完成**
        <text color="secondary" size="xs">保存最终状态</text>
      </box>
    </grid-item>
    <grid-item>
      <box border radius="md" padding={2} align="center" gap={1}>
        <icon name="alert-triangle" color="danger" size="lg" />
        **任务仍在执行**
        <text color="secondary" size="xs">安全取消或交由恢复流程</text>
      </box>
    </grid-item>
  </grid>
</box>

对于 Coding Harness，超时退出时还要考虑：

- 子进程是否已经停止。
- Shell 启动的后代进程是否仍然存活。
- 当前 Git Worktree 是否需要保留。
- 工具调用是否产生未知的外部副作用。
- 任务租约何时失效。
- 下一个 Worker 如何安全恢复。

不能简单地把所有运行中的任务改成 `failed`，也不能在租约到期后假设旧 Worker 已经彻底停止。

### 生产级关闭还需要 fencing token

假设 Worker A 的租约到期，Worker B 接管任务，但 Worker A 因为网络分区仍然在执行。

如果 Worker A 恢复网络后继续提交结果，就可能覆盖 Worker B 的新结果。

因此，可以给每次任务领取分配递增的 fencing token：

```text
Worker A 获得 token = 41
       ↓
租约过期
       ↓
Worker B 获得 token = 42
       ↓
Worker A 尝试提交 token = 41
       ↓
持久化层拒绝旧 token
```

这需要在支持条件检查的持久化层实施，单纯在 Worker 内部比较 token 没有保护作用。对于外部 API 等无法验证 fencing token 的系统，还需要幂等键、对账或其他副作用保护措施。

---

## 六、容器部署：Harness 应该怎样运行？

如果你的 Harness 是 Go 服务，可以从 Docker 开始。

一个基础的多阶段 Dockerfile：

```dockerfile
FROM golang:1.26 AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -o /out/harness ./cmd/harness

FROM debian:bookworm-slim

RUN useradd --system --create-home --uid 10001 harness

COPY --from=builder /out/harness /usr/local/bin/harness

USER harness
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/harness"]
```

这里的 `golang:1.26` 应与你实际采用的 Go 版本及镜像标签保持一致。

如果 Harness 需要执行代码，单纯在这个镜像里运行 Shell 命令并不意味着执行环境已经安全隔离。更稳妥的架构是将控制平面与代码执行环境分开：

- **Control Plane**：任务 API、权限、调度、持久化、模型路由。
- **Execution Worker**：在独立容器或其他沙箱中执行代码。
- **Persistence**：保存任务状态、检查点和事件。
- **Observability**：采集日志、指标和调用链。

这样，某个任务执行恶意代码或耗尽资源时，更容易限制影响范围。

### 部署时的几个注意事项

1. 将 API Key 和数据库密码放入受保护的密钥配置系统。
2. 为 Worker 设置 CPU、内存、进程数和执行时间限制。
3. 使用持久化存储保存任务状态，不能依赖容器文件系统中的临时数据。
4. 配置容器停止时的宽限期，让应用有时间完成关闭流程。
5. 为任务设置最大执行时间和恢复策略。
6. 记录镜像版本、配置版本和任务执行版本，方便复现问题。

---

## 七、上线前的生产检查清单

{@body const checks = [{title:"任务可靠性",desc:"任务状态持久化、异常恢复、未知副作用处理"},{title:"进程生命周期",desc:"SIGTERM、停止领取任务、优雅关闭和强制退出"},{title:"健康检查",desc:"Liveness 与 Readiness 分离，依赖故障不会引发无限重启"},{title:"资源限制",desc:"模型请求、Worker、CPU、内存、磁盘和工具执行均有限额"},{title:"安全隔离",desc:"非特权运行、网络策略、密钥保护、工作区隔离"},{title:"可观测性",desc:"关联 ID、结构化日志、Metrics、Tracing 和审计"},{title:"部署回滚",desc:"镜像版本、配置版本、兼容性检查和回滚方案"}]}
{@body const [completedChecks, setCompletedChecks] = DIL.useState([])}
<box border radius="xl" padding={3} gap={3}>
  <row align="center" justify="between">
    <title size="md">生产上线检查表</title>
    <text color="secondary" size="sm">{completedChecks.length}/{checks.length}</text>
  </row>
  <box background="surface-tertiary" radius="full" height="6px" clip>
    <box background="surface-inverted" radius="full" height="6px" width={`${completedChecks.length / checks.length * 100}%`} />
  </box>
  {#each checks as item, i}
    <checkbox key={item.title} checked={completedChecks.includes(i)} onChange={(checked) => setCompletedChecks(prev => checked ? [...prev, i] : prev.filter(x => x !== i))}>
      <box gap={1}>
        **{item.title}**
        <text color="secondary" size="sm">{item.desc}</text>
      </box>
    </checkbox>
  {/each}
</box>

这份清单可以直接作为你设计 Coding Harness 时的第一版上线验收依据。实际项目还应根据业务风险补充恢复演练、数据备份和灾难恢复等要求。

---

## 八、本课小测

{@body const [answer, setAnswer] = DIL.useState("B")}
{@body const [submitted, setSubmitted] = DIL.useState(false)}
<box border radius="xl" padding={4} gap={3}>
  **场景题**

  一个 Harness Worker 正在执行代码修改任务，服务收到了 `SIGTERM`。任务已经领取并持久化，但尚未完成。你希望发布新版本后，任务能够安全恢复。

  以下哪种方案最合理？

  <radio-group value={answer} onChange={(v) => { setAnswer(v); setSubmitted(false); }} direction="col">
    <radio value="A">A. 立即退出进程，把所有运行中的任务统一标记为失败。</radio>
    <radio value="B">B. 停止领取新任务，在宽限期内等待执行中的任务；到期后按取消、持久化、租约和副作用恢复策略处理，并由新 Worker 安全接管。</radio>
    <radio value="C">C. 只关闭 HTTP 服务，不需要管理后台 Worker。</radio>
    <radio value="D">D. 让新 Worker 立即执行所有旧任务，不需要检查旧 Worker 是否仍在运行。</radio>
  </radio-group>
  <button block onClick={() => setSubmitted(true)}>提交答案</button>
  {#if submitted}
    <box background="surface-secondary" radius="lg" padding={3} gap={2}>
      <title size="md">{answer === "B" ? "答对了！" : "再想一想"}</title>
      {#if answer === "B"}
        正确！优雅关闭需要同时处理新任务接收、当前任务退出、持久化状态和恢复接管。租约、fencing token 和副作用对账用于降低新旧 Worker 重叠执行带来的风险。
      {:else}
        核心是不能只管理 HTTP 进程，还要管理后台 Worker、持久化任务状态和执行副作用。强制退出后直接重跑可能造成重复操作。
      {/if}
    </box>
  {/if}
</box>

## 本课总结

今天重点掌握了五件事：

1. **健康检查**：区分存活、就绪、依赖健康和 Worker 健康。
2. **配置管理**：静态配置、动态运行参数和敏感配置分别处理。
3. **优雅关闭**：停止接收新任务，妥善处理正在运行的任务。
4. **可靠恢复**：利用持久化状态、租约、fencing token 和副作用对账避免错误接管。
5. **生产部署**：将控制平面与代码执行环境隔离，并为资源、权限和运行时间设置边界。

下一课我们将进入第二十五课：**Harness 的成本预算、Token 管理与失控循环防护**，学习如何防止 Agent 因为反复思考、重复调用工具、不断修复同一问题而消耗大量时间和费用。
