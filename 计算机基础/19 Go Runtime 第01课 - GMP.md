---
title: "19 Go Runtime 第01课 - GMP"
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
original_order: 19
original_dialogue_turn: 27
original_message_id: "56972469-5250-439d-ab9c-a9d08100926c"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
  - "https://go.dev/doc/go1.26"
  - "https://go.dev/doc/go1.25"
  - "https://go.dev/doc/go1.21"
  - "https://go.dev/doc/go1.14"
---

> [!info] 原文映射
> 重排序号：第 19 / 26 篇  
> 原始对话轮次：第 27 / 34 组  
> 原始回答消息 ID：`56972469-5250-439d-ab9c-a9d08100926c`  
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

# Go Runtime 第一课：G、M、P 调度模型 —— Go 为什么能轻松创建 100 万个 Goroutine？

从今天开始，我们正式进入 **Go Runtime**。

如果说前面的课程是在学：

```text
数据结构
操作系统
```

那么：

Go Runtime 就是：

> **Go 语言真正的灵魂。**

很多人会写：

```go
go func() {
    fmt.Println("Hello")
}()
```

但是不知道：

> **这个 goroutine 到底是谁创建的？**
>
> **它什么时候开始运行？**
>
> **为什么它不是一个线程？**
>
> **为什么能创建几百万个？**

今天，我们就把它讲透。

---

# 第一章：先问一个问题

为什么 Go 不直接用线程？

例如：

Java 早期：

```text
Thread

↓

操作系统线程
```

基本：

```text
1 Thread

↓

1 OS Thread
```

那么：

10000 个线程：

就是：

```text
10000 个系统线程
```

问题来了。

---

# 创建线程很贵

操作系统创建一个线程：

不是：

```text
malloc()
```

那么简单。

它需要：

```text
申请栈

初始化线程

加入调度器

分配 TID

注册到内核
```

甚至：

```text
系统调用
```

才能完成。

一次：

通常：

```text
几十微秒
~
几百微秒
```

---

而：

Go 创建：

```go
go func(){}
```

通常：

```text
几百纳秒
~
几微秒
```

快：

几十倍到几百倍。

---

# 第二章：线程还有一个致命问题

Linux：

默认：

线程栈：

```text
8MB
```

假设：

10000 个线程：

```text
10000 × 8MB

≈80GB
```

根本不可能。

---

Go：

一个 Goroutine：

初始栈：

```text
2KB
```

（现代 Go 默认如此，会按需增长。）

10000 个：

```text
20MB
```

差距：

巨大。

---

# 第三章：那 Goroutine 是什么？

一句话：

```text
Goroutine

=

用户态线程
```

注意：

它不是：

```text
Linux Thread
```

而是：

```text
Go Runtime

自己实现的线程。
```

所以：

Go：

自己负责：

```text
创建

调度

销毁
```

不用：

Linux。

---

# 第四章：那谁真正执行代码？

CPU：

不会认识：

```text
Goroutine
```

CPU：

只认识：

```text
Thread
```

所以：

最终：

还是：

```text
线程
```

执行。

于是：

Go：

设计了：

```text
G

↓

M

↓

CPU
```

这里：

M：

就是：

```text
Machine
```

实际上：

```text
OS Thread
```

---

# 第五章：G 是什么？

G：

就是：

```text
Goroutine
```

里面：

保存：

```text
函数入口

栈

状态

调度信息
```

例如：

```go
go task1()

go task2()

go task3()
```

Runtime：

会创建：

```text
G1

G2

G3
```

---

# 第六章：M 是什么？

M：

就是：

```text
Machine
```

其实：

就是：

```text
操作系统线程。
```

例如：

```text
M1

M2

M3
```

最终：

真正执行：

```text
G
```

---

如果：

只有：

```text
G

+

M
```

是不是就够了？

答案：

**不够。**

---

# 第七章：为什么需要 P？

这是 Go Runtime 最经典的设计。

很多人第一次看到：

```text
G

M

P
```

都会问：

> P 是什么？

一句话：

> **P = Processor（逻辑处理器）**

但是：

它不是：

CPU。

也不是：

线程。

它更像：

```text
运行许可证
```

---

# 为什么需要 P？

先看没有 P：

```text
G1

G2

G3

↓

M
```

多个线程：

抢：

G。

问题：

```text
需要加锁。
```

线程越多。

锁竞争：

越严重。

---

Go：

于是：

增加：

```text
P
```

变成：

```text
G

↓

P

↓

M
```

每个：

P：

拥有：

```text
自己的：

Local Queue
```

局部队列。

例如：

```text
P1：

G1

G2

G3
```

---

P2：

```text
G8

G9

G10
```

---

M：

只处理：

自己：

P。

几乎：

不用：

全局锁。

---

# 第八章：完整关系

经典图：

```text
       G1
       G2
       G3
        │
        ▼
     +-------+
     |   P1  |
     +-------+
         │
         ▼
     +-------+
     |   M1  |
     +-------+
         │
         ▼
        CPU
```

---

另一个：

```text
       G8
       G9
      G10
        │
        ▼
     +-------+
     |   P2  |
     +-------+
         │
         ▼
     +-------+
     |   M2  |
     +-------+
         │
         ▼
        CPU
```

---

所以：

真正执行关系：

```text
G

必须绑定

P

P

必须绑定

M

M

才能运行
```

记住一句话：

> **G 不能直接跑在 M 上，它必须先拿到一个 P。**

---

# 第九章：Goroutine 创建过程

例如：

```go
go hello()
```

发生：

第一步：

创建：

```text
G
```

第二步：

放进：

```text
P

Local Queue
```

第三步：

M：

不断：

从：

```text
Local Queue
```

取：

```text
G
```

执行。

结束。

---

# 第十章：为什么 P 的数量默认等于 CPU？

例如：

机器：

```text
8核
```

Runtime：

默认：

```go
runtime.GOMAXPROCS(8)
```

于是：

```text
P：

8个。
```

为什么？

因为：

真正：

同时：

运行：

最多：

```text
8个。
```

CPU：

只有：

8个核心。

再多：

没有意义。

---

# 第十一章：G 可以远远多于 P

例如：

```text
100000

Goroutine
```

但是：

```text
P：

8
```

Runtime：

不停：

```text
切换

G
```

所以：

100000：

G：

轮流：

执行。

这就是：

```text
协作式调度
```

后来：

Go 1.14 引入了**异步抢占**，现在即使 Goroutine 一直执行计算、不主动调用函数，也能被 Runtime 抢占，调度更加公平。

---

# 第十二章：一个比喻

假设：

餐厅：

有：

100 位顾客。

顾客：

就是：

```text
G
```

---

服务员：

就是：

```text
M
```

---

工作台：

就是：

```text
P
```

服务员：

必须：

站在：

工作台。

才能：

干活。

顾客：

排队：

等：

工作台。

不是：

等：

服务员。

这样：

管理：

效率：

最高。

---

# 第十三章：为什么 Goroutine 切换快？

线程切换：

需要：

```text
进入内核

保存寄存器

切换线程

恢复寄存器

返回用户态
```

涉及：

```text
系统调用
```

---

Goroutine：

切换：

Runtime：

自己完成。

只需要：

```text
保存：

G：

上下文
```

然后：

恢复：

另一个：

G。

不用：

进入：

内核。

所以：

速度：

极快。

不过要注意一点：

> **如果 Goroutine 因为系统调用（例如 `read()`、`write()`）而阻塞，Go Runtime 仍然需要和操作系统线程协作。**

这也是为什么后面会讲 **Netpoll**。

---

# 面试高频

## 什么是 G？

```text
Goroutine
```

---

## 什么是 M？

```text
OS Thread
```

---

## 什么是 P？

```text
Processor

调度器上下文

拥有本地队列
```

---

## 为什么需要 P？

```text
减少锁竞争

提高调度效率
```

---

## 为什么 Goroutine 比线程轻？

```text
初始栈小（约2KB）

创建成本低

用户态调度
```

---

## G 能直接运行吗？

```text
不能

必须：

G

↓

P

↓

M
```

---

# 当前知识树

```text
Go Runtime
│
├── G（Goroutine）
├── M（OS Thread）
├── P（Processor）
├── Local Queue
├── GOMAXPROCS
└── 用户态调度
```

---

# 🎓 今天的课后实验

建议你写下面这段代码：

```go
package main

import (
	"fmt"
	"runtime"
	"time"
)

func main() {
	fmt.Println("CPU:", runtime.NumCPU())
	fmt.Println("GOMAXPROCS:", runtime.GOMAXPROCS(0))

	for i := 0; i < 100000; i++ {
		go func(i int) {
			time.Sleep(time.Second)
			_ = i
		}(i)
	}

	time.Sleep(2 * time.Second)
	fmt.Println("Goroutines:", runtime.NumGoroutine())
}
```

观察：

- `runtime.NumCPU()` 返回什么？
- `GOMAXPROCS(0)` 默认是多少？
- 创建 10 万个 Goroutine 时，程序是否还能正常运行？
- 内存占用大概是多少？

这会让你直观感受到 **Goroutine 的轻量级**。

---

# 下一课（Go Runtime 最精彩的一课）

下一节我们讲：

# **Work Stealing（工作窃取）+ 调度循环**

也就是：

- P 的本地队列为什么比全局队列快？
- 一个 P 没活干了怎么办？
- 为什么 Go 要去“偷”别人的 Goroutine？
- 全局队列什么时候会被使用？
- `go func(){}` 创建出来的 G，为什么有时不会立刻执行？

这一课是真正理解 Go 调度器的核心，也是阅读 Go Runtime 源码时最重要的一部分。
