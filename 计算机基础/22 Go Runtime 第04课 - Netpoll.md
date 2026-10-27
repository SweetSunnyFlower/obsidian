---
title: "22 Go Runtime 第04课 - Netpoll"
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
original_order: 22
original_dialogue_turn: 30
original_message_id: "9be9c732-e58f-4e41-bf5a-ee2ef4c4d9d7"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
  - "https://go.dev/doc/go1.26"
  - "https://go.dev/doc/go1.25"
  - "https://go.dev/doc/go1.21"
  - "https://go.dev/doc/go1.14"
---

> [!info] 原文映射
> 重排序号：第 22 / 26 篇  
> 原始对话轮次：第 30 / 34 组  
> 原始回答消息 ID：`9be9c732-e58f-4e41-bf5a-ee2ef4c4d9d7`  
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

# Go Runtime 第四课：Netpoll（网络轮询器）—— Go 为什么能轻松支撑几十万 TCP 连接？

> **这一课，是 Go 高并发服务器性能的核心。**

你以后写：

```go
http.ListenAndServe(":8080", nil)
```

或者：

```go
conn.Read(buf)
```

甚至：

```go
io.Copy(conn1, conn2)
```

你几乎没有关心过：

> **为什么一个 `Read()` 阻塞了，却不会把整个程序卡死？**

今天，我们就把这个秘密彻底讲透。

---

# 第一章：先回忆 epoll

我们前面讲过：

Linux：

```text
epoll
```

负责：

```text
监控

哪些Socket

有事件
```

例如：

```text
Socket1

Socket2

Socket3

...

Socket100000
```

Linux：

会告诉你：

```text
Socket888

可读

Socket9527

可写
```

而不是：

```text
遍历100000个Socket
```

---

那么：

Go：

是不是：

每个：

```go
conn.Read()
```

都：

直接：

调用：

```text
epoll_wait()
```

？

当然不是。

---

# 第二章：如果没有 Netpoll

假设：

你写：

```go
go handle(conn1)

go handle(conn2)

...

go handle(conn100000)
```

里面：

都是：

```go
conn.Read(buf)
```

---

如果：

Read：

直接：

系统调用。

那么：

100000个：

```text
Read()
```

都会：

阻塞：

100000个线程。

显然：

不可能。

---

# 第三章：Go 的真正做法

Go：

第一次：

收到：

Socket。

会：

设置：

```text
NonBlocking
```

非阻塞。

例如：

Linux：

```c
fcntl(fd,F_SETFL,O_NONBLOCK)
```

以后：

这个：

Socket：

不会：

真正：

阻塞。

---

# 第四章：NonBlocking 会发生什么？

例如：

调用：

```go
conn.Read(buf)
```

实际上：

进入：

```text
read(fd)
```

---

如果：

有数据。

返回：

```text
OK
```

---

如果：

没有数据。

Linux：

返回：

```text
EAGAIN
```

意思：

```text
现在没有。

以后再来。
```

注意：

不是：

```text
睡觉
```

线程。

---

# 第五章：Go Runtime 怎么办？

收到：

```text
EAGAIN
```

Runtime：

知道：

```text
当前：

不能继续。
```

于是：

第一件事：

```text
把G挂起
```

例如：

```text
G1

↓

Waiting
```

状态。

---

第二件事：

告诉：

```text
Netpoll
```

：

```text
帮我监听：

fd=100
```

---

第三步：

```text
schedule()
```

继续：

执行：

其它：

G。

整个：

线程：

一点：

没有阻塞。

---

# 第六章：Netpoll 在干什么？

Netpoll：

其实：

一直：

后台：

运行。

不停：

```text
epoll_wait()
```

例如：

```text
epoll_wait()
```

返回：

```text
fd100

可读
```

---

Runtime：

马上：

找到：

对应：

```text
G1
```

然后：

放回：

```text
Run Queue
```

于是：

下一轮：

调度。

继续：

执行：

```go
conn.Read()
```

后面的代码。

---

# 第七章：整个流程

假设：

```go
data:=make([]byte,1024)

conn.Read(data)

fmt.Println("收到数据")
```

发生：

第一步：

```text
Read()
```

没有数据。

---

第二步：

Linux：

```text
EAGAIN
```

---

第三步：

```text
G

↓

Waiting
```

---

第四步：

```text
Netpoll

↓

epoll_wait
```

---

第五步：

客户端：

发送：

数据。

---

第六步：

Linux：

通知：

```text
fd

Readable
```

---

第七步：

Netpoll：

找到：

```text
G
```

重新：

放：

```text
Run Queue
```

---

第八步：

继续：

```go
fmt.Println("收到数据")
```

---

注意：

整个：

线程：

没有：

一直：

等待。

---

# 第八章：Netpoll 和 GMP 如何协作？

真正：

关系：

```text
Client

↓

Socket

↓

epoll

↓

Netpoll

↓

Run Queue

↓

P

↓

M

↓

CPU
```

是不是：

串起来了？

前面：

所有课程：

终于：

连上了。

---

# 第九章：为什么 Go 能支撑几十万连接？

假设：

```text
100000连接
```

其中：

```text
99990
```

正在：

等待：

客户端。

---

真正：

运行：

只有：

```text
10个
```

G。

---

其它：

```text
99990
```

只是：

```text
Waiting
```

状态。

不占：

CPU。

也不占：

线程。

所以：

Go：

可以：

轻松：

管理：

几十万：

连接。

---

# 第十章：Netpoll 有几个线程？

很多人：

误以为：

```text
100000连接

=

100000线程
```

不是。

实际上：

通常：

只有：

```text
一个

Netpoll线程
```

（准确地说，是 Runtime 中负责网络轮询的机制，并不需要为每个连接创建线程。）

它：

不停：

```text
epoll_wait
```

收到：

事件。

然后：

唤醒：

对应：

G。

---

# 第十一章：为什么说 Go 是同步代码，异步执行？

例如：

你写：

```go
conn.Read()

fmt.Println("Hello")
```

看起来：

就是：

同步。

一步：

一步。

---

实际上：

Runtime：

偷偷：

变成：

```text
Read

↓

没数据

↓

挂起G

↓

别人运行

↓

数据来了

↓

恢复G

↓

继续Println
```

所以：

你：

写的是：

```text
同步
```

Runtime：

执行的是：

```text
异步
```

这就是：

Go：

最大的魅力。

---

# 第十二章：Netpoll 与 Channel 的区别

很多人：

误解：

```text
channel

就是：

网络
```

不是。

---

Channel：

负责：

```text
G

和

G
```

通信。

---

Netpoll：

负责：

```text
Linux

和

G
```

通信。

---

两个：

最终：

都会：

把：

```text
Waiting G
```

重新：

放回：

Run Queue。

所以：

调度器：

统一：

处理。

---

# 第十三章：为什么 net/http 那么快？

例如：

```go
http.ListenAndServe()
```

底层：

其实：

不断：

```text
Accept()

↓

Read()

↓

Write()
```

---

但是：

所有：

Socket：

全部：

注册：

```text
Netpoll
```

所以：

根本：

不用：

你：

自己：

写：

```text
epoll
```

Go Runtime：

已经：

封装好了。

---

# 第十四章：一个完整请求生命周期

客户端：

连接：

```text
TCP
```

↓

Runtime：

```text
Accept
```

↓

创建：

```text
G
```

↓

Handler：

```go
func(w,r)
```

↓

调用：

```go
Read()
```

↓

没有：

数据。

↓

```text
Waiting
```

↓

Netpoll：

监听。

↓

客户端：

继续：

发送。

↓

Netpoll：

唤醒。

↓

重新：

Run Queue。

↓

继续：

Handler。

↓

返回：

响应。

整个过程中，**真正执行 CPU 的时间可能只有几毫秒，其余时间 Goroutine 都处于等待状态**。

---

# 第十五章：为什么普通文件不用 Netpoll？

这是一个很容易被问到的问题。

很多人认为：

```text
文件

Socket

都是：

文件描述符
```

为什么：

```go
os.File.Read()
```

不能：

像：

```go
conn.Read()
```

一样？

答案：

Linux：

```text
epoll
```

主要：

监听：

```text
Socket

Pipe

Eventfd
```

等：

可事件通知：

对象。

普通：

磁盘文件：

通常：

始终：

```text
Readable
```

因为：

数据：

来自：

页缓存。

所以：

Linux：

不会：

给：

普通：

文件：

产生：

```text
可读事件
```

因此：

Go：

普通文件：

Read：

还是：

阻塞：

线程。

（现代 Linux 还有 `io_uring` 等新机制，以后我们会讲。）

---

# 面试高频

## 为什么 conn.Read() 不阻塞线程？

因为：

```text
Socket

非阻塞
```

返回：

```text
EAGAIN
```

Runtime：

挂起：

G。

---

## 谁负责监听 Socket？

```text
Netpoll

↓

epoll
```

---

## 数据来了怎么办？

```text
Netpoll

↓

唤醒G

↓

Run Queue
```

---

## 为什么 Go 可以支撑几十万连接？

```text
连接

≠

线程
```

等待中的连接：

只是：

```text
Waiting G
```

---

## Netpoll 和 Channel 有什么关系？

```text
最终：

都是：

唤醒：

Waiting G
```

交给：

调度器。

---

# 整个 Runtime 已经串起来了

```text
                   go func()

                       │
                       ▼

                     创建 G

                       │
                       ▼

              放入 P Local Queue

                       │
                       ▼

                  schedule()

                       │
                       ▼

                 M 执行 G

                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼

      正常执行                 conn.Read()

          │                         │
          ▼                         ▼

       执行完成              返回 EAGAIN

                                    │
                                    ▼

                             G -> Waiting

                                    │
                                    ▼

                             Netpoll(epoll)

                                    │
                                    ▼

                              数据到达

                                    │
                                    ▼

                           G 回到 Run Queue

                                    │
                                    ▼

                              继续执行
```

---

# 当前知识树

```text
Go Runtime
│
├── GMP
├── Work Stealing
├── schedule()
├── gobuf
├── g0
├── Stack Growth
├── Async Preemption
├── Netpoll
│   ├── NonBlocking Socket
│   ├── epoll
│   ├── Waiting G
│   ├── EAGAIN
│   └── Run Queue
```

---

# 🎓 今天的课后实验

启动一个简单的 TCP 服务：

```go
ln, _ := net.Listen("tcp", ":8080")
for {
    conn, _ := ln.Accept()
    go handle(conn)
}
```

然后使用 `strace` 观察：

```bash
strace -f -e trace=epoll_wait,epoll_ctl,read,write ./server
```

你会看到：

- `epoll_ctl`：注册 Socket 到 epoll。
- `epoll_wait`：等待网络事件。
- `read`：真正读取数据。

这能帮助你把 Go Runtime 和 Linux 内核的协作关系真正建立起来。

---

# 下一课（Go Runtime 最难的一章）

下一节开始讲 **Go 内存分配器（Allocator）**。

我们会彻底讲明白：

- `new()` 和 `make()` 底层到底做了什么？
- `mallocgc()` 是如何工作的？
- Go 为什么不用 `malloc/free`？
- 什么是 **Tiny、Small、Large Object**？
- `mcache`、`mcentral`、`mheap` 三层分配器为什么能做到高性能？

这一章是 **Go Runtime + GC** 的基础，也是阅读 Go 源码时最重要的模块之一。
