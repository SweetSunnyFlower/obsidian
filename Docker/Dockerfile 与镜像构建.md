---
title: "Dockerfile 与镜像构建"
aliases:
  - "Dockerfile"
  - "Docker Build"
  - "镜像构建"
tags:
  - docker
  - dockerfile
  - build
  - how-to
created: "2026-10-27"
updated: "2026-10-27"
type: how-to
status: active
sources:
  - "https://docs.docker.com/reference/dockerfile/"
  - "https://docs.docker.com/build/building/best-practices/"
  - "https://docs.docker.com/build/building/multi-stage/"
  - "https://docs.docker.com/build/cache/"
  - "https://docs.docker.com/build/concepts/context/"
---

# Dockerfile 与镜像构建

> [!summary] 目标
> 写出可重复、体积可控、权限合理，并且能利用构建缓存的 Dockerfile。

返回：[[Docker 知识地图]]

## 前提条件

- Docker Engine 与 BuildKit 可用。现代的 `docker build` 默认使用 BuildKit 构建器。
- 项目根目录包含 Dockerfile、应用源码和依赖清单。
- 如果你使用示例中的 `npm ci`，项目里必须有 `package-lock.json`。

环境检查：

```bash
docker version
docker buildx version
```

## 心智模型

构建一次镜像可以分成四步：

```text
1. 读取 Dockerfile
2. 把 build context 发送给 builder
3. 按指令执行，生成层并复用缓存
4. 输出带 tag 的最终镜像
```

`docker build .` 末尾的 `.` 不是“Dockerfile 文件名”，而是**构建上下文**目录。Dockerfile 指令通常只能访问这个上下文中的文件，除非使用 `ADD` 的远程 URL、bind mount 或额外 context 等能力。

构建上下文越大，传输和扫描成本越高。先把无关文件排除掉：

```text
# .dockerignore
.git
node_modules
npm-debug.log*
.env
.env.*
!.env.example
coverage
Dockerfile*
compose*.yaml
```

不要盲目忽略应用运行时确实需要的文件。

## 一个实用的多阶段 Node.js 示例

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
```

这个示例体现了几个关键动作：

- 依赖清单先复制，源码后复制，避免每次改代码都重新安装全部依赖。
- 构建阶段与运行阶段分开；只把运行所需内容复制到最终镜像。
- 最终进程以镜像自带的非 root 用户 `node` 运行。
- `HEALTHCHECK` 检查应用是否真的能响应，而不只看进程是否存在。
- `CMD` 使用 exec form，让 Node 进程成为容器主进程并正确接收信号。

如果项目需要编译、测试或打包，增加一个 `build` 阶段，把产物复制到运行阶段：

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
```

## 关键指令怎么选

| 指令 | 作用 | 实践要点 |
| --- | --- | --- |
| `FROM` | 定义基础阶段 | 选可信、满足需求的最小基础镜像；需要复现时锁定版本或 digest |
| `WORKDIR` | 设置后续指令和主进程的工作目录 | 显式设置，避免依赖偶然的默认目录 |
| `COPY` | 从构建上下文或阶段复制文件 | 首选；明确复制范围 |
| `ADD` | 具备自动解压等附加能力 | 普通复制用 `COPY` 更可预期 |
| `RUN` | 在构建时执行命令并形成层 | 合并会一起失效的安装步骤，及时清理临时文件 |
| `ENV` | 设置镜像运行时环境变量 | 不应放密钥 |
| `ARG` | 构建时参数 | 不应把密钥当构建参数 |
| `USER` | 设置后续指令和主进程用户 | 运行阶段使用合适的非 root 用户 |
| `ENTRYPOINT` | 固定可执行程序 | exec form 更适合正确转发信号 |
| `CMD` | 提供默认命令或默认参数 | 可被运行时参数覆盖 |
| `EXPOSE` | 记录预期监听的端口 | 它不是端口发布 |
| `HEALTHCHECK` | 定义容器健康探测 | 探测真实业务信号，避免过短超时 |
| `VOLUME` | 声明需要外部存储的路径 | 不等于自动完成容量、权限和备份管理 |

官方 Dockerfile 参考是具体语法与平台差异的最终依据：<https://docs.docker.com/reference/dockerfile/>。

## ENTRYPOINT 与 CMD

常见组合：

```dockerfile
ENTRYPOINT ["/app/server"]
CMD ["--port", "3000"]
```

运行：

```bash
docker run my-app
docker run my-app --port 8080
```

第二次运行会用 `--port 8080` 替换默认 CMD 参数，而 ENTRYPOINT 仍然是 `/app/server`。

使用 exec form（JSON 数组）可以避免 shell 作为 PID 1 吞掉信号。确实需要 shell 展开时可以显式写：

```dockerfile
CMD ["sh", "-c", "exec /app/server --port \"${PORT:-3000}\""]
```

## 构建、检查与运行

```bash
docker build --pull -t my-app:1.0.0 .
docker image inspect my-app:1.0.0
docker image history --no-trunc my-app:1.0.0
docker run --rm -p 127.0.0.1:3000:3000 my-app:1.0.0
```

构建参数说明：

- `--pull`：检查基础镜像是否有更新。
- `--no-cache`：完全跳过复用构建缓存，不等于自动拉取新基础镜像。
- `--target <stage>`：只构建到指定阶段，适合调试或拆分测试/生产目标。
- `--progress plain`：需要更稳定的 CI 文本日志时使用。

一次全新构建：

```bash
docker build --pull --no-cache -t my-app:1.0.1 .
```

`--pull` 与 `--no-cache` 解决的问题不同；需要完全刷新时可以组合，但不要在每一次日常构建中无条件使用，否则会牺牲速度。

## 缓存为什么会失效

每一层依赖前一层。一个简化模型：

```text
FROM node:22-alpine
COPY package*.json ./
RUN npm ci
COPY . .          ← 改任何源码后，这一层和后续层失效
RUN npm run build
```

如果把 `COPY . .` 放在 `npm ci` 之前，每次改一行源码也可能让对方依赖安装层失效。

常见原则：

- 变化频率低的步骤放前面。
- 复制少量、稳定的依赖清单，再安装依赖。
- 复制易变源码放后面。
- 用 `.dockerignore` 阻断无关文件导致的缓存失效。
- 用 BuildKit 的 cache mount 优化包管理器下载，但先理解 CI 与本地缓存后端。

## 可复现性与基础镜像

标签可能被重新指向。例如 `alpine:3.21` 在不同时间可能指向不同 patch。需要更强复现时：

```dockerfile
FROM alpine:3.21@sha256:<digest>
```

这会牺牲自动获取安全补丁的便利性，因此必须配合定期重建与依赖更新，不是“钉死后再也不管”。

基础镜像选择建议：

- 优先可信来源和受维护的官方镜像。
- 选满足运行时需求的最小集合。
- 定期重建以获取基础镜像和系统包更新。
- 关注镜像来源、体积、漏洞和维护频率。

## 密钥与构建参数

下面做法容易泄漏：

```dockerfile
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > /root/.npmrc
```

构建参数可能出现在构建历史、日志或镜像元数据中，而且这一层可能保留凭证文件。不要把 ARG/ENV 当作秘密存储。

BuildKit 可以临时挂载 secret：

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npm_token \
  NPM_TOKEN="$(cat /run/secrets/npm_token)" \
  npm ci
```

```bash
docker build --secret id=npm_token,src=.npm_token -t my-app:1.0.0 .
```

仍需确保命令不会把 secret 输出到日志；secret mount 只是避免它直接固化进最终层。

## 常见误区

- **把所有依赖和服务塞进一个镜像**：拆分关注点通常更容易测试、更新和排错。
- **只用 `latest`**：会降低可重复性和变更可追踪性。
- **运行阶段仍是 root**：增加容器逃逸后的影响面。
- **HEALTHCHECK 只检查进程**：应检查应用能处理真实请求或关键依赖。
- **`COPY . .` 却没有 `.dockerignore`**：可能复制 `.env`、`.git`、大目录和本机依赖。
- **构建失败就统一 `--no-cache`**：先定位哪一层输入变化，避免掩盖原因。

## 验证清单

构建后至少确认：

```bash
docker run --rm my-app:1.0.0 <non-server-command>
docker image inspect my-app:1.0.0
docker history my-app:1.0.0
docker run --rm -p 127.0.0.1:3000:3000 my-app:1.0.0
```

- 容器能否正常启动？
- 应用是否监听 `0.0.0.0`，而不是只监听容器内部的 `127.0.0.1`？
- 健康检查是否通过？
- 运行用户是否非 root？
- 镜像内是否出现构建工具、测试数据、`.env` 或凭证？
- 删除并重建容器后，应用是否仍可工作？

## 相关笔记

- 镜像与容器生命周期：[[镜像与容器]]
- 多容器编排：[[Docker Compose]]
- 持久数据：[[Docker 存储与数据卷]]
- 镜像和运行时安全：[[Docker 安全与权限]]
- 排错：[[Docker 故障排查]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “Dockerfile reference”: <https://docs.docker.com/reference/dockerfile/>
- Docker Docs, “Building best practices”: <https://docs.docker.com/build/building/best-practices/>
- Docker Docs, “Multi-stage builds”: <https://docs.docker.com/build/building/multi-stage/>
- Docker Docs, “Docker build cache”: <https://docs.docker.com/build/cache/>
- Docker Docs, “Build context”: <https://docs.docker.com/build/concepts/context/>

核对日期：2026-10-27。命令按官方语法整理；当前机器未安装 Docker CLI，未执行本地构建。
