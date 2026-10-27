---
title: Node.js 与 Expo 版本管理
aliases:
  - Node 版本管理
  - Expo Node 版本
tags:
  - nodejs
  - expo
  - version
created: 2026-10-27
updated: 2026-10-27
---

# Node.js 与 Expo 版本管理

关联：[[Expo 环境搭建]] · [[Expo 知识地图]]

## 推荐版本

Expo/React Native 优先使用 **Node LTS**。本机验证版本：

```text
Node.js 22.23.4
npm 10.9.9
```

## 本机安装方式

```bash
brew install node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

新终端生效前可执行：

```bash
source ~/.zshrc
node -v
```

## 为什么不用最新非 LTS

- 原生依赖、Metro、EAS CLI 对最新版 Node 的兼容性可能滞后；
- LTS 版本更适合长期项目；
- React Native/Expo 的官方测试矩阵通常优先覆盖 LTS。

## 多项目版本管理

如果不同项目需要不同 Node 版本，可以使用 nvm、fnm 或 mise。当前机器没有正确可用的 nvm 脚本，直接使用 Homebrew `node@22` 更简单。

项目可添加 `.nvmrc`：

```text
22
```

## 检查命令

```bash
node -v
npm -v
npx expo-doctor
```

## 常见问题

- `node: command not found`：检查 PATH；
- 版本仍是旧版：重新打开终端或 `source ~/.zshrc`；
- `npm install` 原生模块失败：先确认 Node 版本为 LTS；
- Expo CLI 行为异常：删除 `node_modules` 后重新安装，不要盲目升级全局工具。

继续阅读：[[Expo 故障排查]] · [[Expo 环境搭建]]
