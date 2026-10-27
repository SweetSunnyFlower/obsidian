---
title: "18 操作系统第09课 - CPU Cache"
aliases:
  - "原文逐字笔记"
tags:
  - computer-science
  - verbatim
  - operating-system
created: "2026-10-27"
updated: "2026-10-27"
type: source-note
status: active
original_order: 18
original_dialogue_turn: 26
original_message_id: "c9c854fa-3505-43a2-96ae-c96b8cf7a059"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
---

> [!info] 原文映射
> 重排序号：第 18 / 26 篇  
> 原始对话轮次：第 26 / 34 组  
> 原始回答消息 ID：`c9c854fa-3505-43a2-96ae-c96b8cf7a059`  
> 来源：[原始对话](https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a)  
> 内容策略：以下助手正文逐字保留，未做总结、改写、删节或章节重排。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一节
> ~~~

返回：[[计算机基础 知识地图]]

---

# 操作系统第九课：CPU Cache（缓存）—— 为什么 CPU 比内存快 100 倍？

> **这是整个计算机体系结构中最容易被忽略，但又最重要的一课。**

很多 Go 程序员学了几年：

会写 Goroutine

会写 Mutex

会写 atomic

但是不知道：

```text
为什么 atomic 快？

为什么 false sharing 会让程序变慢几十倍？

为什么 Go Runtime 到处都有 cacheLinePad？
```

今天，我们把 CPU Cache 一次讲透。

---

# 第一章：CPU 到底有多快？

我们先来看一组数字。

假设：

CPU：

```text
4GHz
```

什么意思？

表示：

```text
一秒执行40亿次时钟周期
```

也就是：

```text
一个周期

≈0.25ns
```

---

而内存（DDR5）呢？

访问一次：

```text
50ns~100ns
```

左右。

什么意思？

CPU：

```text
0.25ns
```

内存：

```text
80ns
```

差多少？

```text
320倍
```

---

也就是说：

CPU：

```text
干了320件事情
```

内存：

```text
数据还没送过来。
```

CPU：

```text
？？？
```

这就是现代计算机最大的瓶颈。

不是 CPU 太慢。

而是：

```text
内存太慢。
```

---

# 第二章：CPU Cache 为什么出现？

CPU 工程师说：

> 内存太远了。

怎么办？

于是：

CPU 里面加了一层：

```text
CPU
↓

Cache

↓

Memory
```

以后：

CPU：

先问：

```text
Cache：

有吗？
```

如果有：

直接拿。

不用访问内存。

---

# 第三章：三级缓存

现代 CPU：

通常：

```text
CPU

↓

L1 Cache

↓

L2 Cache

↓

L3 Cache

↓

Memory
```

---

速度：

大概：

|位置|延迟|
|------|-------|
|寄存器|<1ns|
|L1|约1ns|
|L2|约3ns|
|L3|约10ns|
|Memory|50~100ns|

看出来了吗？

CPU：

真正喜欢访问的是：

```text
L1
```

几乎和寄存器一样快。

---

# 第四章：为什么 Cache 能命中？

CPU：

不是按：

```text
1字节
```

读取。

而是：

```text
64字节
```

一起拿。

这叫：

```text
Cache Line
```

---

例如：

内存：

```text
地址：

0

1

2

3

...

63

64

65
```

CPU：

访问：

```text
地址10
```

实际上：

整个：

```text
0~63
```

一起复制到 Cache。

---

为什么？

因为：

程序通常：

```text
连续访问。
```

例如：

```go
arr := []int{
    1,2,3,4,5,6,
}
```

CPU：

第一次：

访问：

```go
arr[0]
```

实际上：

```text
整个数组前几十个元素
```

已经进 Cache。

后面：

```go
arr[1]

arr[2]

arr[3]
```

几乎不要成本。

---

# 第五章：局部性原理

为什么 Cache 如此有效？

因为程序有：

## 时间局部性

例如：

```go
for i:=0;i<100;i++{
    count++
}
```

一直访问：

```text
count
```

CPU：

当然缓存。

---

## 空间局部性

例如：

```go
for i:=0;i<len(arr);i++{
```

一直：

```text
连续访问数组。
```

CPU：

一次拿一大片。

---

所以：

数组：

比：

```go
map
```

更容易利用 Cache。

这也是数组遍历通常更快的重要原因。

---

# 第六章：Cache Miss

假设：

CPU：

找：

```text
L1
```

没有。

继续：

```text
L2
```

没有。

继续：

```text
L3
```

没有。

最后：

```text
Memory
```

取。

这叫：

```text
Cache Miss
```

缓存未命中。

代价：

几十甚至上百纳秒。

---

# 第七章：多核 CPU 出现问题

现在：

CPU：

已经：

```text
16核
```

了。

例如：

Core1：

```text
count=1
```

缓存：

在：

```text
L1
```

---

Core2：

也有：

```text
count=1
```

怎么办？

如果：

Core1：

修改：

```text
count=2
```

Core2：

不知道。

系统：

乱了。

---

# 第八章：MESI 协议

现代 CPU：

使用：

```text
MESI
```

保证：

多个 CPU Cache：

一致。

四种状态：

```text
Modified

Exclusive

Shared

Invalid
```

不用死记。

只记一句：

> 一个核心修改数据，其他核心的缓存会失效。

例如：

Core1：

```text
count=100
```

修改。

CPU：

通知：

```text
Core2

Core3

Core4
```

：

```text
别用了。

失效。
```

下次：

必须重新读取。

---

# 第九章：False Sharing（伪共享）

这是 Go 面试最喜欢问的。

假设：

Cache Line：

```text
64Byte
```

里面：

```go
type Data struct{
    A int64
    B int64
}
```

实际上：

```text
|--------64Byte--------|

A

B
```

都在：

同一条 Cache Line。

---

线程A：

一直：

修改：

```text
A
```

线程B：

一直：

修改：

```text
B
```

注意：

A 和 B：

根本没关系。

但是：

因为：

```text
同一条 Cache Line
```

CPU：

不停：

```text
失效

同步

失效

同步
```

性能：

暴跌。

这就是：

```text
False Sharing
```

---

# 第十章：Go Runtime 为什么 Padding？

Go：

源码：

经常出现：

```go
type P struct{
    ...

    pad [64]byte
}
```

很多人：

第一次：

看到：

```text
这不是浪费内存？
```

不是。

目的：

就是：

```text
不同变量

不要放一条 Cache Line。
```

避免：

```text
False Sharing
```

---

# 第十一章：atomic 为什么快？

很多人：

以为：

```text
atomic

不用锁
```

所以快。

其实：

不是全部原因。

真正原因：

CPU：

直接提供：

```text
Lock CMPXCHG

XADD
```

等：

硬件指令。

CPU：

自己：

保证：

原子。

不用：

```text
进入内核
```

所以：

速度：

非常快。

但是：

注意！

多个 CPU 核不断对同一个变量执行 `atomic.Add()` 时，也会因为缓存一致性协议导致缓存行来回失效，所以**高并发下频繁修改同一个原子变量并不一定快**。

---

# 第十二章：为什么高性能程序喜欢分片（Sharding）

例如：

统计请求数。

很多人：

写：

```go
atomic.AddInt64(&count,1)
```

100 个线程：

都改：

```text
count
```

CPU：

不停：

同步 Cache。

---

更好的办法：

```text
CPU1：

count1

CPU2：

count2

CPU3：

count3
```

最后：

相加。

这样：

每个 CPU：

几乎：

不用同步。

很多高性能计数器、连接池、内存分配器都采用这种思路。

---

# 一个形象的比喻

假设：

办公室：

有：

四个人。

桌子：

只有：

一本文件。

每个人：

都要：

改。

于是：

文件：

不停：

```text
A桌

↓

B桌

↓

C桌

↓

D桌
```

传来传去。

效率：

极低。

这就是：

```text
False Sharing
```

如果：

每人：

一本。

最后：

汇总。

效率：

高很多。

---

# 面试高频

### 什么是 Cache Line？

```text
CPU缓存的最小单位

通常64Byte
```

---

### 为什么数组比 map 快？

除了算法复杂度外，还因为：

```text
数组：

连续存储

Cache 命中率高
```

---

### 什么是 False Sharing？

```text
不同变量

共享同一 Cache Line

导致频繁失效。
```

---

### 为什么 Go Runtime 要 Padding？

```text
避免

False Sharing
```

---

### atomic 为什么快？

```text
CPU

硬件原子指令

无需内核参与
```

但大量竞争同一变量时，缓存一致性仍然可能成为瓶颈。

---

# 当前知识树

```text
操作系统
│
├── CPU
├── Memory
├── Virtual Memory
├── Page
├── TLB
├── Process
├── Thread
├── User Mode
├── Kernel Mode
├── System Call
├── IO Model
├── epoll
├── Lock
│
└── CPU Cache
    ├── L1
    ├── L2
    ├── L3
    ├── Cache Line
    ├── Locality
    ├── Cache Miss
    ├── MESI
    ├── False Sharing
    └── Padding
```

---

# 🎓 今天的课后实验（建议你亲自做）

写两个 Go 程序进行基准测试：

**实验一：单个原子计数器**

```go
var count int64

// 多个 goroutine 一起 atomic.AddInt64(&count, 1)
```

**实验二：分片计数器**

```go
var counters [runtime.NumCPU()]int64

// 每个 goroutine 固定更新一个 counters[i]
```

最后把所有 `counters` 相加。

你会发现，在高并发下，第二种通常会明显更快，因为它减少了缓存行争用。

---

# 下一课（正式进入 Go Runtime）

从下一节开始，我们离开传统操作系统，进入 **Go Runtime**。

第一课就是整个 Runtime 的核心：

> **G、M、P 调度模型**

我们会详细讲清楚：

- 为什么 Go 不直接使用操作系统线程？
- G、M、P 分别是什么？
- 为什么需要 P，而不是只有 G 和 M？
- 一个 `go func(){}` 从创建到执行，中间到底经历了什么？

学完这一课，你对 Go 的理解会进入一个新的层次。
