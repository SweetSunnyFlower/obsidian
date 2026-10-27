---
title: "20 Go Runtime 第02课 - Work Stealing"
aliases:
  - "原文逐字笔记"
tags:
  - computer-science
  - verbatim
  - go-runtime
created: "2026-10-27"
updated: "2026-10-27"
type: source-note
status: active
original_order: 20
original_dialogue_turn: 28
original_message_id: "05b37f9f-b5c9-4762-9d1f-db79b7f341c9"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
  - "https://go.dev/doc/go1.26"
  - "https://go.dev/doc/go1.25"
  - "https://go.dev/doc/go1.21"
  - "https://go.dev/doc/go1.14"
---

> [!info] 原文映射
> 重排序号：第 20 / 26 篇  
> 原始对话轮次：第 28 / 34 组  
> 原始回答消息 ID：`05b37f9f-b5c9-4762-9d1f-db79b7f341c9`  
> 来源：[原始对话](https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a)  
> 内容策略：以下助手正文逐字保留，未做总结、改写、删节或章节重排。
>
> **原始提问（逐字）**
>
> ~~~text
> 下一课
> ~~~

返回：[[计算机基础 知识地图]]

---

# Go Runtime 第二课：Work Stealing（工作窃取）—— Go 调度器真正的核心

上一节我们学了：

```text
G = Goroutine

M = OS Thread

P = Processor
```

关系：

```text
G
↓
P
↓
M
↓
CPU
```

但是还有一个关键问题没有解决：

---

假设：

```text
P1
```

有：

```text
10000个G
```

---

而：

```text
P2
```

只有：

```text
1个G
```

---

那么：

```text
P2
```

很快就干完活。

然后：

```text
闲着
```

---

而：

```text
P1
```

累成狗。

---

怎么办？

这就是：

```text
Work Stealing
工作窃取
```

出现的原因。

---

# 第一章：最早的调度器

Go 早期曾经考虑过：

```text
Global Queue
```

全局队列。

---

例如：

```text
G1
G2
G3
...
G100000
```

全部放进去。

---

然后：

```text
P1
P2
P3
P4
```

共同取任务。

---

看起来很好。

实际上很差。

---

# 为什么差

假设：

4个P。

同时：

```text
取任务
```

---

那么：

必须：

```text
加锁
```

---

例如：

```go
lock(queue)

pop()

unlock(queue)
```

---

如果：

```text
100万次调度
```

就会：

```text
100万次锁竞争
```

---

CPU开始：

```text
抢锁
```

而不是：

```text
干活
```

---

# Go的解决方案

每个P：

拥有自己的：

```text
Local Run Queue
```

本地运行队列。

---

例如：

```text
P1

[G1 G2 G3]
```

---

```text
P2

[G4 G5 G6]
```

---

```text
P3

[G7 G8 G9]
```

---

这样：

P1取任务：

```text
不用锁
```

---

P2取任务：

```text
不用锁
```

---

性能暴涨。

---

# Local Queue 多大？

Go Runtime源码：

```go
const runqsize = 256
```

---

也就是说：

每个P：

最多缓存：

```text
256个G
```

---

超过怎么办？

后面讲。

---

# 调度循环

每个M：

实际上在执行：

一个无限循环。

伪代码：

```go
for {

    g := getRunnable()

    execute(g)
}
```

---

不停：

```text
取G

执行G

取G

执行G
```

---

直到程序退出。

---

# getRunnable() 干什么

重点来了。

它会：

按顺序找任务。

---

第一优先级：

```text
P本地队列
```

---

例如：

```text
P1

[G1 G2 G3]
```

---

直接取：

```text
G1
```

执行。

---

因为：

```text
最快
```

---

# 第二优先级

如果：

```text
Local Queue
```

空了。

---

会检查：

```text
Global Queue
```

---

因为：

有些任务：

可能在：

```text
Global Queue
```

里面。

---

# Global Queue什么时候出现

例如：

```go
for i:=0;i<100000;i++{
    go task()
}
```

---

瞬间：

创建：

```text
100000个G
```

---

P的本地队列：

```text
256
```

已经满了。

---

剩余：

```text
99744个
```

怎么办？

---

放：

```text
Global Queue
```

---

所以：

Global Queue：

是：

```text
溢出区
```

---

# 第三优先级

如果：

```text
Local Queue
```

空。

---

```text
Global Queue
```

也空。

---

怎么办？

---

开始：

```text
偷
```

---

# Work Stealing

例如：

```text
P1

[G1 G2 G3 G4 G5 G6]
```

---

```text
P2

[]
```

空了。

---

此时：

P2：

随机找一个P。

例如：

```text
P1
```

---

偷：

```text
一半
```

任务。

---

变：

```text
P1

[G1 G2 G3]
```

---

```text
P2

[G4 G5 G6]
```

---

继续执行。

---

# 为什么偷一半

很多人问。

为什么不是：

```text
偷一个
```

？

---

因为：

偷任务：

也有成本。

---

如果：

只偷一个。

马上又空。

又偷。

又空。

又偷。

---

CPU：

全在：

```text
偷
```

---

所以：

直接：

```text
偷一半
```

效率最高。

---

# 为什么随机偷

假设：

```text
100个P
```

---

大家：

都偷：

```text
P1
```

---

瞬间：

```text
锁竞争
```

爆炸。

---

所以：

随机。

---

例如：

```text
P37

P52

P4
```

随机选。

---

效果最好。

---

# 一个经典面试题

## 为什么Go比线程池更灵活

线程池：

通常：

```text
一个全局队列
```

---

Go：

```text
Local Queue

+

Work Stealing
```

---

锁竞争：

少很多。

---

# Goroutine 创建后立即执行吗

很多人以为：

```go
go hello()
```

---

马上：

执行。

---

其实：

不是。

---

发生：

```text
创建G
↓
放入Run Queue
↓
等待调度
```

---

什么时候执行：

不确定。

---

所以：

下面代码：

```go
func main() {
    go fmt.Println("hello")
}
```

---

可能：

什么都不输出。

---

因为：

```text
main退出
```

程序结束。

---

G还没来得及运行。

---

# 创建G时放哪

例如：

```go
go task()
```

---

当前：

运行在：

```text
P1
```

---

那么：

新G：

优先放：

```text
P1 Local Queue
```

---

原因：

Cache友好。

---

因为：

当前线程：

刚访问的数据。

大概率：

新G也会访问。

---

这叫：

```text
Locality
```

局部性。

---

# runnext机制

这里有个高级优化。

例如：

```go
go task()
```

创建了一个新G。

---

Runtime发现：

这个G：

很可能马上执行。

---

直接放：

```text
runnext
```

槽位。

---

结构：

```text
P

runnext
LocalQueue
```

---

调度时：

优先：

```text
runnext
```

---

这样：

减少延迟。

---

# 系统调用怎么办

假设：

```go
conn.Read()
```

---

发生：

```text
系统调用
```

---

线程：

阻塞。

---

此时：

如果：

```text
P
```

也跟着阻塞。

---

整个调度器完蛋。

---

Go怎么做？

---

发生：

```text
M阻塞
```

前。

---

Runtime：

把：

```text
P
```

摘下来。

---

交给：

另一个：

```text
M
```

继续执行。

---

变成：

```text
M1
↓
阻塞

P1
↓
移交

M2
↓
继续执行
```

---

这就是：

Go能够处理大量阻塞IO的关键。

---

# 一个真实例子

假设：

```go
100000个HTTP连接
```

---

其中：

```text
99999个
```

都在：

```text
Read()
```

等待数据。

---

Go不会：

```text
100000线程
```

等待。

---

而是：

```text
少量线程

+

Netpoll

+

调度器
```

管理。

---

这也是：

```text
GMP + epoll
```

组合威力。

---

# 调度器全景图

真正运行时：

```text
            Global Queue
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼

      +-----+   +-----+   +-----+
      | P1  |   | P2  |   | P3  |
      +-----+   +-----+   +-----+
         │         │         │
         ▼         ▼         ▼
      +-----+   +-----+   +-----+
      | M1  |   | M2  |   | M3  |
      +-----+   +-----+   +-----+
```

---

如果：

```text
P2
```

空。

---

发生：

```text
Steal(P1)
```

偷任务。

---

继续工作。

---

# 面试高频

## Local Queue大小

```go
256
```

---

## 为什么需要Local Queue

```text
减少锁竞争
```

---

## Global Queue作用

```text
溢出任务
```

---

## 什么是Work Stealing

```text
空闲P

从繁忙P

偷任务
```

---

## 为什么偷一半

```text
减少偷取次数
```

---

## goroutine创建后立即执行吗

```text
不一定
```

只是：

```text
进入调度队列
```

---

## 为什么Go适合高并发

```text
GMP

+

Work Stealing

+

Netpoll

+

用户态调度
```

---

# 当前知识树

```text
Go Runtime
│
├── G
├── M
├── P
├── GOMAXPROCS
├── Local Queue
├── Global Queue
├── Work Stealing
├── runnext
└── 调度循环
```

---

# 下一课（真正进入 Runtime 核心）

下一节讲：

# Goroutine 切换（Context Switch）

也就是：

```go
go func(){}

time.Sleep()

channel

select
```

背后：

Goroutine 是如何：

```text
暂停

恢复

切换
```

的。

你会看到：

```text
g0

mcall

schedule

gobuf
```

这些 Runtime 源码里最常见的名字到底是什么意思。

学完这一课，你再看 Runtime 调度源码，已经能读懂 70% 以上内容了。
