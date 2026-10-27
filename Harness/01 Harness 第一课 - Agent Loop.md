---
title: "01 Harness 第一课 - Agent Loop"
aliases:
  - "Harness 第一课 - Agent Loop"
tags:
  - harness
  - ai-agent
  - verbatim
  - agent-loop
created: "2026-10-27"
updated: "2026-10-27"
type: chapter-note
status: active
source_message_id: "6253a897-bed8-4a88-821c-a1e8823d8463"
source_turn_id: "ac8a1a18-aff1-4408-8fcf-e63e62e18554"
sources:
  - "https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07"
---

> [!info] 原文映射
> 章节序号：01  
> 原始章节：第 1 课  
> 合并消息 ID：`6253a897-bed8-4a88-821c-a1e8823d8463`  
> 来源：[ChatGPT 分享对话](https://chatgpt.com/share/6ae01fdf-62f0-83ee-85a8-1d2ec0af6e07)  
> 内容策略：以下正文逐字保留，未总结、未改写、未调整原章节层级。
>
> **原始提问（逐字）**
>
> ~~~text
> 你来教我harness相关的知识吧
> ~~~

返回：[[Harness 知识地图]]

---

## 第 1 课：Agent Loop 到底是什么？

这是整个 Harness 的心脏。

假设你开发一个基于 Go 的 Agent，用户输入：

> 查看当前项目有哪些 Go 文件，统计数量，再告诉我项目使用了哪些主要依赖。

模型本身不会自动访问你的电脑。它可以提出工具调用请求，但必须由 Harness 执行，并将执行结果交还给模型。

<box border radius="xl" padding={3} gap={2}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="user" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **第 1 步：接收任务**

      <text size="sm">Harness 收到用户指令，将其加入当前会话。</text>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="brain" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **第 2 步：请求模型**

      <text size="sm">模型决定先调用列出文件的工具，而不是直接猜测结果。</text>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="terminal" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **第 3 步：执行工具**

      <text size="sm">Harness 检查权限，执行命令，并把真实结果加入对话历史。</text>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="repeat" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **第 4 步：继续循环**

      <text size="sm">模型根据结果决定是否再调用工具，例如读取 go.mod。</text>
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" size="40px" align="center" justify="center">
      <icon name="check-circle" size="xl"/>
    </box>
    <box flex="1" gap={1}>
      **第 5 步：结束任务**

      <text size="sm">模型返回最终答案，Harness 检测到正常结束条件后退出循环。</text>
    </box>
  </row>
</box>

Anthropic 的工具调用文档描述了同样的基本机制：模型提出工具调用，应用执行工具，再把结果传回模型，直到模型结束本轮或出现其他停止原因。<Cite refs={["turn164186search5"]}/>

### 关键代码：用 JavaScript 理解核心循环

我们先不依赖 LangChain、AI SDK 或其他框架，直接看 Harness 最核心的逻辑。

```js
async function runAgent({ model, tools, messages }) {
  const maxSteps = 10

  for (let step = 0; step < maxSteps; step++) {
    // 1. 让模型根据当前上下文决定下一步
    const response = await model.generate({
      messages,
      tools: tools.definitions(),
    })

    // 2. 保存模型响应
    messages.push(response.message)

    // 3. 模型不再要求调用工具，任务结束
    if (response.finishReason === "stop") {
      return response.message
    }

    // 4. 模型要求调用工具，由 Harness 执行
    if (response.finishReason === "tool_calls") {
      for (const call of response.toolCalls) {
        const tool = tools.get(call.name)

        if (!tool) {
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: `Unknown tool: ${call.name}`,
          })
          continue
        }

        try {
          const result = await tool.execute(call.arguments)

          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify(result),
          })
        } catch (error) {
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: `Tool failed: ${error.message}`,
          })
        }
      }
    }
  }

  throw new Error("Agent exceeded maximum steps")
}
```

<text color="secondary" size="sm">这是教学用伪接口示例，不是可以直接连接某家模型的完整程序。不同模型 SDK 的响应格式、工具调用 ID 和结束原因各不相同。</text>

看懂这段代码，就抓住了第一个关键点：**模型负责提出下一步动作，Harness 负责执行动作，并决定整个过程如何推进。**

不过，真正可用的 Harness 还必须处理工具参数校验、权限审批、模型异常、上下文超限、取消任务，以及模型达到最大步数却没有给出最终答案等问题。不能简单地把循环次数用完当作任务成功。

## 五、课后小测

先不急着背概念，我想看看你对执行流程的理解。

{@body const [answer,setAnswer] = DIL.useState("B")}
<box border radius="xl" padding={4} gap={3}>
  **问题 1：模型返回了一个 `read_file` 工具调用请求。接下来应该由谁读取文件？**

  <radio-group value={answer} onChange={setAnswer} direction="col">
    <radio value="A">A. 模型直接读取了服务器上的文件</radio>
    <radio value="B">B. Harness 根据工具定义和权限执行读取，再将结果交回模型</radio>
    <radio value="C">C. 前端必须直接读取服务器文件</radio>
    <radio value="D">D. 只要配置了 System Prompt，文件就会自动读取</radio>
  </radio-group>
  <button block onClick={() => GenUI.issueNewTurn("Harness 第 1 课小测：问题 1，我选择 "+answer+"。请批改并继续讲解。")}>提交答案</button>
</box>

你答完这道题，我们就继续往下拆：**一个真正的 Harness 是怎样把模型输出的 `tool_call` 变成实际执行的函数调用的？** 这一步会直接连接到你熟悉的 Node.js、Go，以及你之前研究过的 Skills、MCP 和 Agent Runtime。
