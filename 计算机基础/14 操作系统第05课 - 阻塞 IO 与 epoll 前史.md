---
title: "14 操作系统第05课 - 阻塞 IO 与 epoll 前史"
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
original_order: 14
original_dialogue_turn: 22
original_message_id: "8e70de5f-73bd-4305-9fe0-19a5f67bb2e1"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
---

> [!info] 原文映射
> 重排序号：第 14 / 26 篇  
> 原始对话轮次：第 22 / 34 组  
> 原始回答消息 ID：`8e70de5f-73bd-4305-9fe0-19a5f67bb2e1`  
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

# 操作系统第五课：阻塞 IO、非阻塞 IO —— epoll 出现前的世界

这一课是整个操作系统部分最重要的课程之一。

因为：

```text
阻塞IO
↓
非阻塞IO
↓
select
↓
poll
↓
epoll
↓
Go Netpoll
↓
百万连接
```

是一条完整的技术演化路线。

你之前问过：

> epoll 为什么不用遍历全部连接？

今天学完前半部分，你会明白 Linux 为什么非要发明 epoll。

---

# 先从一个最简单的例子开始

假设你写：

```go
conn.Read(buf)
```

你以为发生了什么？

---

实际上：

```text
用户态
 ↓

read()

 ↓

内核态
 ↓

网卡缓冲区
 ↓

有没有数据？
```

---

如果：

```text
数据已经到了
```

那么：

```text
复制到用户缓冲区
↓
返回
```

---

如果：

```text
数据没到
```

怎么办？

---

# 最原始的方案：阻塞 IO

Linux 最开始就是这么干的。

---

假设：

```go
conn.Read(buf)
```

---

内核发现：

```text
网卡没数据
```

---

于是：

```text
线程睡觉
```

---

状态变成：

```text
Running
 ↓
Waiting
```

---

CPU去执行别的线程。

---

等数据来了：

```text
网卡
 ↓
中断
 ↓
内核
 ↓
唤醒线程
```

---

然后：

```text
复制数据
↓
返回
```

---

# 什么叫阻塞

阻塞：

```text
调用发起后

必须等结果
```

---

例如：

```go
data := Read()
```

---

执行期间：

```text
不能继续执行下面代码
```

---

必须等。

---

# 一个生活例子

去饭店吃饭。

---

阻塞IO：

```text
点餐
 ↓
站厨房门口
 ↓
一直等
 ↓
拿到饭
 ↓
离开
```

---

期间：

```text
什么都干不了
```

---

这就是阻塞。

---

# 阻塞IO最大问题

假设：

服务器有：

```text
10000个连接
```

---

传统模型：

```text
1连接
↓
1线程
```

---

变成：

```text
10000连接
↓
10000线程
```

---

问题来了。

---

# 大部分连接其实没数据

例如聊天系统：

```text
微信
```

---

10000个连接。

真正有数据的：

```text
20个
```

---

其余：

```text
9980个
```

都在：

```text
睡觉
```

---

但线程还在。

---

每个线程：

```text
8MB栈
```

（Linux 默认）

---

那么：

```text
10000 × 8MB

≈ 80GB
```

---

直接爆炸。

---

# 于是有人想到

能不能：

```text
不要睡觉

我主动问
```

---

# 非阻塞 IO

设置：

```c
fcntl(fd, F_SETFL, O_NONBLOCK)
```

---

此时：

```text
read()
```

不会睡觉。

---

例如：

```go
conn.Read(buf)
```

---

数据没到。

直接：

```text
EAGAIN
```

返回。

意思：

```text
哥们
没数据
下次再来
```

---

# 非阻塞IO怎么写

例如：

```go
for {
    n, err := conn.Read(buf)

    if err == EAGAIN {
        continue
    }

    process(buf[:n])
}
```

---

这样：

```text
线程永远不会睡
```

---

听起来很好。

---

实际上更惨。

---

# CPU被打爆

假设：

```text
10000连接
```

---

数据没来。

程序：

```text
读
失败

读
失败

读
失败
```

---

无限循环。

---

CPU：

```text
100%
```

直接烧满。

---

这叫：

```text
Busy Polling
忙轮询
```

---

# 阻塞IO和非阻塞IO对比

阻塞IO：

```text
没数据
↓
睡觉
```

优点：

```text
CPU省
```

缺点：

```text
线程多
```

---

非阻塞IO：

```text
没数据
↓
立即返回
```

优点：

```text
线程少
```

缺点：

```text
CPU高
```

---

两边都不满意。

---

# 第一个改进方案：select

于是 Linux 说：

> 你别一个一个问了。

> 把所有连接给我。

> 我帮你看看谁有数据。

---

例如：

```text
fd1
fd2
fd3
fd4
fd5
```

---

调用：

```c
select(...)
```

---

内核：

```text
遍历所有fd
```

---

发现：

```text
fd2有数据

fd5有数据
```

---

返回：

```text
fd2
fd5
```

---

程序只处理：

```text
fd2
fd5
```

即可。

---

# select的问题

假设：

```text
100000连接
```

---

每次：

```text
select
```

都要：

```text
遍历100000个fd
```

---

复杂度：

```text
O(n)
```

---

而且：

Linux早期：

```text
1024个连接
```

上限。

---

这就是：

```c
FD_SETSIZE
```

限制。

---

# poll出现

poll 本质：

```text
select升级版
```

---

解决：

```text
1024限制
```

---

但是：

```text
每次仍然遍历全部fd
```

---

复杂度还是：

```text
O(n)
```

---

问题仍在。

---

# 举个真实场景

假设：

```text
10万个TCP连接
```

---

真正活跃：

```text
10个
```

---

select/poll：

每次：

```text
遍历100000
```

---

最后发现：

```text
只有10个有数据
```

---

浪费巨大。

---

# Linux工程师终于忍不了了

他们发现：

问题根源不是：

```text
连接太多
```

而是：

```text
每次都遍历
```

---

于是提出一个新思路：

> 数据来了主动通知我。

而不是：

> 我不停问你。

---

这个思想就是：

```text
Event Driven
事件驱动
```

---

也就是：

```text
epoll
```

诞生的原因。

---

# 用餐厅比喻理解

阻塞IO：

```text
站厨房门口等
```

---

非阻塞IO：

```text
每秒问一次

好了吗？
好了吗？
好了吗？
```

---

select：

```text
10个人一起问

好了吗？
```

---

epoll：

```text
留电话

饭好了给我打电话
```

---

这就是本质区别。

---

# 为什么 Go 能处理几十万连接

因为 Go 不会：

```text
1连接
1线程
```

---

Go Runtime：

```text
Goroutine
+
epoll
```

组合。

---

例如：

```text
100000连接
```

---

可能只有：

```text
几个线程
```

负责等待 epoll。

---

数据来了：

```text
epoll
↓
Netpoll
↓
唤醒对应Goroutine
```

---

极其高效。

---

# 今天最重要的知识

### 阻塞IO

```text
没数据
↓
线程睡觉
```

---

### 非阻塞IO

```text
没数据
↓
立即返回
```

---

### Busy Polling

```text
不停询问
```

浪费CPU。

---

### select

```text
内核帮忙检查
```

但是：

```text
每次遍历全部fd
```

---

### poll

```text
解除1024限制
```

但是：

```text
仍然遍历
```

---

### 核心矛盾

```text
10万个连接

只有10个活跃

却检查10万个
```

---

# 下一课（你最关心的一课）

下一节：

# epoll 原理

我们会彻底讲清楚：

```text
epoll_create

epoll_ctl

epoll_wait
```

以及你之前问的：

> epoll 怎么做到不遍历全部连接，就知道哪些连接有数据？

这是 Linux 高性能网络的核心，也是 Go Netpoll 的基础。学完这一课，你就能真正理解：

```go
http.ListenAndServe(":8080", nil)
```

为什么能轻松扛住几万、几十万 TCP 连接。
