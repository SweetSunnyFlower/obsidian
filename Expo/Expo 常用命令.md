---
title: Expo 常用命令
aliases:
  - Expo CLI 命令
  - Expo 工作流
tags:
  - expo
  - cli
  - cheatsheet
created: 2026-10-27
updated: 2026-10-27
---

# Expo 常用命令

关联：[[Expo 环境搭建]] · [[Expo 知识地图]]

## 创建与安装

```bash
npx create-expo-app@latest my-app
cd my-app
npm install
```

TypeScript 模板：

```bash
npx create-expo-app@latest my-app --template blank-typescript
```

## 开发运行

```bash
# 启动 Metro，Expo Go 扫码
npx expo start

# 直接打开 Android
npx expo start --android

# 网络不通时使用隧道
npx expo start --tunnel
```

## 本地构建

```bash
npx expo prebuild --platform android --no-install
npx expo run:android
```

Debug APK：

```bash
cd android
./gradlew assembleDebug
```

输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 检查与修复

```bash
npx expo-doctor
npx expo install --check
npx expo start --clear
```

## Android 设备

```bash
adb devices -l
adb install -r path/to/app.apk
adb logcat
```

## 依赖管理

```bash
npx expo install expo-camera
npx expo install --fix
```

优先使用 `npx expo install`，它会选择与当前 Expo SDK 兼容的版本。

## 清理重建

```bash
rm -rf node_modules
npm install
npx expo start --clear
```

谨慎删除 `android/`，它包含原生配置和签名相关内容。

继续阅读：[[Expo 故障排查]] · [[Expo Go、开发构建与 EAS Build]]
