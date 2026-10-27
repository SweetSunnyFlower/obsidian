---
title: "Docker 故障排查"
aliases:
  - "Docker Troubleshooting"
  - "Docker 排错"
  - "Docker 常见错误"
tags:
  - docker
  - troubleshooting
created: "2026-10-27"
updated: "2026-10-27"
type: troubleshooting
status: active
sources:
  - "https://docs.docker.com/engine/daemon/troubleshoot/"
  - "https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/"
  - "https://docs.docker.com/engine/containers/resource_constraints/"
  - "https://docs.docker.com/engine/logging/"
  - "https://docs.docker.com/engine/network/"
---

# Docker 故障排查

> [!summary] 用途
> 用固定顺序区分 daemon、镜像、容器进程、应用日志、网络、挂载、健康和资源问题，避免一上来就重启或清理。

返回：[[Docker 知识地图]]

## 先按症状分流

| 症状 | 首要证据 | 先看 |
| --- | --- | --- |
| `docker` 命令不存在 | shell PATH、安装状态 | 本文“CLI 或 daemon 不可用” |
| `Cannot connect to the Docker daemon` | `docker version` Client/Server | daemon 或 Docker Desktop 状态 |
| 容器启动后立即 `Exited` | 退出码、日志、主进程命令 | 本文“容器退出或重启循环” |
| 页面 `502` / 连接拒绝 | 监听地址、发布端口、上游日志 | [[Docker 网络]] |
| 容器名解析失败 | 网络成员关系、service 名 | [[Docker 网络]] |
| 容器写文件失败 | 挂载类型、UID/GID、只读标记 | [[Docker 存储与数据卷]] |
| 容器反复重启 | healthcheck、依赖、OOM、命令 | 本文“健康检查与重启” |
| 磁盘空间不足 | `docker system df -v`、宿主容量 | 本文“磁盘与资源” |
| Mac 上极慢 | 文件共享 I/O、Desktop 资源 | 本文“Docker Desktop 性能” |

## 快速诊断：先收集，不改变

```bash
docker version
docker info
docker ps -a
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker compose ps
docker compose logs --tail 200
```

单个容器：

```bash
docker logs --tail 200 --timestamps <container>
docker inspect <container>
docker inspect --format \
  'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' \
  <container>
docker inspect --format '{{json .Config.Cmd}}' <container>
docker inspect --format '{{json .Config.Entrypoint}}' <container>
docker inspect --format '{{json .Mounts}}' <container>
docker inspect --format '{{json .NetworkSettings.Networks}}' <container>
```

这些读取操作通常比立即 `down -v`、`system prune` 或强制重建更安全，也能保留现场。

## CLI 或 daemon 不可用

### 症状

```text
zsh: command not found: docker
```

或：

```text
Cannot connect to the Docker daemon...
```

### 快速诊断

```bash
command -v docker
docker version
docker context ls
```

判断：

- 找不到命令：Docker CLI 尚未安装，或 PATH 未包含其安装位置。
- Client 可见、Server 连接失败：daemon 未启动、context 指向错误、远程通道断开或权限不足。
- 远程 context：确认 SSH/网络与目标 daemon。

macOS 通常先确认 Docker Desktop 已启动；Linux Engine 通常检查服务状态和 daemon 日志。具体修复命令取决于安装方式，不要把某个发行版的 `systemctl` 步骤套到其他平台上。

> [!note] 当前机器状态
> 2026-10-27 检查时，这台 Mac 的 shell 返回 `command not found: docker`。因此本页示例未在本机运行；先完成 Docker Desktop 或可用 Engine 的安装与启动，才能验证后续命令。

## 容器退出或重启循环

### 先看退出码

| 退出码 | 常见含义 | 进一步动作 |
| --- | --- | --- |
| `0` | 主进程正常结束 | 它是否本来就是一次性任务？容器是否需要 `restart`？ |
| `1` | 应用自定义失败 | 看日志和启动命令 |
| `125` | Docker 命令本身失败 | 检查 docker 报错与参数 |
| `126` | 命令存在但不可执行 | 检查执行权限、路径和架构 |
| `127` | 命令未找到 | 检查 PATH、COPY 目标和入口点 |
| `137` | 收到 `SIGKILL`，常见于 OOM 或强制终止 | 同时检查 `OOMKilled` |
| `143` | 常见于收到 `SIGTERM` 后退出 | 检查停止流程和信号处理 |

```bash
docker inspect --format \
  'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' \
  <container>
```

### 最常见原因

1. **主进程执行完就退出**：容器适合前台主进程；后台 daemon 化的程序可能让 PID 1 立即结束。
2. **入口点或命令错误**：`ENTRYPOINT` 与 `CMD` 组合后被覆盖，或路径不存在。
3. **配置或挂载错误**：挂载遮住应用文件，或配置值不合法。
4. **数据库/上游未就绪**：应用启动时没有重试。
5. **文件权限不足**：非 root 用户不能读代码、写缓存或访问证书。
6. **OOM**：应用被内核终止。

验证主进程：

```bash
docker inspect --format 'entrypoint={{json .Config.Entrypoint}} cmd={{json .Config.Cmd}}' <container>
```

临时覆盖命令需要镜像中有对应工具：

```bash
docker run --rm -it --entrypoint sh IMAGE
```

如果镜像没有 shell，就不能靠 `sh` 进入；应基于相同构建阶段增加 debug 目标，或使用单独诊断容器。

## 应用日志不可用或信息不足

```bash
docker logs --since 15m --timestamps <container>
docker logs --tail 500 <container>
docker inspect --format '{{json .HostConfig.LogConfig}}' <container>
```

常见原因：

- 应用写到容器内文件，而不是 stdout/stderr。
- 日志驱动或配置导致查看方式不同。
- 容器刚重启，旧容器日志已经随容器删除。
- 应用在输出前就崩溃，需看容器运行时错误而不是业务日志。

一般应让应用把日志写到 stdout/stderr，交给 Docker 或平台采集。长期服务应配置日志轮转，避免宿主磁盘被日志占满。

## 端口无效或已被占用

### 检查映射

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
docker port <container>
docker compose port app 3000
```

`-p 127.0.0.1:8080:3000` 的含义是：

```text
宿主 loopback:8080 → 容器:3000
```

不要写反方向，也不要假设 `EXPOSE` 已经发布。

### 检查容器内监听

```bash
docker exec <container> sh -c 'ss -lnt || netstat -lnt'
```

如果应用只监听 `127.0.0.1:3000`，从其他容器或端口映射访问通常失败。容器内服务一般需要监听 `0.0.0.0`，具体框架配置方式不同。

### 检查宿主端口占用

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

macOS 和 Linux 都常用 `lsof` 做这条检查；工具不存在时改用系统的端口查看工具。

常见 Docker 报错是 `port is already allocated`，处理方式是换端口或停止真正占用该端口的进程，而不是反复重启容器。

## 容器之间无法通信

按顺序测：

```bash
docker ps --format 'table {{.Names}}\t{{.Networks}}'
docker network inspect <network>
docker exec <client> getent hosts <target-service>
```

再测目标服务：

```bash
docker exec <client> curl -v http://<target-service>:<port>/health
```

诊断逻辑：

1. 两个容器是否在同一用户自定义网络？
2. Compose service 名是否就是访问名？
3. 目标应用是否监听容器端口？
4. 协议是否正确？HTTP、TCP、数据库协议不能混测。
5. 是否把容器内 `localhost` 当成另一个 service？
6. 目标容器是否健康，而不只是处于 running？

完整模型见[[Docker 网络]]。

## 健康检查与重启

```bash
docker inspect --format '{{json .State.Health}}' <container>
docker inspect --format '{{json .Config.Healthcheck}}' <image>
docker compose ps
```

典型原因：

- healthcheck 命令在最终镜像中不存在。
- 检查了错误端口或路径。
- `start_period` 太短，应用还未完成启动。
- 依赖数据库尚未 ready，应用本身持续报错。
- `depends_on` 没使用 `condition: service_healthy`。
- 使用 `restart: always` 掩盖了确定性启动错误。

修复方向：

- 健康检查使用镜像确实存在的工具。
- 提供专门的 `/health` 或协议级 readiness 检查。
- 应用对短暂依赖失败做有限重试。
- 把 migration 做成显式一次性步骤。
- 查看日志而不是只看重启次数。

## 文件权限与挂载错误

```bash
docker exec <container> id
docker inspect --format '{{json .Mounts}}' <container>
```

常见现象：

- `Permission denied`
- `read-only file system`
- 宿主出现 root 拥有的文件
- 容器启动时报找不到配置文件

原因：

- bind mount 默认读写，宿主文件权限决定容器用户能否访问。
- 容器 UID/GID 与宿主用户不一致。
- 把目录挂载到非空目标路径，遮住了镜像内容。
- `:ro` 或 `--read-only` 阻止应用写必要目录。

修复时应调整文件所有权/目录或应用写路径，避免简单使用 `chmod 777` 扩大风险。

存储模型见[[Docker 存储与数据卷]]。

## OOM 与资源不足

检查：

```bash
docker inspect --format \
  'oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' \
  <container>
docker stats --no-stream
docker info
```

典型信号：

- `OOMKilled=true`
- 退出码常见为 `137`
- 容器在内存增长时被终止

排查：

1. 这是宿主整体内存不足，还是容器限制过低？
2. 应用是否有泄漏或启动峰值过高？
3. 设置的内存限制是否基于测量而不是猜测？
4. `--memory-swap` 和宿主 swap 是否让观测复杂化？
5. 是否需要限制 CPU、PID 和日志总量？

直接提高限制前先判断原因，否则可能把问题转移到宿主机。

## 磁盘空间不足

先查容量：

```bash
df -h
docker system df
docker system df -v
docker image ls
docker ps -a --size
docker volume ls
```

常见占用：

- 镜像层和旧构建缓存。
- 已停止容器。
- 未使用但仍有价值的命名卷。
- 容器日志。
- 容器内应用数据写进可写层。

只有在确认对象和备份后才清理。`docker system prune --volumes` 可能删除重要卷。

## 镜像拉取或构建失败

```bash
docker pull IMAGE
docker build --progress plain -t my-app:debug .
docker buildx ls
```

常见原因：

- 镜像名/tag 不存在或当前架构无匹配 manifest。
- registry 认证失败。
- 代理、DNS 或 TLS 问题。
- 构建上下文缺少文件，被 `.dockerignore` 排除。
- 基础镜像或包下载失败。
- 构建缓存状态与预期不一致。

不要先统一 `--no-cache` 解决所有问题；先看具体失败层和命令。

## Docker Desktop 性能

macOS 上的 Linux 容器运行在虚拟机边界内。常见慢点：

- 大量小文件的 bind mount I/O。
- node_modules、数据库数据文件放在跨虚拟机的宿主目录。
- Docker Desktop 分配的 CPU/内存不足。
- 镜像构建没有利用缓存。

调整顺序：

1. 用 `docker stats` 判断 CPU/内存。
2. 用构建日志判断是否每次都在重装依赖。
3. 把不适合频繁跨边界的目录移到 volume 或容器内部。
4. 再评估 Docker Desktop 资源设置。

不要为了“变快”任意给容器过量资源或关闭安全机制。

## 预防清单

- 应用主进程前台运行，正确处理 `SIGTERM`。
- Dockerfile 固定依赖和基础镜像策略，保留构建日志。
- 使用健康检查与可靠的 readiness 依赖。
- 本地端口优先绑定 `127.0.0.1`。
- 配置日志轮转和资源限制。
- 持久数据放 volume，按应用语义备份。
- Compose 启动前运行 `docker compose config`。
- 清理命令先观察对象，再限定目标。
- 保留 `docker version`、`docker info`、容器状态、日志和 inspect 摘要作为故障证据。

## 相关笔记

- 基础对象：[[镜像与容器]]
- 构建问题：[[Dockerfile 与镜像构建]]
- Compose：[[Docker Compose]]
- 网络：[[Docker 网络]]
- 存储：[[Docker 存储与数据卷]]
- 安全：[[Docker 安全与权限]]
- 命令：[[Docker 命令速查]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “Troubleshoot the Docker Engine daemon”: <https://docs.docker.com/engine/daemon/troubleshoot/>
- Docker Docs, “Troubleshoot Docker Desktop”: <https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/>
- Docker Docs, “Resource constraints”: <https://docs.docker.com/engine/containers/resource_constraints/>
- Docker Docs, “Logging”: <https://docs.docker.com/engine/logging/>
- Docker Docs, “Networking overview”: <https://docs.docker.com/engine/network/>

核对日期：2026-10-27。命令按官方行为整理，但因当前机器没有 Docker CLI，尚未做本地运行验证。
