---
title: "Docker 网络"
aliases:
  - "Docker Networking"
  - "容器网络"
  - "容器端口映射"
tags:
  - docker
  - networking
created: "2026-10-27"
updated: "2026-10-27"
type: concept
status: active
sources:
  - "https://docs.docker.com/engine/network/"
  - "https://docs.docker.com/engine/network/port-publishing/"
  - "https://docs.docker.com/reference/cli/docker/network/"
  - "https://docs.docker.com/reference/compose-file/networks/"
---

# Docker 网络

> [!summary] 一句话
> Docker 网络决定容器能否互相访问；容器端口是否对宿主机和外界开放，则由端口发布单独决定。

返回：[[Docker 知识地图]]

## 它是什么

Docker 为容器创建网络命名空间、接口、IP、路由和 DNS 配置。容器本身通常不知道对端是不是 Docker 容器，它只看到普通网络接口和 DNS 结果。

Linux Docker Engine 常见的网络驱动：

| 驱动 | 用途 | 典型场景 |
| --- | --- | --- |
| `bridge` | 单宿主内部虚拟网络 | 本地开发、单机多容器 |
| `host` | 与宿主共享网络栈 | 对延迟/端口有特殊要求，但会降低隔离 |
| `none` | 不提供外部网络 | 完全离线的处理任务 |
| `overlay` | 跨多个 Docker daemon 的虚拟网络 | Swarm 等集群场景 |
| `ipvlan` / `macvlan` | 让容器更直接地接入底层网络 | VLAN、特定网络拓扑 |

大多数单机应用从**用户自定义 bridge 网络**开始就足够。

## 为什么重要

网络问题通常来自四个不同层次：

1. **DNS**：对端名称是否解析到正确容器？
2. **连通性**：两个容器是否在同一网络？
3. **监听地址**：应用是否在 `0.0.0.0` 而不是只监听容器自己的 `127.0.0.1`？
4. **端口发布**：宿主端口是否真的映射到容器端口？

把这几层分开，比反复重启容器有效得多。

## 心智模型

```mermaid
flowchart LR
  Host[宿主机 127.0.0.1:8080]
  Web[web 容器 :3000]
  DB[db 容器 :5432]
  Net[app-net 用户自定义 bridge]

  Host -->|-p 127.0.0.1:8080:3000| Web
  Web <-->|service/container DNS| Net
  Net <-->|db:5432| DB
```

两个关键地址链：

```text
宿主机访问：宿主 IP / 发布端口
容器互访：service 名称 / 容器端口
```

## 默认 bridge 与用户自定义 bridge

未指定网络时，容器通常连接到默认 bridge：

```bash
docker run --rm alpine ip addr
```

默认 bridge 的限制之一是：容器之间不能仅靠名称自动解析，通常要依赖 IP 或额外配置。

用户自定义 bridge 会提供自动 DNS。只要容器连接到同一用户自定义网络，就能按容器名访问：

```bash
docker network create app-net

docker run -d \
  --name target \
  --network app-net \
  alpine sleep 1d

docker run --rm \
  --network app-net \
  busybox nslookup target
```

Compose 会创建项目级网络，并让 service 名成为网络中的 DNS 名称。因此应用连接数据库时使用：

```text
db:5432
```

而不是：

```text
localhost:5432
```

## 端口发布

### 命令语法

```bash
docker run -p <宿主IP>:<宿主端口>:<容器端口>/<协议> IMAGE
```

示例：

| 写法 | 含义 |
| --- | --- |
| `-p 8080:80` | 发布到宿主所有接口的 8080，指向容器 80/TCP |
| `-p 127.0.0.1:8080:80` | 仅允许通过宿主 loopback 访问 |
| `-p 192.0.2.10:8080:80` | 绑定到指定宿主 IP 的 8080 |
| `-p 8080:80/udp` | 发布 UDP 端口 |

### `EXPOSE` 不等于发布

Dockerfile 中的：

```dockerfile
EXPOSE 3000
```

提供镜像元数据和文档语义。它不会自动在宿主机开放端口。运行时仍需 `-p` 或 `--publish`。

### 默认暴露风险

不写宿主 IP 的 `-p 8080:80` 通常绑定到所有宿主地址，不只是 `127.0.0.1`。官方文档明确提醒，发布端口后可能对宿主机外的网络可见。

本地开发优先：

```bash
-p 127.0.0.1:8080:80
```

如果服务必须对外提供，应由防火墙、反向代理、认证和网络策略共同控制。

## 同一网络不等于同一主机端口

在同一用户自定义网络中，容器可以直接访问其他容器的**容器端口**，无需先发布到宿主机：

```text
web 容器 -> http://api:3000
```

只有从宿主机或宿主外部访问时，才需要端口发布：

```text
浏览器 -> http://127.0.0.1:8080 -> web 容器 :3000
```

这个区别是 Compose 配置中最常见的误区之一。

## Compose 网络示例

```yaml
services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - front-tier

  api:
    image: my-api:1.0.0
    expose:
      - "3000"
    networks:
      - front-tier
      - back-tier

  db:
    image: postgres:18-alpine
    networks:
      - back-tier

networks:
  front-tier: {}
  back-tier:
    internal: true
```

设计含义：

- `web` 可访问 `api`，只把自身 80 端口映射到宿主 loopback。
- `api` 同时处于前后两层网络。
- `db` 只在 `back-tier`，不对 front 网络直接开放。
- `internal: true` 限制该网络的外部连接能力；数据库自身仍可能只需内部通信。

网络结构应按信任边界设计，而不只是让所有 service 默认连在一起。

## 诊断步骤

### 1. 确认容器和网络

```bash
docker ps --format 'table {{.Names}}\t{{.Networks}}\t{{.Ports}}'
docker network ls
docker network inspect app-net
```

### 2. 从源容器测 DNS

```bash
docker exec app getent hosts db
```

成功说明名称能解析；失败先检查是否在同一网络。

### 3. 从源容器测目标端口

如果容器内有 `curl`：

```bash
docker exec app curl -v http://web:3000/health
```

如果镜像非常精简，可能需要临时诊断容器；不要在正式镜像里为了排错永久塞入大量工具。

### 4. 检查监听地址

```bash
docker exec app sh -c 'ss -lnt || netstat -lnt'
```

应用监听 `127.0.0.1:3000` 时，只有容器内部能访问；要让其他容器或端口发布访问，通常需要监听 `0.0.0.0`（具体取决于运行框架）。

### 5. 检查发布的宿主端口

```bash
docker port app
docker compose port app 3000
```

在宿主机检查监听：

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

## 常见症状与原因

| 症状 | 优先检查 |
| --- | --- |
| 容器访问 `db` 报 “name or service not known” | 是否在同一网络、service 名是否拼写正确 |
| 从容器访问 `localhost:5432` 失败 | `localhost` 指向当前容器，不是 db 容器 |
| 宿主机访问不到发布端口 | 应用是否监听 `0.0.0.0`、映射是否写反 |
| 容器互访要发布端口 | 不需要；使用同一网络的容器名和容器端口 |
| 对外暴露了不该暴露的端口 | 是否省略了 `127.0.0.1` 宿主 IP |
| 容器能 ping 通但业务失败 | 目标服务是否正常监听指定协议/端口 |
| 重启后 IP 变化导致失败 | 应使用 DNS 名称，而不是硬编码容器 IP |

## 常见误区

- **把宿主机端口当容器端口**：映射方向是 `宿主机:容器`。
- **从服务端响应里硬编码容器 IP**：容器重建后 IP 可能变化，使用 service/container name。
- **认为同一宿主的不同 bridge 网络自动互通**：默认不能依赖这种互通；需要连接网络或显式发布。
- **忽略 `host` 模式的隔离影响**：共享宿主网络栈会改变端口和访问模型。
- **一上来就上 overlay**：单机问题通常用 bridge 和 DNS 就能解决。

## 相关笔记

- 容器生命周期：[[镜像与容器]]
- Compose 编排：[[Docker Compose]]
- 端口与 DNS 排错：[[Docker 故障排查]]
- 实战验证：[[Docker 实战项目]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “Networking overview”: <https://docs.docker.com/engine/network/>
- Docker Docs, “Port publishing and mapping”: <https://docs.docker.com/engine/network/port-publishing/>
- Docker Docs, “docker network”: <https://docs.docker.com/reference/cli/docker/network/>
- Docker Docs, “Compose networks reference”: <https://docs.docker.com/reference/compose-file/networks/>

核对日期：2026-10-27。
