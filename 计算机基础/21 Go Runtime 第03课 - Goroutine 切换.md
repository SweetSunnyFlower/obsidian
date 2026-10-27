---
title: "21 Go Runtime 第03课 - Goroutine 切换"
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
original_order: 21
original_dialogue_turn: 29
original_message_id: "83e33d4b-6271-44f1-b675-aba2122b662f"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
  - "https://go.dev/doc/go1.26"
  - "https://go.dev/doc/go1.25"
  - "https://go.dev/doc/go1.21"
  - "https://go.dev/doc/go1.14"
---

> [!info] 原文映射
> 重排序号：第 21 / 26 篇  
> 原始对话轮次：第 29 / 34 组  
> 原始回答消息 ID：`83e33d4b-6271-44f1-b675-aba2122b662f`  
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

# Go Runtime 第三课：Goroutine 切换（Context Switch）—— 一个 Goroutine 是如何暂停和恢复的？

这是 **Go Runtime 最重要的一课之一**。

学完这一课，你就能理解：

```go
go func() {}

time.Sleep()

channel

select

runtime.Gosched()
```

为什么都能让 Goroutine **暂停**，又为什么之后还能**从原来的地方继续执行**。

今天，我们彻底揭开它的秘密。

---

# 第一章：先问一个问题

来看一段代码：

```go
func main() {
    fmt.Println("A")

    time.Sleep(time.Second)

    fmt.Println("B")
}
```

输出：

```
A

(等待1秒)

B
```

问题来了：

当执行到：

```go
time.Sleep(time.Second)
```

的时候，

CPU 去哪里了？

程序：

是不是一直：

```
什么都没干？
```

当然不是。

真正发生的是：

```
G1

暂停
```

CPU：

去执行：

```
G2

G3

G4
```

一秒以后：

```
G1

恢复
```

继续：

```
fmt.Println("B")
```

---

问题：

> **G1 是怎么恢复到原来的位置的？**

---

# 第二章：CPU 如何切换线程？

先看看操作系统。

线程：

运行时。

CPU：

里面保存着：

```
PC（Program Counter）
```

程序计数器。

记录：

```
下一条要执行的指令。
```

还有：

```
SP（Stack Pointer）
```

栈指针。

还有：

```
AX

BX

CX

DX
```

各种寄存器。

这些：

统称：

```
CPU Context
```

上下文。

---

线程切换时：

Linux：

做：

```
保存：

PC

SP

寄存器
```

然后：

恢复：

另一个线程：

```
PC

SP

寄存器
```

于是：

继续运行。

---

# 第三章：Goroutine 也一样

Go：

没有线程。

但是：

一样：

需要：

保存：

```
PC

SP

寄存器
```

所以：

Runtime：

定义：

一个结构。

源码：

叫：

```go
type gobuf struct {
    sp uintptr
    pc uintptr
    ...
}
```

记住：

```text
gobuf

=

Goroutine Context
```

保存：

```
程序执行到哪了。
```

---

# 第四章：G 里面有什么？

源码：

真正的：

G：

远比我们想象的大。

简化：

```go
type g struct {

    stack

    gobuf

    status

    m

}
```

重点：

```
stack
```

自己的栈。

---

还有：

```
gobuf
```

自己的上下文。

---

所以：

每个：

G：

都有：

```
自己的：

PC

SP

Stack
```

因此：

恢复：

非常容易。

---

# 第五章：为什么 Goroutine 栈可以增长？

线程：

默认：

```
8MB
```

因为：

操作系统：

没法：

运行时：

移动线程栈。

---

Go：

不同。

例如：

开始：

```
2KB
```

---

如果：

函数：

越来越深。

Runtime：

发现：

```
快满了。
```

---

发生：

```
Stack Growth
```

步骤：

1.

申请：

```
4KB
```

新栈。

2.

复制：

旧栈。

3.

修改：

所有指针。

4.

释放：

旧栈。

---

于是：

变：

```
4KB
```

以后：

```
8KB

16KB

32KB
```

一直：

增长。

---

所以：

Go：

不用：

一开始：

申请：

```
8MB
```

---

# 第六章：什么时候发生 Goroutine 切换？

最常见：

第一种：

## 主动让出 CPU

例如：

```go
runtime.Gosched()
```

意思：

```
我先暂停。

别人先跑。
```

Runtime：

立即：

```
schedule()
```

调度。

---

第二种：

## channel 阻塞

例如：

```go
<-ch
```

没有数据。

Runtime：

发现：

```
不能继续。
```

于是：

```
挂起：

G
```

等待：

别人：

发送数据。

---

第三种：

## time.Sleep

例如：

```go
time.Sleep(time.Second)
```

Runtime：

把：

G：

放：

```
Timer Heap
```

定时器堆。

一秒后：

重新：

加入：

Run Queue。

---

第四种：

## 系统调用

例如：

```go
os.ReadFile()
```

或者：

```go
conn.Read()
```

进入：

```
syscall
```

M：

阻塞。

Runtime：

立即：

```
解绑：

P
```

让：

其他：

M：

继续执行。

---

第五种：

## GC

垃圾回收：

需要：

暂停：

某些：

G。

这个：

以后：

专门讲。

---

# 第七章：Go 1.14 最大更新

以前：

Go：

采用：

```
协作式调度
```

什么意思？

例如：

```go
for {

}
```

死循环。

没有：

```
函数调用
```

没有：

```
channel
```

没有：

```
sleep
```

Runtime：

根本：

抢不到：

CPU。

整个：

程序：

可能：

饿死。

---

Go1.14：

增加：

```
Async Preemption

异步抢占
```

Runtime：

可以：

直接：

打断：

正在运行：

G。

即使：

```go
for{

}
```

也能：

抢占。

---

这是：

Go：

历史上：

最重要：

升级之一。

---

# 第八章：调度真正发生在哪？

源码：

最重要：

函数：

```
schedule()
```

几乎：

所有：

切换。

最后：

都会：

来到：

这里。

伪代码：

```go
for {

    g := findRunnable()

    execute(g)

}
```

是不是：

熟悉？

上一课：

讲过。

---

# execute()

真正：

发生：

```
恢复：

gobuf
```

例如：

恢复：

```
PC

SP
```

恢复：

栈。

然后：

CPU：

继续：

执行。

---

所以：

当：

```go
time.Sleep()
```

结束。

恢复：

的：

不是：

函数开头。

而是：

```
Sleep()

下一行。
```

这就是：

上下文：

恢复。

---

# 第九章：为什么 Goroutine 切换比线程快？

线程：

切换：

```
进入内核

保存上下文

恢复上下文

切回用户态
```

涉及：

```
Kernel
```

---

Goroutine：

```
Runtime

自己保存：

gobuf
```

即可。

不需要：

系统调用。

因此：

通常：

快很多。

---

# 第十章：g0 是什么？

源码：

经常：

看到：

```
g0
```

很多人：

第一次：

完全：

懵。

其实：

每个：

M：

都有：

一个：

特殊：

G。

名字：

```
g0
```

作用：

```
调度器：

自己的栈。
```

为什么？

因为：

普通：

G：

自己的栈：

很小。

如果：

调度器：

也用：

普通：

G：

栈。

容易：

栈溢出。

所以：

Runtime：

单独：

给：

调度器：

一个：

```
g0
```

---

关系：

```
M

↓

g0

↓

schedule()

↓

普通G
```

---

# 第十一章：为什么不能在普通 G 栈上调度？

想象一下：

```text
G1
└── 调用 runtime.schedule()
        └── 又调度 G2
                └── G2 再触发调度
```

如果调度器一直使用普通 G 的栈：

```
G1 的栈
↓

调度

↓

再调度

↓

再调度
```

栈会越来越复杂。

于是：

Go：

规定：

```
所有：

调度器：

GC：

系统调用：

都切到：

g0。
```

这样：

普通：

G：

只负责：

业务代码。

Runtime：

自己：

使用：

g0。

---

# 一个完整流程

例如：

```go
go worker()

fmt.Println("hello")
```

实际：

发生：

```
创建：

G(worker)

↓

放入：

Run Queue

↓

schedule()

↓

M绑定P

↓

取出：

worker

↓

恢复：

gobuf

↓

执行：

worker()
```

如果：

worker：

执行：

```go
time.Sleep()
```

则：

```
保存：

gobuf

↓

加入：

Timer

↓

schedule()

↓

执行：

其它G

↓

Timer到期

↓

重新放回Run Queue

↓

再次恢复：

gobuf

↓

继续执行
```

这就是一个 Goroutine 生命周期中最典型的一次切换。

---

# 面试高频

### 什么是 Goroutine Context？

```
gobuf
```

保存：

```
PC

SP

寄存器
```

---

### Goroutine 为什么切换快？

```
Runtime

用户态切换

无需频繁进入内核
```

---

### Goroutine 什么时候会切换？

```
Gosched

channel阻塞

Sleep

syscall

GC

异步抢占
```

---

### Go 为什么能动态扩栈？

因为：

```
Goroutine 栈

由 Runtime 管理

可以复制到更大的栈空间
```

---

### g0 是什么？

```
调度器专用 Goroutine

拥有独立栈

负责 Runtime 自己的工作
```

---

# 当前知识树

```text
Go Runtime
│
├── G
├── M
├── P
├── Work Stealing
├── Local Queue
├── Global Queue
├── runnext
├── gobuf（上下文）
├── Stack Growth（动态扩栈）
├── schedule()
├── g0
└── Async Preemption
```

---

# 🎓 课后实验

写下面这段代码：

```go
package main

import (
	"fmt"
	"runtime"
	"time"
)

func main() {
	go func() {
		for i := 0; i < 5; i++ {
			fmt.Println("A", i)
			runtime.Gosched()
		}
	}()

	go func() {
		for i := 0; i < 5; i++ {
			fmt.Println("B", i)
			runtime.Gosched()
		}
	}()

	time.Sleep(time.Second)
}
```

尝试：

1. 保留 `runtime.Gosched()`，观察输出。
2. 去掉 `runtime.Gosched()`，观察输出是否变化。
3. 把循环改成一个巨大的计算循环，再观察 Go 1.14+ 的异步抢占是否仍然能让两个 Goroutine 都有机会运行。

---

# 下一课（Go Runtime 最神秘的模块）

下一节我们讲 **Netpoll（网络轮询器）**。

这是 Go 能做到：

- 一个线程处理几十万 TCP 连接
- `net/http` 为什么几乎不用你自己管理 epoll
- Goroutine 阻塞在 `conn.Read()` 时，为什么不会阻塞整个线程

背后的真正秘密。

学完这一课，你就会明白 **Go Runtime 是如何把 epoll、GMP 调度器和网络编程无缝结合起来的**。
