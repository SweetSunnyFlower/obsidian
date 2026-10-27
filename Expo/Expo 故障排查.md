---
title: Expo 故障排查
aliases:
  - Expo 常见错误
  - Expo Troubleshooting
tags:
  - expo
  - troubleshooting
  - android
created: 2026-10-27
updated: 2026-10-27
---

# Expo 故障排查

关联：[[Expo 环境搭建]] · [[Expo 知识地图]]

## ANDROID_HOME 指向错误

症状：

```text
SDK location not found
```

检查：

```bash
echo $ANDROID_HOME
ls $ANDROID_HOME/platform-tools
```

本机正确值：

```bash
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
```

## 缺少 Platform / Build Tools

症状：

```text
Failed to find target with hash string 'android-37'
```

处理：

```bash
sdkmanager "platforms;android-37.0" "build-tools;37.0.0"
```

Expo SDK 版本不同，实际需要的 API 也可能不同，以构建日志为准。

## emulator: command not found

```bash
export PATH="$ANDROID_HOME/emulator:$PATH"
emulator -list-avds
```

## Gradle 下载慢

先确认不是卡在 NDK/CMake 安装。首次构建可能下载数 GB 内容。

可配置 [[Gradle 国内镜像配置（Expo Android）]]。

## Expo Go 无法打开项目

可能原因：

- 手机和电脑不在同一网络；
- Expo Go 版本与 SDK 不兼容；
- 项目使用了 Expo Go 不包含的原生模块。

尝试：

```bash
npx expo start --tunnel
```

需要原生模块时改用本地开发构建或 EAS Build。

## Metro 缓存异常

```bash
npx expo start --clear
```

仍失败时删除 `node_modules` 后重装。

## 真机/模拟器连不上

```bash
adb devices -l
adb kill-server
adb start-server
```

无线调试需要手机和电脑在同一网络，并保持配对状态。

## Node 版本问题

```bash
node -v
npm -v
```

推荐 Node 22 LTS，详见 [[Node.js 与 Expo 版本管理]]。

## 相关笔记

- [[Expo 环境搭建]]
- [[Android SDK 组件说明]]
- [[Expo 常用命令]]
