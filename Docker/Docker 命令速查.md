---
title: "Docker 命令速查"
aliases:
  - "Docker Cheatsheet"
  - "Docker CLI"
  - "Docker 常用命令"
tags:
  - docker
  - cli
  - cheatsheet
created: "2026-10-27"
updated: "2026-10-27"
type: reference
status: active
sources:
  - "https://docs.docker.com/reference/cli/docker/"
  - "https://docs.docker.com/reference/cli/docker/compose/"
  - "https://docs.docker.com/reference/cli/docker/container/"
  - "https://docs.docker.com/reference/cli/docker/image/"
  - "https://docs.docker.com/reference/cli/docker/network/"
  - "https://docs.docker.com/reference/cli/docker/volume/"
---

# Docker 命令速查

> [!summary] 用法
> 先按对象选命令，再用 `docker <object> --help` 查当前安装版本的确切选项。

返回：[[Docker 知识地图]]

## 环境和帮助

```bash
docker version
docker info
docker context ls
docker compose version
docker --help
docker container --help
docker compose --help
```

判断基础环境：

- Client 和 Server 都可见，才说明 daemon 通常已连通。
- `docker info` 可查看 daemon、存储、cgroup、网络和资源概况。
- 命令行为以你当前安装版本为准，尤其是新引入的 flag。

## 运行容器

```bash
docker run --rm hello-world

docker run -d \
  --name web \
  -p 127.0.0.1:8080:80 \
  nginx:1.27-alpine

docker run --rm -it alpine sh
```

参数记忆：

| 参数 | 含义 |
| --- | --- |
| `-d` | 后台运行 |
| `-it` | 分配交互 TTY，适合 shell |
| `--rm` | 退出后自动删除容器 |
| `--name` | 指定容器名 |
| `-p 宿主:容器` | 发布端口 |
| `-v` / `--mount` | 挂载数据 |
| `--network` | 指定网络 |
| `--env` / `--env-file` | 注入环境变量 |
| `--user` | 指定用户 |

## 容器生命周期

```bash
docker ps
docker ps -a
docker stop web
docker start web
docker restart web
docker pause web
docker unpause web
docker rm web
docker rm -f web
```

区别：

- `stop`：发送停止信号，超时后强制终止。
- `kill`：默认直接发送 `SIGKILL`。
- `rm`：删除已停止容器。
- `rm -f`：强制停止并删除，未先检查容易丢失容器可写层数据。

## 查看和诊断

```bash
docker logs --tail 100 web
docker logs -f web
docker exec -it web sh
docker inspect web
docker stats --no-stream
docker top web
docker port web
docker diff web
```

格式化容器列表：

```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

检查退出状态和 OOM：

```bash
docker inspect --format \
  'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}' \
  web
```

查看挂载和网络：

```bash
docker inspect --format '{{json .Mounts}}' web
docker inspect --format '{{json .NetworkSettings.Networks}}' web
```

## 文件和输出

```bash
docker cp web:/app/log.txt ./log.txt
docker cp ./config.yml web:/app/config.yml
docker export web -o web-filesystem.tar
```

`docker export` 导出容器文件系统，不包含镜像历史和运行元数据；需要迁移镜像时通常用 `docker save` / `docker load`，或通过 registry 推送/拉取。

## 镜像

```bash
docker pull nginx:1.27-alpine
docker images
docker image ls
docker image inspect nginx:1.27-alpine
docker image history nginx:1.27-alpine
docker tag my-app:1.0.0 registry.example.com/team/my-app:1.0.0
docker push registry.example.com/team/my-app:1.0.0
docker rmi my-app:1.0.0
```

构建：

```bash
docker build --pull -t my-app:1.0.0 .
docker build --no-cache -t my-app:1.0.0 .
docker build --target build -t my-app:debug .
docker buildx build -t my-app:1.0.0 .
```

导出/导入镜像：

```bash
docker image save -o my-app.tar my-app:1.0.0
docker image load -i my-app.tar
```

## 网络

```bash
docker network ls
docker network create app-net
docker network inspect app-net
docker network connect app-net web
docker network disconnect app-net web
docker network rm app-net
```

容器互访诊断：

```bash
docker exec web getent hosts db
docker exec web curl -v http://db:5432
docker port web
```

注意 `curl http://db:5432` 只适合 HTTP 服务；数据库应使用对应客户端或端口探测，不要因 HTTP 协议不匹配误判网络不通。

## 数据卷

```bash
docker volume ls
docker volume create app-data
docker volume inspect app-data
docker volume rm app-data
docker volume prune
```

挂载：

```bash
docker run --rm \
  --mount type=volume,src=app-data,dst=/data \
  alpine sh -c 'echo hello > /data/test.txt'
```

> [!warning] 清理风险
> `docker volume prune` 会删除未被容器使用的卷，其中包括你认为以后还会用的数据。先 `docker volume ls` 并逐个确认。

## Compose

```bash
docker compose version
docker compose config
docker compose pull
docker compose build
docker compose up -d
docker compose up --build -d
docker compose ps
docker compose logs -f app
docker compose exec app sh
docker compose run --rm app sh
docker compose stop
docker compose start
docker compose restart app
docker compose down
```

指定文件和项目名：

```bash
docker compose -f compose.yaml -f compose.override.yaml up -d
docker compose -p demo-a up -d
docker compose -p demo-a ps
```

显示解析后的配置：

```bash
docker compose config
docker compose config --volumes
```

> [!danger] 高风险清理
> `docker compose down -v` 会删除项目命名卷。只有在已经确认数据可丢弃或已完成备份时使用。

## 资源和日志

```bash
docker stats
docker stats --no-stream
docker update --memory 512m --cpus 1 web
docker logs --since 15m web
```

日志驱动和轮转通常在 daemon 或服务级配置。长期依赖无限增长的容器日志会占满磁盘。

## 空间与清理

先观察，再清理：

```bash
docker system df
docker system df -v
docker images
docker ps -a
docker volume ls
docker network ls
```

常见清理命令：

```bash
docker image prune
docker container prune
docker network prune
docker builder prune
```

更激进的系统清理：

```bash
docker system prune
docker system prune -a
docker system prune -a --volumes
```

破坏范围依次扩大：

- `system prune`：删除停止的容器、未使用的网络、悬空镜像和构建缓存等。
- `-a`：同时删除未被容器使用的镜像，后续使用可能需重新拉取或构建。
- `--volumes`：还会删除未使用的卷，可能造成无法恢复的数据丢失。

清理前先做明确的对象核对和备份，不要把它写成自动定时任务。

## 常见“组合拳”

查看服务为何没起来：

```bash
docker compose ps
docker compose logs --tail 200
docker inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}' <container>
```

确认容器网络：

```bash
docker ps --format 'table {{.Names}}\t{{.Networks}}\t{{.Ports}}'
docker network inspect <network>
```

确认服务是否真的健康：

```bash
docker inspect --format '{{json .State.Health}}' <container>
docker inspect --format '{{json .Config.Healthcheck}}' <image>
```

## 相关笔记

- 运行模型：[[镜像与容器]]
- 构建命令：[[Dockerfile 与镜像构建]]
- Compose 工作流：[[Docker Compose]]
- 网络诊断：[[Docker 网络]]
- 存储命令：[[Docker 存储与数据卷]]
- 完整排错顺序：[[Docker 故障排查]]
- 返回：[[Docker 知识地图]]

## 来源

- Docker Docs, “docker CLI”: <https://docs.docker.com/reference/cli/docker/>
- Docker Docs, “docker compose CLI”: <https://docs.docker.com/reference/cli/docker/compose/>
- Docker Docs, “docker container”: <https://docs.docker.com/reference/cli/docker/container/>
- Docker Docs, “docker image”: <https://docs.docker.com/reference/cli/docker/image/>
- Docker Docs, “docker network”: <https://docs.docker.com/reference/cli/docker/network/>
- Docker Docs, “docker volume”: <https://docs.docker.com/reference/cli/docker/volume/>

核对日期：2026-10-27。当前机器未检测到 `docker` 命令，本页命令未在本机执行。
