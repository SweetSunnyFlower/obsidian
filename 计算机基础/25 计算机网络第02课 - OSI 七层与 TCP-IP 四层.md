---
title: "25 计算机网络第02课 - OSI 七层与 TCP-IP 四层"
aliases:
  - "原文逐字笔记"
tags:
  - computer-science
  - verbatim
  - networking
created: "2026-10-27"
updated: "2026-10-27"
type: source-note
status: active
original_order: 25
original_dialogue_turn: 33
original_message_id: "85d0287c-b696-4c89-9aee-9d22168f4d02"
sources:
  - "https://chatgpt.com/share/6a7af5e5-c9b4-83ee-a8b8-b75c53e8214a"
---

> [!info] 原文映射
> 重排序号：第 25 / 26 篇  
> 原始对话轮次：第 33 / 34 组  
> 原始回答消息 ID：`85d0287c-b696-4c89-9aee-9d22168f4d02`  
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

# 计算机网络 第二课：OSI 七层模型 和 TCP/IP 四层模型—— 为什么网络一定要分层？

这一课是整个计算机网络最重要的基础。

**以后所有课程（TCP、HTTP、HTTPS、WebSocket、gRPC、Go net 包）都会建立在这一节课之上。**

---

# 今天我们要解决的问题

你每天都在写：

```go
http.Get("https://www.baidu.com")
```

或者：

```go
conn.Write([]byte("Hello"))
```

你有没有想过：

**从这一行代码开始，到数据真正发送到网卡，中间到底发生了什么？**

今天，我们就把整个过程拆开。

---

# 第一章：如果没有分层，会怎么样？

假设今天让你设计互联网。

你会怎么写？

可能是这样：

```text
发送数据

↓

查 DNS

↓

建立 TCP

↓

计算校验

↓

找 IP

↓

找 MAC

↓

控制网卡

↓

发送电信号
```

所有事情：

都写在一个函数里面。

例如：

```go
SendData() {
    // DNS
    // TCP
    // IP
    // Ethernet
    // Driver
}
```

问题来了。

如果：

以后：

HTTP 升级。

是不是：

整个：

```go
SendData()
```

都要改？

如果：

以后：

WiFi 换成：

5G。

是不是：

整个：

又要改？

如果：

TCP 升级：

HTTP3。

是不是：

又要改？

越来越乱。

---

# 第二章：现实世界也是这样设计的

盖房子。

不是：

一个人：

完成。

而是：

```text
建筑师

↓

水电

↓

木工

↓

油漆

↓

装修
```

每个人：

负责：

自己的事情。

网络：

也是一样。

于是：

提出：

```text
Layer（分层）
```

---

# 第三章：什么叫分层？

一句话：

> **每一层，只负责一件事情。**

例如：

HTTP：

只负责：

```text
怎么表示网页？
```

TCP：

只负责：

```text
怎么可靠发送？
```

IP：

只负责：

```text
怎么找到对方？
```

MAC：

只负责：

```text
怎么在当前局域网发送？
```

网卡：

负责：

```text
变成电信号
```

是不是：

一下：

清晰很多？

---

# 第四章：OSI 七层模型

这是学校最喜欢考的。

虽然：

现实：

几乎：

不用。

但是：

它帮助我们理解：

网络。

模型：

```text
7 应用层 (Application)

6 表示层 (Presentation)

5 会话层 (Session)

4 传输层 (Transport)

3 网络层 (Network)

2 数据链路层 (Data Link)

1 物理层 (Physical)
```

很多人：

第一次：

就开始背。

其实：

不用。

因为：

真正：

开发。

只关心：

四层。

---

# 第五章：TCP/IP 四层模型（真正工作中使用）

真正互联网：

使用：

```text
应用层

↓

传输层

↓

网络层

↓

网络接口层
```

或者：

很多书：

写：

```text
Application

↓

Transport

↓

Internet

↓

Link
```

记住：

以后：

我们：

全部：

讲：

这个。

---

# 第六章：每层到底负责什么？

## 第一层：应用层

这是：

距离：

程序员：

最近的一层。

例如：

```text
HTTP

HTTPS

WebSocket

gRPC

DNS

SMTP

FTP

SSH
```

都是：

应用层协议。

例如：

浏览器：

发送：

```http
GET / HTTP/1.1
Host: www.baidu.com
```

HTTP：

只关心：

```text
请求长什么样？
```

它：

不知道：

IP。

也不知道：

MAC。

---

## 第二层：传输层

这一层：

负责：

> **把数据安全送到对方程序。**

这里：

有两个明星：

```text
TCP

UDP
```

TCP：

负责：

```text
可靠

按顺序

不丢失
```

UDP：

负责：

```text
快

尽力而为
```

例如：

HTTP：

默认：

就是：

建立在：

TCP。

以后：

我们：

会详细讲。

---

## 第三层：网络层

负责：

```text
找到对方电脑。
```

这里：

最重要：

协议：

```text
IP
```

例如：

```text
192.168.1.100
```

或者：

```text
8.8.8.8
```

IP：

负责：

```text
数据：

送到：

目标机器。
```

但是：

它：

**不保证一定送到。**

记住：

这是：

TCP：

负责的。

---

## 第四层：网络接口层

负责：

真正：

发送：

数据。

例如：

```text
MAC 地址

交换机

网卡

WiFi

光纤
```

这一层：

负责：

真正：

发：

```text
010101010
```

---

# 第七章：一个 HTTP 请求如何经过四层？

假设：

```go
http.Get("https://example.com")
```

实际上：

发生：

```text
应用层

HTTP 请求
GET /

↓

传输层

TCP

↓

网络层

IP

↓

链路层

MAC

↓

网卡

↓

交换机

↓

路由器

↓

互联网
```

到达：

服务器。

服务器：

再：

反过来：

拆。

---

# 第八章：封装（Encapsulation）

网络：

最经典：

思想。

例如：

HTTP：

产生：

```text
GET /
```

然后：

TCP：

不会：

修改：

HTTP。

而是：

包一层：

```text
[TCP Header]

GET /
```

然后：

IP：

继续：

包：

```text
[IP Header]

[TCP Header]

GET /
```

然后：

MAC：

继续：

包：

```text
[MAC]

[IP]

[TCP]

GET /
```

最终：

发送。

是不是：

像：

俄罗斯套娃？

---

# 第九章：拆包（Decapsulation）

服务器：

收到：

数据。

先：

拆：

MAC。

然后：

IP。

然后：

TCP。

最后：

HTTP。

流程：

```text
收到数据

↓

MAC

↓

IP

↓

TCP

↓

HTTP

↓

应用程序
```

这就叫：

```text
解封装
```

---

# 第十章：为什么 HTTP 不直接使用 IP？

很多初学者：

会问：

HTTP：

为什么：

不用：

IP？

因为：

IP：

只能：

保证：

```text
尽力送
```

不能：

保证：

```text
收到

顺序

重传
```

HTTP：

需要：

可靠。

所以：

选择：

TCP。

以后：

HTTPS。

也是：

一样。

---

# 第十一章：为什么 HTTP3 不用 TCP？

这里：

埋一个伏笔。

HTTP1：

```text
HTTP

↓

TCP
```

HTTP2：

```text
HTTP

↓

TCP
```

HTTP3：

突然：

变成：

```text
HTTP

↓

QUIC

↓

UDP
```

为什么？

因为：

TCP：

已经：

不能：

满足：

现代：

互联网。

以后：

专门：

讲。

---

# 第十二章：程序员视角

以后：

你写：

```go
net.Listen()
```

其实：

工作：

在：

```text
传输层
```

---

写：

```go
http.ListenAndServe()
```

工作：

在：

```text
应用层
```

---

写：

```go
net.DialUDP()
```

直接：

使用：

UDP。

---

写：

```go
raw socket
```

甚至：

可以：

自己：

构造：

IP。

---

所以：

Go：

其实：

几乎：

可以：

操作：

整个：

协议栈。

---

# 一个完整的数据流

假设：

浏览器：

访问：

```text
https://example.com
```

真正：

经过：

```text
浏览器
    │
    ▼
HTTP
    │
    ▼
TLS（HTTPS 增加的一层）
    │
    ▼
TCP
    │
    ▼
IP
    │
    ▼
MAC
    │
    ▼
网卡
    │
    ▼
交换机
    │
    ▼
路由器
    │
    ▼
互联网
    │
    ▼
服务器
```

服务器：

再：

一层：

一层：

拆开。

---

# 面试高频

### OSI 七层和 TCP/IP 四层有什么区别？

OSI：

```text
理论模型
```

TCP/IP：

```text
真正互联网使用
```

---

### HTTP 属于哪一层？

```text
应用层
```

---

### TCP 属于哪一层？

```text
传输层
```

---

### IP 属于哪一层？

```text
网络层
```

---

### MAC 属于哪一层？

```text
数据链路层（TCP/IP 中属于网络接口层）
```

---

### 什么叫封装？

每经过：

一层：

增加：

自己的：

```text
Header
```

---

### 什么叫解封装？

接收方：

每经过：

一层：

去掉：

对应：

Header。

---

# 今天的知识树

```text
计算机网络
│
├── 基础
│   ├── 什么是网络        √
│   ├── Packet           √
│   ├── 地址             √
│   └── 协议             √
│
├── 网络模型
│   ├── OSI 七层         √
│   ├── TCP/IP 四层      √
│   ├── 封装             √
│   └── 解封装           √
│
├── IP
├── TCP
├── UDP
├── DNS
├── HTTP
├── HTTPS
├── Socket
└── epoll
```

---

# 🎓 课后思考

假设：

你的 Go 程序：

```go
http.Post("https://api.example.com", ...)
```

请思考：

1. HTTP 请求是谁生成的？
2. TCP 在什么时候加上自己的 Header？
3. IP Header 里面有哪些信息？
4. 为什么数据到了服务器，可以知道先交给 TCP，再交给 HTTP？

**这四个问题，就是下一节课要解决的内容。**

---

# 下一课（真正进入网络核心）

下一节我们讲：

# **IP 地址到底是什么？**

很多人都会背：

```text
192.168.1.1
```

但是几乎没人真正理解：

- IP 地址为什么是 32 位？
- 公网 IP 和私网 IP 有什么区别？
- 为什么 `127.0.0.1` 永远是自己？
- 为什么 `192.168.x.x` 不能直接访问互联网？
- 一台服务器为什么可以有多个 IP？
- 为什么还需要 MAC 地址，IP 不够吗？

这一课结束后，你对 **IP** 的理解会比大多数工作多年的开发者更扎实。
