---
title: "Docker Compose"
aliases:
  - "Compose"
  - "docker compose"
  - "Compose 编排"
tags:
  - docker
  - compose
  - orchestration
  - how-to
created: "2026-10-27"
updated: "2026-10-27"
type: how-to
status: active
sources:
  - "https://docs.docker.com/compose/"
  - "https://docs.docker.com/compose/intro/compose-application-model/"
  - "https://docs.docker.com/compose/how-tos/startup-order/"
  - "https://docs.docker.com/reference/compose-file/"
  - "https://docs.docker.com/reference/cli/docker/compose/"
---

# Docker Compose

> [!summary] 目标
> 用一个 `compose.yaml` 描述多容器应用，并通过 `docker compose` 管理整组 service、network 和 volume 的生命周期。

返回：[[Docker 知识地图]]

## 前提条件

- Docker Engine 与 Compose v2 插件可用。
- 项目目录中有一个 `compose.yaml`。
- 需要构建的服务有对应 Dockerfile。

检查：

```bash
docker version
docker compose version
```

现代命令是 `docker compose` 插件形式。`docker-compose` 是旧的独立命令，某些旧示例仍使用它，但不应把它与 v2 插件混为一谈。

## 心智模型

Compose 的核心不是“一个 YAML 含有多个容器”，而是**应用模型**：

```text
Project
├── service: web     → 一个或多个同镜像、同配置的容器
├── service: db
├── network: app-net → service 间的通信边界
└── volume: db-data  → 持久数据
```

- **service** 是逻辑计算组件，不是某个固定容器 ID。
- **project** 把一组资源放进同一命名和隔离范围。
- Compose 支持一个文件、多文件覆盖、环境变量替换和可选 profile。
- Compose 适合单机开发与部署；多主机调度、自动扩缩容和滚动发布应评估 Kubernetes 等平台。

## 文件命名与项目名

默认优先读取工作目录中的：

```text
compose.yaml
```

也兼容 `compose.yml`，并为旧项目兼容 `docker-compose.yaml` / `docker-compose.yml`。如果多个文件同时存在，Compose 会优先规范文件名 `compose.yaml`，所以不要无意识地留下多份互相冲突的配置。

同一份文件可以用不同项目名重复部署：

```bash
docker compose -p demo-a up -d
docker compose -p demo-b up -d
```

也可以在顶层显式写：

```yaml
name: my-stack
```

## 一个最小 Web + PostgreSQL 示例

```yaml
services:
  app:
    build: .
    environment:
      DB_HOST: db
      DB_PORT: "5432"
      DB_NAME: app
      DB_USER: app
      DB_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      db:
        condition: service_healthy
    networks:
      - app-net

  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    networks:
      - app-net

networks:
  app-net: {}

volumes:
  db-data: {}
```

本例是本地开发用配置：

- `app` 通过 service 名 `db` 连接数据库，而不是容器里的 `localhost`。
- 只把应用端口发布到宿主机的 loopback。
- `db-data` 是命名卷，容器重建后数据库数据仍可保留。
- DB 健康检查通过后，才启动依赖它的 app。
- 密码从宿主环境注入；`.env` 不应提交到版本库。

完整代码见[[Docker 实战项目]]。

## Compose 关键字段

### services

定义一个可运行组件。常见来源：

```yaml
build: .
```

或：

```yaml
image: nginx:1.27-alpine
```

同一个 service 的配置会传给它创建的所有容器。

### ports

```yaml
ports:
  - "127.0.0.1:8080:80"
```

格式是 `[宿主 IP:]宿主端口:容器端口`。不写宿主 IP 时，通常绑定所有宿主接口，可能被局域网访问。详见[[Docker 网络]]。

### depends_on

默认的 short syntax 只控制启动顺序，并不等待依赖真正可用：

```yaml
depends_on:
  - db
```

需要 readiness 时，使用 condition 与健康检查：

```yaml
depends_on:
  db:
    condition: service_healthy
    restart: true
```

可选条件包括：

- `service_started`
- `service_healthy`
- `service_completed_successfully`

`service_completed_successfully` 很适合一次性的 migration 或初始化 service。

### healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U app -d app"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 20s
```

健康检查应验证“依赖可以接请求”，而不是简单 `true`。应用本身也应有自己的健康端点。

### environment、.env 与 env_file

```yaml
environment:
  APP_MODE: development
```

`.env` 默认常被 Compose 用于**插值**：

```yaml
environment:
  APP_MODE: ${APP_MODE:-development}
```

这并不自动等于把所有 `.env` 变量放进容器；需要引用或配置 `env_file`。

不要把 `.env` 提交到 Git，也不要让运行时环境变量成为高价值生产秘密的唯一载体。生产环境应使用平台的 secrets 或外部密钥管理。

### volumes

```yaml
volumes:
  db-data:
```

加 service 级引用：

```yaml
volumes:
  - db-data:/var/lib/postgresql/data
```

注意顶层 `volumes` 是声明，service 中 `- db-data:...` 是挂载。

### networks

服务只有一个网络时可不显式命名，Compose 会创建项目级默认网络。显式网络更适合分段：

```yaml
services:
  web:
    networks: [front-tier, back-tier]
  db:
    networks: [back-tier]

networks:
  front-tier: {}
  back-tier:
    internal: true
```

这样 `db` 不直接出现在 front-tier 网络中。

## 生命周期工作流

### 1. 校验配置

```bash
docker compose config
```

它会展开变量并检查大部分结构问题，是启动前的低风险检查。

### 2. 构建并启动

```bash
docker compose pull
docker compose build
docker compose up -d
```

常见变体：

```bash
docker compose up --build -d
docker compose up --force-recreate
```

### 3. 观察状态

```bash
docker compose ps
docker compose logs --tail 100
docker compose logs -f app
```

### 4. 在 service 中执行一次性命令

```bash
docker compose exec app sh
docker compose run --rm app sh
docker compose run --rm --no-deps app <command>
```

区别：

- `exec` 进入或附加到已经在运行的 service 容器。
- `run` 新建一个一次性容器，适合 migration、测试或一次性脚本。
- `--no-deps` 可避免为了让一次性命令运行而启动依赖 services。

### 5. 停止与清理

```bash
docker compose stop
docker compose down
```

`stop` 保留容器；`down` 删除本项目的容器和网络，但默认保留命名卷。

> [!warning] 高风险清理
> `docker compose down -v` 会删除 Compose 文件声明的命名卷，可能永久丢失数据库和上传文件。执行前先确认项目名、卷和备份，不要把它当普通“重启”命令。

## 启动顺序不等于依赖就绪

容器“running”只表示主进程还在运行，不表示服务能接请求。关系是：

```text
service 创建
  → 主进程运行
  → healthcheck 通过
  → 依赖它的 service 启动（仅当使用 service_healthy）
```

建议组合：

1. 依赖服务有可靠 healthcheck。
2. 应用在启动时对短暂连接失败做重试。
3. 数据库变更由显式 migration 步骤负责。
4. 不依赖固定 `sleep 10` 猜测启动时间。

## 密钥的边界

Compose 支持 `secrets` 概念。本地 Compose 与 Swarm 的 secret 实现并不完全相同，文件权限和挂载方式可能受平台影响。

无论采用哪种方式，都应做到：

- 密钥不在镜像层、Dockerfile、Compose 文件或日志中。
- 密钥文件不提交到 Git。
- 应用以最小权限读取需要的 secret。
- 生产环境使用平台 secret manager，并支持轮换与审计。

## 常见误区

- **把 `depends_on` 当作 readiness**：普通 depends_on 只保证启动顺序。
- **用 `localhost` 访问另一个 service**：容器内部应使用 service 名称。
- **误删卷**：`down -v` 是数据风险操作。
- **以为 Compose 配置只能有容器**：网络、卷、configs、secrets 都是项目模型的一部分。
- **多份 Compose 文件同时存在却不清楚优先级**：先运行 `docker compose config`。
- **把开发用 Compose 当作多节点生产编排器**：它不具备跨主机调度和完整自愈能力。

## 相关笔记

- 构建 service 镜像：[[Dockerfile 与镜像构建]]
- service DNS 与端口：[[Docker 网络]]
- 命名卷与备份：[[Docker 存储与数据卷]]
- secret 与权限：[[Docker 安全与权限]]
- 端到端练习：[[Docker 实战项目]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “Docker Compose”: <https://docs.docker.com/compose/>
- Docker Docs, “How Compose works”: <https://docs.docker.com/compose/intro/compose-application-model/>
- Docker Docs, “Control startup and shutdown order”: <https://docs.docker.com/compose/how-tos/startup-order/>
- Docker Docs, “Compose file reference”: <https://docs.docker.com/reference/compose-file/>
- Docker Docs, “docker compose CLI”: <https://docs.docker.com/reference/cli/docker/compose/>

核对日期：2026-10-27。示例按官方 Compose 语法整理；当前机器未安装 Docker，因此没有运行 Compose 验证。
