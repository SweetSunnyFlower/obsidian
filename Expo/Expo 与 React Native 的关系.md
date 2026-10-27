---
title: Expo 与 React Native 的关系
aliases:
  - Expo vs React Native
  - Expo 是什么
tags:
  - expo
  - react-native
  - concept
created: 2026-10-27
updated: 2026-10-27
---

# Expo 与 React Native 的关系

## 一句话

**React Native 是运行时和原生桥接框架，Expo 是建立在其上的开发平台、工具链和模块生态。**

关联：[[Expo 知识地图]] · [[Expo 环境搭建]]

## 分层理解

| 层 | 作用 |
|---|---|
| React Native | 用 React 构建原生 UI，负责 JS 与原生通信 |
| Expo SDK | 提供相机、文件、通知、定位等原生模块 |
| Expo CLI | 创建、启动、调试、预构建项目 |
| Metro | 打包 JavaScript/TypeScript |
| Gradle / Xcode | 把原生工程编译成 APK/AAB 或 iOS App |

## Managed 与 Prebuild

### Managed 工作流

- 主要写 JS/TS；
- 原生配置通过 `app.json` / `app.config.js` 描述；
- 可直接用 Expo Go 预览；
- 适合快速开发、跨平台业务应用。

### Prebuild 工作流

- 执行 `npx expo prebuild` 生成 `android/` 和 `ios/`；
- 之后可以修改原生代码或接入自定义模块；
- 本地构建需要 Android SDK / Xcode；
- 原生目录重新生成时可能覆盖手动修改。

## 常见误解

- **Expo 不是 React Native 的替代品**，而是上层平台。
- **Expo Go 不等于 Expo 全部能力**，它只是运行容器。
- **不使用 Expo Go 也可以使用 Expo**，可以 prebuild 后本地构建。
- **Expo 项目不一定要有 android/ios 目录**，执行 prebuild 后才出现。

## 继续阅读

- [[Expo Go、开发构建与 EAS Build]]
- [[Expo 环境搭建]]
- [[Android SDK 组件说明]]
