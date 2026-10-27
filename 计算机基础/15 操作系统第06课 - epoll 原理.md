---
title: "15 操作系统第06课 - epoll 原理"
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
original_order: 15
original_dialogue_turn: 23
original_message_id: "0ef4a4ed-6c4a-4030-b0d4-54e54ab41cec"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
---

> [!info] 原文映射
> 重排序号：第 15 / 26 篇  
> 原始对话轮次：第 23 / 34 组  
> 原始回答消息 ID：`0ef4a4ed-6c4a-4030-b0d4-54e54ab41cec`  
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

# 操作系统第六课：epoll 原理 —— Linux 为什么能扛百万连接

今天这一课，是整个操作系统模块最重要的课程之一。

学完以后：

你会真正理解：

```text
Nginx
Redis
Kafka
MySQL
Go Runtime
```

为什么都依赖：

```text
epoll
```

以及你之前问的那个问题：

> epoll 怎么知道哪些连接有数据，而不用遍历全部连接？

今天彻底讲透。

---

# 先回顾一下

## select

每次：

```text
fd1
fd2
fd3
...
fd100000
```

都要交给内核。

然后：

```text
内核遍历10万个fd
```

找到：

```text
fd8
fd100
fd999
```

有数据。

---

复杂度：

```text
O(n)
```

---

问题：

```text
10万个连接

只有10个活跃

仍然检查10万个
```

---

Linux 工程师发现：

问题不在连接数量。

问题在：

```text
每次重新遍历
```

---

# epoll 的核心思想

一句话：

> 不要主动问。

> 数据来了主动通知。

---

以前：

```text
程序：
有数据吗？

内核：
没有

程序：
有数据吗？

内核：
没有
```

---

现在：

```text
程序：
有数据告诉我

内核：
好的
```

---

这就是：

```text
Event Driven
事件驱动
```

---

# epoll 三个核心函数

Linux：

```c
epoll_create()
epoll_ctl()
epoll_wait()
```

---

必须记住。

---

# 第一步

## epoll_create()

创建：

```text
epoll实例
```

---

可以理解成：

```text
事件管理器
```

---

例如：

```c
int epfd = epoll_create(1);
```

---

得到：

```text
epfd
```

---

类似：

```go
manager := NewEventManager()
```

---

# 第二步

## epoll_ctl()

注册连接。

例如：

```c
epoll_ctl(
    epfd,
    EPOLL_CTL_ADD,
    fd,
    &event,
)
```

---

意思：

```text
这个fd归你管

有事通知我
```

---

例如：

```text
fd1
fd2
fd3
fd4
fd5
```

全部注册进去。

---

# 第三步

## epoll_wait()

重点来了。

---

调用：

```c
epoll_wait(...)
```

---

程序进入：

```text
睡眠
```

---

等待事件。

---

注意：

这里和 select 最大区别出现了。

---

# select 在干什么

每次：

```text
select
```

都要：

```text
遍历所有fd
```

---

例如：

```text
100000个连接
```

---

每次：

```text
检查100000次
```

---

# epoll 在干什么

根本不检查。

---

直接：

```text
睡觉
```

---

等内核通知。

---

# 那么问题来了

你之前问的：

> epoll 怎么知道哪个连接有数据？

核心来了。

---

# 网卡收到数据时发生什么

例如：

客户端发送：

```text
hello
```

---

到：

```text
fd888
```

---

网卡收到数据。

---

发生：

```text
网卡
 ↓
硬件中断
 ↓
CPU
 ↓
Linux内核
```

---

# 内核怎么处理

Linux维护：

```text
fd888
```

对应：

```text
Socket
```

结构。

---

收到数据：

```text
Socket接收缓冲区
```

变成：

```text
非空
```

---

例如：

原来：

```text
buffer
┌─────┐
│     │
└─────┘
```

---

收到：

```text
hello
```

---

变：

```text
buffer
┌─────┐
│hello│
└─────┘
```

---

此时：

```text
可读事件
```

产生。

---

# epoll 内部维护两个东西

这是核心中的核心。

---

## 红黑树

保存：

```text
所有监听fd
```

---

例如：

```text
fd1
fd2
fd3
...
fd100000
```

---

用于：

```text
快速增删查
```

---

复杂度：

```text
O(log n)
```

---

这就是：

```text
epoll_ctl()
```

操作的对象。

---

# Ready List

重点来了。

---

又维护一个：

```text
Ready List
```

就绪队列。

---

开始：

```text
Ready List

[]
```

---

# fd888收到数据

内核发现：

```text
fd888
可读
```

---

直接放进去：

```text
Ready List

[fd888]
```

---

又来了：

```text
fd123
```

---

变：

```text
Ready List

[fd888,fd123]
```

---

# epoll_wait干什么

注意。

---

根本不遍历：

```text
fd1
fd2
...
fd100000
```

---

而是直接返回：

```text
Ready List
```

---

例如：

```text
Ready List

[fd888,fd123]
```

---

直接告诉程序：

```text
这俩有数据
```

---

结束。

---

# 终于回答你的问题

问题：

> epoll 怎么知道哪些连接有数据？

答案：

```text
不是epoll主动检查

而是数据到来时

内核主动把fd放入Ready List
```

---

所以：

```text
epoll_wait()
```

只看：

```text
Ready List
```

---

不需要遍历全部连接。

---

# select VS epoll

假设：

```text
100000连接

10个活跃
```

---

select：

```text
每次检查100000
```

复杂度：

```text
O(n)
```

---

epoll：

```text
直接返回10个
```

复杂度：

```text
O(活跃连接数)
```

即：

```text
O(10)
```

---

差距巨大。

---

# 水平触发 LT

默认模式。

---

例如：

```text
buffer
┌─────┐
│hello│
└─────┘
```

---

程序只读：

```text
he
```

---

剩余：

```text
llo
```

---

下次：

```text
epoll_wait()
```

仍然通知。

---

因为：

```text
还有数据
```

---

这叫：

```text
Level Trigger
LT
```

---

# 边缘触发 ET

模式：

```text
EPOLLET
```

---

只通知一次。

---

例如：

```text
hello
```

到来。

---

通知：

```text
有数据
```

---

程序只读：

```text
he
```

---

剩余：

```text
llo
```

---

不再通知。

---

必须：

```text
一次读完
```

---

否则：

```text
数据丢在缓冲区
```

---

# 为什么 Redis 用 ET

因为：

```text
通知次数少
```

---

性能更高。

---

但代码复杂。

---

# Go Runtime 用什么

Go Netpoll：

Linux下：

```text
epoll
```

---

macOS：

```text
kqueue
```

---

Windows：

```text
IOCP
```

---

统一封装。

---

# Go处理连接过程

例如：

```go
ln, _ := net.Listen(...)
```

---

背后：

```text
socket()
bind()
listen()
```

系统调用。

---

连接到来：

```text
epoll
↓
Ready List
↓
Netpoll
↓
找到对应G
↓
唤醒Goroutine
```

---

所以：

```go
go handle(conn)
```

开10万个。

---

线程可能只有：

```text
几个
```

---

# Nginx为什么强

经典：

```text
Master

Worker1

Worker2

Worker3
```

---

每个Worker：

```text
单线程
```

---

依靠：

```text
epoll
```

管理：

```text
几万连接
```

---

这就是：

```text
C10K问题
```

解决方案。

---

# 面试题

## select和epoll区别

select：

```text
遍历全部fd
```

---

epoll：

```text
只返回活跃fd
```

---

## epoll为什么快

```text
Ready List

避免全量遍历
```

---

## epoll内部数据结构

```text
红黑树
+
Ready List
```

---

## LT和ET区别

LT：

```text
没读完继续通知
```

---

ET：

```text
只通知一次
```

---

## Go网络模型底层是什么

```text
epoll
+
Netpoll
+
Goroutine
```

---

# 当前知识树

```text
操作系统
│
├── 程序运行原理
├── CPU
├── 内存
├── 虚拟内存
├── 进程
├── 线程
├── 用户态/内核态
├── System Call
├── 阻塞IO
├── 非阻塞IO
├── select
├── poll
│
└── epoll
    ├── 红黑树
    ├── Ready List
    ├── LT
    └── ET
```

---

# 下一课（Go程序员最需要的一课）

下一节：

# 虚拟内存（Virtual Memory）

我们会讲：

```text
页(Page)
页表(Page Table)
TLB
缺页中断(Page Fault)
mmap
Copy On Write
```

以及：

```text
为什么程序能申请100GB内存
机器却只有16GB
```

还有：

```text
Go GC
MySQL Buffer Pool
Redis
```

为什么都和虚拟内存密切相关。

这一课结束后，你对内存的理解会提升一个层次。
