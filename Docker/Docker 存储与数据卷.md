---
title: "Docker 存储与数据卷"
aliases:
  - "Docker Volumes"
  - "Docker 持久化"
  - "容器数据存储"
tags:
  - docker
  - storage
  - volumes
  - bind-mounts
created: "2026-10-27"
updated: "2026-10-27"
type: concept
status: active
sources:
  - "https://docs.docker.com/engine/storage/volumes/"
  - "https://docs.docker.com/engine/storage/bind-mounts/"
  - "https://docs.docker.com/engine/storage/tmpfs/"
  - "https://docs.docker.com/reference/cli/docker/volume/"
---

# Docker 存储与数据卷

> [!summary] 一句话
> 容器的可写层只适合临时数据；需要跨容器重建保留的数据应放入 volume，需要直接编辑宿主文件时使用 bind mount，明确不需要落盘的临时数据可以用 tmpfs。

返回：[[Docker 知识地图]]

## 它是什么

Docker 常见存储方式分三类：

| 方式 | 数据位置 | 由谁管理 | 适合 |
| --- | --- | --- | --- |
| Volume | Docker 管理的宿主存储区域 | Docker | 数据库、上传文件、需要备份迁移的持久数据 |
| Bind mount | 用户指定的宿主路径 | 用户/宿主系统 | 开发源码、配置、构建产物、宿主文件交换 |
| tmpfs | 内存 | 宿主内核 | 临时缓存、敏感短生命周期文件 |

容器还有一层**可写层**。它随容器生命周期存在，删除容器时通常会被删除。

## 为什么重要

容器设计为可替换：停止、删除、重新创建应该是常规操作。如果把重要状态只放在可写层，新容器无法继承原来的数据。

存储选择还影响：

- 备份与恢复方式。
- 性能。
- 文件权限。
- 多容器共享。
- 宿主机可移植性。
- 安全边界与数据暴露面。

## 心智模型

```text
镜像只读层
  + 容器可写层        → 随当前容器删除
  + volume 挂载       → Docker 管理，默认独立于容器
  + bind mount        → 宿主路径，生命周期由外部世界决定
  + tmpfs             → 内存，重启/移除后消失
```

可以把挂载理解为“在容器某个路径上覆盖另一个数据源”。挂载到非空目录时，原目录中的内容可能被遮住。

## Volume

Volume 是官方推荐的容器持久数据机制。命名卷有可读名称，便于显式挂载和备份：

```bash
docker volume create app-data
docker volume ls
docker volume inspect app-data
```

挂载到容器：

```bash
docker run -d \
  --name app \
  --mount type=volume,src=app-data,dst=/data \
  alpine sleep 1d
```

一般优先使用 `--mount`，因为它更显式，并支持更多选项。等价的简写是：

```bash
docker run -d --name app -v app-data:/data alpine sleep 1d
```

### 生命周期

- Volume 默认不随容器删除。
- 多个容器可以同时挂载同一个卷。
- 匿名卷会得到随机名称。
- 不再使用的卷不会自动消失，需要显式删除或清理。
- `docker compose down` 默认保留命名卷；`down -v` 会删除它。

### 空卷的初始化

如果挂载一个空卷到容器内原本有内容的目录，Docker 默认可能把目标目录中的内容复制进空卷，用于初始化数据。如果卷已有内容，卷中的内容会遮蔽镜像中的原目录内容。

排错时需要问：

```text
这里是空卷首次初始化，还是把已有卷挂到了错误路径？
```

## Bind mount

Bind mount 把宿主上的文件或目录直接暴露给容器：

```bash
docker run --rm \
  --mount type=bind,src="$PWD",dst=/workspace,readonly \
  alpine sh -c 'ls -la /workspace'
```

简写：

```bash
docker run --rm -v "$PWD":/workspace:ro alpine sh -c 'ls -la /workspace'
```

### 适用场景

- 本地开发时把源码挂进容器，宿主修改立即可见。
- 把宿主配置文件只读注入容器。
- 把构建产物或导出的文件保存到宿主。
- 在宿主和容器之间明确交换文件。

### 风险

- 默认读写，容器进程可以修改宿主文件。
- 容器与宿主路径强耦合，换主机后路径可能不存在。
- 容器内的 UID/GID 与宿主文件所有权可能不匹配。
- 挂载到错误路径会遮住应用原本文件，导致容器无法启动。
- 对数据库直接使用 bind mount 时，宿主文件系统与容器用户的权限配置更复杂。

开发源码通常可加 `:ro`；需要构建输出时，再为具体输出目录提供独立可写挂载。

### macOS 注意

Docker Desktop 的 daemon 运行在 Linux 虚拟机中，但它为常见宿主路径提供文件共享。对容器来说，挂载路径仍是绝对路径；“当前目录”要在宿主 shell 中展开：

```bash
docker run --rm -v "$PWD":/workspace:ro alpine ls /workspace
```

大量小文件、依赖安装和数据库文件放在 Docker Desktop 的绑定目录中，可能比 Linux 原生环境慢。开发时通常把依赖目录和数据库数据放到 volume 或容器内部路径，而非把整个高 I/O 目录从 Mac 绑定进去。

## tmpfs

tmpfs 只存在内存中，适合可以丢失、无需落盘的临时数据：

```bash
docker run --rm \
  --mount type=tmpfs,dst=/tmp,tmpfs-size=64m \
  alpine sh -c 'df -h /tmp'
```

容器停止后 tmpfs 内容消失。它不是备份机制，也占用宿主内存。

## Compose 中的选择

命名卷：

```yaml
services:
  db:
    image: postgres:18-alpine
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data: {}
```

Bind mount：

```yaml
services:
  web:
    image: nginx:1.27-alpine
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro
```

注意：

- 顶层 `volumes: db-data: {}` 是声明。
- service 里的 `db-data:/...` 是挂载。
- 以 `.` 或 `/` 开头的 source 通常是 bind mount。
- 短名称 source 通常是命名卷；不要同时出现同名宿主目录而误以为一定绑定到它。

用以下命令查看解析后的 Compose 文件：

```bash
docker compose config
```

## 备份与恢复

### 通用归档方法

适合无持续写入或能停机一致性地导出的文件卷：

```bash
docker run --rm \
  --mount type=volume,src=app-data,dst=/data,readonly \
  --mount type=bind,src="$PWD",dst=/backup \
  alpine sh -c 'tar czf /backup/app-data.tgz -C /data .'
```

恢复：

```bash
docker run --rm \
  --mount type=volume,src=app-data,dst=/data \
  --mount type=bind,src="$PWD",dst=/backup,readonly \
  alpine sh -c 'tar xzf /backup/app-data.tgz -C /data'
```

恢复前要确认：

- 目标卷是否正确。
- 是否有服务仍在写入。
- 备份是否完整且做过恢复演练。
- 卷内 UID/GID 是否能让应用重新读写。

### 数据库优先使用逻辑备份

直接复制运行中数据库文件不保证一致性。优先使用数据库自带工具，例如 PostgreSQL：

```bash
docker compose exec -T db pg_dump -U app -d app > backup.sql
```

具体用户、数据库名和认证方式按项目调整。恢复、版本兼容与备份保留策略需要另行设计，Docker 本身不提供数据库备份语义。

## 检查

```bash
docker volume ls
docker volume inspect app-data
docker inspect --format '{{json .Mounts}}' app
docker compose config --volumes
```

`docker inspect` 的 `Mounts` 可以确认：

- `Type` 是 volume 还是 bind。
- source 与 destination 是否符合预期。
- 是否只读。

## 危险操作

> [!danger] 删除前先确认数据价值
> `docker volume prune`、`docker system prune --volumes`、`docker compose down -v` 都可能删除容器不再使用的数据。命名卷“未挂载”不代表可以丢弃；它可能只是服务暂时停机。

更安全的顺序：

```text
停服务
  → 确认卷名与内容
  → 做备份并验证
  → 再删除目标明确的卷
```

## 常见误区

- **“有 volume 就等于有备份”**：卷只解决持久化，不解决误删、损坏和灾难恢复。
- **“删除容器一定删数据”**：命名卷通常保留；可写层会删除。
- **“卷一定比 bind mount 快”**：取决于平台、驱动和 I/O 模式；volume 通常更适合持久数据。
- **“数据库文件能直接热拷贝”**：运行中复制可能产生不一致状态。
- **“只读挂载就是只读容器”**：它只限制这个挂载，不限制其他路径或容器可写层。

## 相关笔记

- 容器可写层：[[镜像与容器]]
- Compose 卷声明：[[Docker Compose]]
- 文件权限与安全：[[Docker 安全与权限]]
- 数据问题排错：[[Docker 故障排查]]
- 项目实践：[[Docker 实战项目]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “Volumes”: <https://docs.docker.com/engine/storage/volumes/>
- Docker Docs, “Bind mounts”: <https://docs.docker.com/engine/storage/bind-mounts/>
- Docker Docs, “tmpfs mounts”: <https://docs.docker.com/engine/storage/tmpfs/>
- Docker Docs, “docker volume”: <https://docs.docker.com/reference/cli/docker/volume/>

核对日期：2026-10-27。
