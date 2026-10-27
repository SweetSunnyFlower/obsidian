---
title: "Docker 实战项目"
aliases:
  - "Docker Node PostgreSQL 示例"
  - "Docker Compose 实战"
tags:
  - docker
  - compose
  - project
  - postgresql
  - nodejs
created: "2026-10-27"
updated: "2026-10-27"
type: project
status: active
sources:
  - "https://docs.docker.com/compose/intro/compose-application-model/"
  - "https://docs.docker.com/compose/how-tos/startup-order/"
  - "https://docs.docker.com/build/building/best-practices/"
  - "https://docs.docker.com/engine/storage/volumes/"
  - "https://docs.docker.com/engine/network/"
---

# Docker 实战项目

> [!summary] 目标
> 从零构建一个 Node.js + PostgreSQL 的 Compose 项目：应用能连接数据库，数据写命名卷，启动顺序由 healthcheck 控制，最后完成验证、持久性测试与有边界的清理。

返回：[[Docker 知识地图]]

## 前提条件

- Docker Desktop 或 Docker Engine 已安装并启动。
- `docker compose version` 可用。
- 已安装 Node.js/npm，仅用于生成项目依赖锁文件；也可在已有项目中复用锁文件。
- 端口 `127.0.0.1:3000` 未被占用。

> [!important] 验证声明
> 2026-10-27 检查时，本机没有 `docker` 命令，因此下面的项目结构和命令按官方语法整理，但**尚未在本机实际运行**。完成后应以本文“验证”章节的实际输出为准。

## 项目结构

```text
docker-demo/
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
├── compose.yaml
├── Dockerfile
├── package.json
├── package-lock.json
└── server.js
```

## 1. 初始化项目

```bash
mkdir docker-demo
cd docker-demo
npm init -y
npm install pg
```

然后编辑 `package.json`，确保使用 ES modules 并提供启动脚本：

```json
{
  "name": "docker-demo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "pg": "^8"
  }
}
```

重新生成锁文件：

```bash
npm install
```

`package-lock.json` 应由 npm 真实生成，不要手写伪造。

## 2. 写一个最小健康服务

`server.js`：

```javascript
import http from "node:http";
import { Pool } from "pg";

const port = Number(process.env.PORT ?? 3000);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    sendJson(response, 200, {
      service: "docker-demo",
      message: "Docker Compose project is running",
    });
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    try {
      const result = await pool.query("SELECT NOW() AS now");
      sendJson(response, 200, {
        status: "ok",
        database: "ok",
        now: result.rows[0].now,
      });
    } catch (error) {
      console.error("database health check failed", {
        message: error.message,
      });
      sendJson(response, 503, {
        status: "degraded",
        database: "unavailable",
      });
    }
    return;
  }

  sendJson(response, 404, { error: "not found" });
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}, shutting down`);

  const forcedExit = setTimeout(() => {
    console.error("graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forcedExit.unref();

  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("shutdown failed", { message: error.message });
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, "0.0.0.0", () => {
  console.log(`docker-demo listening on ${port}`);
});
```

设计要点：

- 监听 `0.0.0.0`，让 Docker 端口转发和同网络其他容器能访问。
- `/health` 真的查询数据库，失败时返回 503。
- 日志写到 stdout/stderr，便于 `docker logs` 查看。
- 处理 `SIGTERM`，配合 `docker stop` 实现优雅退出。
- 不输出数据库密码。

## 3. 写 Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./

USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

`deps` 和 `runtime` 都使用同一基础镜像系列，但依赖安装与运行配置分离。`npm ci --omit=dev` 依赖锁文件，安装结果比 `npm install` 更适合可重复构建。

## 4. 配置上下文与忽略文件

`.dockerignore`：

```text
.git
.env
.env.*
node_modules
npm-debug.log*
coverage
compose*.yaml
```

`.gitignore`：

```text
.env
node_modules
*.log
```

`.env.example`：

```dotenv
POSTGRES_PASSWORD=replace-with-a-local-development-password
```

创建真实 `.env`，在编辑器里替换密码：

```bash
cp .env.example .env
```

不要提交 `.env`。这里的 `.env` 是本地开发方案，不是生产 secret manager。

## 5. 写 Compose 文件

`compose.yaml`：

```yaml
services:
  app:
    build: .
    environment:
      PORT: "3000"
      DB_HOST: db
      DB_PORT: "5432"
      DB_NAME: app
      DB_USER: app
      DB_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s
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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - app-net

networks:
  app-net: {}

volumes:
  db-data: {}
```

关键关系：

```mermaid
flowchart LR
  Browser[Mac 浏览器] -->|127.0.0.1:3000| App[app 容器 :3000]
  App -->|db:5432| DB[db 容器 :5432]
  DB --> Volume[(db-data 命名卷)]
  App -. app-net .- DB
```

## 6. 启动前校验

```bash
docker compose config
```

至少要检查：

- `.env` 是否被正确解析。
- 端口是否仍是 `127.0.0.1:3000:3000`。
- `DB_HOST` 是否为 `db`。
- `depends_on` 是否使用 `service_healthy`。
- 数据库卷是否解析为项目命名卷。

如果报变量必填错误，先检查当前目录和 `.env`：

```bash
docker compose config --environment
```

不要把真实密码粘到命令历史或聊天记录中用于排错。

## 7. 构建并启动

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail 100 app
docker compose logs --tail 100 db
```

期望：

- `db` healthcheck 变 healthy。
- `app` 在 db ready 后启动。
- app 健康检查最终 healthy。
- app 和 db 在同一 Compose 网络中。

## 8. 验证

### 应用入口

```bash
curl -sS http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/health
```

健康响应应包含 `status: "ok"` 和数据库时间。若根路径成功而 health 失败，说明容器和网络入口存在，但数据库连接或查询有问题。

### 容器内 DNS 与端口

```bash
docker compose exec app getent hosts db
docker compose exec app wget -q -O - http://127.0.0.1:3000/health
```

第一项确认 Compose service DNS；第二项确认应用在容器自身内部可响应。

### 直接检查数据库

```bash
docker compose exec db psql -U app -d app -c "SELECT current_database(), current_user;"
```

### 查看健康状态

```bash
docker compose ps
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q app)"
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q db)"
```

`$(...)` 会取 Compose 中具体容器的 ID；若项目名或 service 配置不同，先 `docker compose ps -q` 核对。

## 9. 验证数据持久化

写一条 PostgreSQL 数据：

```bash
docker compose exec db \
  psql -U app -d app \
  -c "CREATE TABLE IF NOT EXISTS demo_events (id bigserial PRIMARY KEY, created_at timestamptz DEFAULT now());"

docker compose exec db \
  psql -U app -d app \
  -c "INSERT INTO demo_events DEFAULT VALUES;"
```

重建容器，但保留命名卷：

```bash
docker compose down
docker compose up -d
docker compose exec db \
  psql -U app -d app \
  -c "SELECT count(*) AS event_count FROM demo_events;"
```

`down` 默认移除容器和网络，保留 `db-data` 卷，因此计数仍应存在。这是容器生命周期与数据生命周期的对照实验。

## 10. 变更与重建

修改 `server.js` 后：

```bash
docker compose up --build -d
docker compose logs -f app
```

只改数据库环境而无需重建 app 时，仍应先检查变更是否需要 recreation：

```bash
docker compose config
docker compose up -d
```

Docker Compose 会根据服务配置判断哪些容器需要重建；不要因为改了配置就无条件删除卷。

## 11. 有边界的清理

停止并可重新启动：

```bash
docker compose stop
docker compose start
```

停止并删除容器、网络，保留下一次可复用的卷：

```bash
docker compose down
```

只删除构建的本地服务镜像：

```bash
docker compose down --rmi local
```

### 仅在确认可以丢弃项目数据时

```bash
docker compose down -v
```

> [!danger] `-v` 的后果
> 这会删除项目声明的命名卷 `db-data`，数据库内容可能无法恢复。执行前先确认项目名、卷和已完成的备份。

## 完成标准

- [ ] `docker compose config` 通过。
- [ ] app 与 db 均启动，健康检查通过。
- [ ] `http://127.0.0.1:3000/health` 返回数据库可用。
- [ ] app 使用 service 名 `db`，没有使用 `localhost` 访问数据库。
- [ ] `docker compose down` 后重新 `up`，测试数据仍在。
- [ ] 知道 `docker compose down -v` 会删除数据库卷。
- [ ] `.env`、`.dockerignore`、`.gitignore` 阻止秘密进入 Git 和镜像上下文。

## 常见问题

| 问题 | 先查 |
| --- | --- |
| `POSTGRES_PASSWORD` required | `.env` 是否存在、变量名是否一致、是否在项目目录运行 |
| app 启动后连不上 db | `depends_on` condition、db health、`DB_HOST=db` |
| `/` 正常但 `/health` 503 | 数据库凭据、db 名称、网络连通性、数据库日志 |
| `npm ci` 失败 | `package-lock.json` 是否真实存在且与 `package.json` 同步 |
| app 容器非 root 写文件失败 | 当前示例不写业务文件；增加写目录时明确所有权或挂载 |
| 宿主 3000 端口被占用 | 换宿主端口或停止冲突进程，不要改错容器端口 |

更多诊断见[[Docker 故障排查]]。

## 相关笔记

- 构建镜像：[[Dockerfile 与镜像构建]]
- Compose 字段：[[Docker Compose]]
- service DNS：[[Docker 网络]]
- 命名卷：[[Docker 存储与数据卷]]
- 密码与最小权限：[[Docker 安全与权限]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “How Compose works”: <https://docs.docker.com/compose/intro/compose-application-model/>
- Docker Docs, “Control startup order”: <https://docs.docker.com/compose/how-tos/startup-order/>
- Docker Docs, “Building best practices”: <https://docs.docker.com/build/building/best-practices/>
- Docker Docs, “Volumes”: <https://docs.docker.com/engine/storage/volumes/>
- Docker Docs, “Networking overview”: <https://docs.docker.com/engine/network/>

核对日期：2026-10-27。项目尚未在当前机器运行；成功标准必须由实际 Docker 输出确认。
