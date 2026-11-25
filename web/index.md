---
layout: home

hero:
  name: Axon
  text: Python + Web
  tagline: 一个窗口里同时跑 Python 和网页：两边可以直接互相调用方法、读写属性、收发事件。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 看一个真实调用
      link: /examples/call

features:
  - title: 前端不用学新框架
    details: Vue、React、Svelte 都行，甚至可以是一个手写 HTML 页面。能跑在浏览器里的，就能放进 Axon 窗口。
  - title: 两边听起来像本地调用
    details: JS 里写 await Axon.Calc.add(2, 3)，Python 里写 Axon("MainView").DocsJS.mirror(x)，剩下的传输由框架负责。
  - title: 一份页面，两种形态
    details: 同一个页面放进 Axon 窗口就是桌面应用；直接用浏览器打开就是纯静态网页，不需要改代码。
---

## 这个项目解决什么问题

用 Python 写桌面程序，界面一直是麻烦事：Qt 控件画得慢、改得慢，想用网页技术又得自己搭一层通信。

Axon 的做法是：**Python 负责逻辑和系统能力，网页负责界面**，中间由框架提供一条双向通道。

- 网页要算东西 → `await Axon.Calc.add(2, 3)`，Python 的 `add` 被调用，返回值回到 JS。
- Python 要更新界面 → `Axon("MainView").DocsJS.render(data)`，网页里的 `render` 被调用。

## 两个方向各写一行

**JS 调用 Python** —— Python 侧定义一个普通方法：

```python [controller.py]
from axon import AxonController

@AxonController("MainView")
class Calc:
    def add(self, a: int, b: int) -> int:
        return a + b
```

JS 侧直接调：

```js [app.js]
import { Axon, AxonInit } from "axon-gui";

await AxonInit();                    // 等通道连上
const sum = await Axon.Calc.add(2, 3); // 5
```

**Python 调用 JS** —— 网页侧挂一个普通对象：

```js [docs-js.js]
import { AxonController } from "axon-gui";

AxonController.register("DocsJS", {
  mirror(payload) {
    return { mirrored: payload, at: Date.now() };
  },
});
```

Python 侧调它：

```python [controller.py]
from axon import Axon

result = Axon("MainView").DocsJS.mirror({"hello": "world"}).result(5)
```

## 接下来读什么

| 你想做的事 | 看这一页 |
| --- | --- |
| 先搞清楚它是什么、适不适合我 | [什么是 Axon](/guide/what-is-axon) |
| 装好并跑起来第一个窗口 | [快速开始](/guide/quickstart) |
| 搞清楚消息是怎么走的 | [架构与消息流](/guide/architecture) |
| 只想当网页用，不要桌面窗口 | [本说明书](/projects/docs-site) |
| 照着抄一个完整例子 | [调用 Python 方法](/examples/call) |

## 这段文档本身也是示例

文档站是用 Axon 打包的桌面客户端（[下载](https://github.com/AxonGUI/Axon/releases/latest)）打开的。左边这些示例页，用客户端打开时每段代码下面会多出一个「运行这段示例」按钮，点了会真的调用 Python，并把两端传了什么逐条列出来；用浏览器打开时没有任何按钮，就是一份普通文档。

<LiveDemo id="call" />
