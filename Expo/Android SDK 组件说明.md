---
title: Android SDK 组件说明
aliases:
  - Android SDK 组成
  - Platform Tools Build Tools
tags:
  - android
  - sdk
  - toolchain
created: 2026-10-27
updated: 2026-10-27
---

# Android SDK 组件说明

关联：[[Expo 环境搭建]] · [[Expo 知识地图]]

## 目录

本机 SDK 根目录：

```text
/opt/homebrew/share/android-commandlinetools
```

## 核心组件

| 组件 | 作用 | 本机版本 |
|---|---|---|
| platform-tools | 提供 adb、fastboot | 37.0.1 |
| platforms | 编译时使用的 Android API | 35 / 36 / 37 |
| build-tools | aapt2、d8、zipalign 等构建工具 | 35 / 36 / 37 |
| emulator | Android 模拟器 | 37.2.12 |
| system-images | 模拟器系统镜像 | Android 15 arm64 |
| ndk | 编译 C/C++ 原生代码 | 27.1.12297006 |
| cmake | 构建原生库 | 3.22.1 |

## 常见目录

```text
$ANDROID_HOME/platform-tools/adb
$ANDROID_HOME/emulator/emulator
$ANDROID_HOME/platforms/android-37.0
$ANDROID_HOME/build-tools/37.0.0
$ANDROID_HOME/ndk/27.1.12297006
```

## sdkmanager 常用命令

```bash
sdkmanager --list_installed
sdkmanager "platforms;android-36"
sdkmanager "build-tools;36.0.0"
sdkmanager --licenses
```

## Expo 构建时会自动安装什么

Expo SDK 58 的 Android 构建可能自动安装：

- `platforms;android-37.0`
- `build-tools;37.0.0`
- `ndk;27.1.12297006`
- `cmake;3.22.1`

因此第一次构建会明显更慢。

## 环境变量

```bash
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

相关：[[Node.js 与 Expo 版本管理]] · [[Expo 故障排查]]
