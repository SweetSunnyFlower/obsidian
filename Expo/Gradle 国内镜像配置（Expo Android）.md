---
title: Gradle 国内镜像配置（Expo Android）
aliases:
  - Expo Gradle 镜像
  - 阿里云 Maven 镜像
tags:
  - gradle
  - android
  - expo
  - mirror
created: 2026-10-27
updated: 2026-10-27
---

# Gradle 国内镜像配置（Expo Android）

关联：[[Expo 环境搭建]] · [[Expo 知识地图]]

## 为什么需要

Expo prebuild 生成的 Android 工程默认从 Google Maven、Maven Central 和 JitPack 下载依赖。国内网络下可能出现：

- Gradle 下载慢；
- AAR/POM 超时；
- Kotlin、Android Gradle Plugin 依赖卡住；
- 首次构建时间很长。

## 配置文件

路径：

```text
my-app/android/build.gradle
```

在 `buildscript.repositories` 和 `allprojects.repositories` 中加入：

```groovy
maven { url 'https://maven.aliyun.com/repository/google' }
maven { url 'https://maven.aliyun.com/repository/central' }
maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
maven { url 'https://maven.aliyun.com/repository/public' }
```

保留官方仓库作为回退：

```groovy
google()
mavenCentral()
```

## 重要注意事项

1. **`npx expo prebuild` 会重新生成 `android/`**，手改的镜像配置可能丢失。
2. 不要只删掉 `google()`/`mavenCentral()`，某些依赖在镜像上可能缺失。
3. 镜像只影响 Maven 依赖，不改变 Gradle Wrapper 发行包地址。
4. 修改后首次构建可能仍需重新解析依赖。

## 验证

```bash
cd android
./gradlew assembleDebug --console=plain
```

看到 `BUILD SUCCESSFUL` 即表示构建链正常。

## 与本机的关系

验证项目 `expo-check` 已配置阿里云优先仓库，并通过 Debug 构建。相关记录见 [[本次 Expo 环境搭建记录 2026-10-27]]。

继续阅读：[[Android SDK 组件说明]] · [[Expo 故障排查]]
