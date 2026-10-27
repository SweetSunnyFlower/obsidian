---
title: Expo Go、开发构建与 EAS Build
aliases:
  - Expo 运行方式
  - Expo Go vs Dev Build vs EAS
tags:
  - expo
  - build
  - workflow
created: 2026-10-27
updated: 2026-10-27
---

# Expo Go、开发构建与 EAS Build

关联：[[Expo 知识地图]] · [[Expo 环境搭建]]

## 对比

| 维度 | Expo Go | 本地开发构建 | EAS Build |
|---|---|---|---|
| 本质 | 官方通用容器 | 自己的原生 App | 云端构建 |
| 命令 | `npx expo start` | `npx expo run:android` | `eas build -p android` |
| 需要 Android SDK | 否 | 是 | 否 |
| 需要 Android Studio | 否 | 否 | 否 |
| 自定义原生模块 | 不支持 | 支持 | 支持 |
| 首次速度 | 最快 | 较慢 | 取决于云端排队 |
| 适用 | 纯 JS/TS 预览 | 原生调试 | APK/AAB、CI |

## Expo Go

```bash
npx expo start
```

手机安装 Expo Go，与电脑处于同一网络，扫描二维码。

限制：

- 只能运行 Expo Go 内置的模块；
- 项目 SDK 版本要与 Expo Go 大致匹配；
- 不适合验证自定义原生模块。

## 本地开发构建

```bash
npx expo run:android
```

首次会 prebuild、编译原生代码并安装到设备。需要：

- Android SDK；
- JDK；
- 模拟器或真机；
- Gradle 依赖可下载。

适合需要原生模块、调试原生代码或生成自己的 APK。

## EAS Build

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

特点：

- 云端构建，不依赖本地 Android SDK；
- 需要 Expo 账号；
- 适合团队协作、CI 和正式发布；
- 免费额度/排队时间取决于账号计划。

## 选择建议

- 先快速验证 UI：Expo Go；
- 需要使用原生模块：本地开发构建；
- 不想维护本机构建链：EAS Build；
- 需要完全离线构建：本地开发构建。

继续阅读：[[Expo 环境搭建]] · [[Expo 故障排查]]
