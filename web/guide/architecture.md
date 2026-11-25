# 架构与消息流

一页说清：一次调用从哪出发、经过什么、到哪结束。

## 全局只有一条通道

```text [消息流]
web page (Vue / HTML)                      python process
+-------------------------+                +-------------------------+
| await Axon.Xxx.method() |                | Xxx.method(...)         |
| Axon.Calc.value = 42    |--AxonJSCall--> | setVar / getVar         |
| AxonEvent.on("msg", fn) |                | Axon("M").Js.fn(...)    |
| AxonStore.get("k")      |<--AxonPYCall-- | AxonEvent               |
+-------------------------+                +-------------------------+
             \                                          /
              +------- QWebChannel (Qt built-in) -------+
                      args are JSON
```

左边是网页（Vue、React 或者一个手写 HTML 页面），右边是 Python 进程，都在同一个 `AxonGUI` 窗口里。
两条路由方向相反：`AxonJSCall` 由网页发往 Python，`AxonPYCall` 由 Python 发往网页；它们都跑在
Qt WebEngine 自带的 QWebChannel 上，参数与返回值走 JSON 序列化。

两条路由的分工：

| 通道 | 方向 | 用途 |
| --- | --- | --- |
| `AxonJSCallHandler` | JS → PY | 调用方法、读写属性、事件、Store 写入 |
| `AxonPYCall` | PY → JS | 反方向调用、Python 派发事件、Store 推送 |

两条都是**请求-响应**：每条消息带一个 `call_id`，另一端处理完按 id 回结果。所以两端都可以 `await`。

## 一次 JS → Python 调用发生了什么

```js [app.js]
await Axon.DemoController.add(2, 3);
```

1. `Axon.DemoController.add(2, 3)` 生成一个 `call_id`，把回调挂在它名下。
2. 通过 `AxonJSCallHandler` 发出 `{call_id, web_name, controller_id: "DemoController", prop: "add", args: [2, 3]}`。
3. Python 侧按 `web_name` 找到窗口，按 `controller_id` 找到控制器实例，取出 `add` 方法。
4. 方法在线程池里执行（`async def` 则进事件循环），得到返回值。
5. 用同一个 `call_id` 通过 `AxonPYCall` 回传结果。
6. JS 侧按 `call_id` 找到回调，Promise resolve —— `await` 拿到 `5`。

出异常也一样：Python 把异常信息回传，JS 侧的 Promise reject，`try/catch` 接住的就是 Python 的错误消息。

## 线程模型

方法在线程里跑，所以它不会卡住界面，但也要注意别乱用共享状态。

| Python 方法的写法 | 跑在哪 |
| --- | --- |
| `def method(self)` | 工作线程池（默认 `CPU 核数 + 4` 个线程） |
| `async def method(self)` | 独立的 asyncio 事件循环 |
| `AxonMagicGUI.run(fn)` 里的 `fn` | Qt 主线程 |

需要碰 Qt 控件（弹窗、改窗口、动 QWidget）时用 `AxonMagicGUI`，见[魔法窗口](/examples/magicgui)。

## 属性、事件、Store 分别怎么走

| 用法 | 走的路 | 有返回值吗 |
| --- | --- | --- |
| `Axon.Xxx.method(...)` | JS → PY 调用 | 有，`await` 取 |
| `await Axon.Xxx.prop` | JS → PY 读属性 | 有 |
| `Axon.Xxx.prop = v` | JS → PY 写属性 | 不等返回 |
| `AxonEvent.dispatch_js_event(...)` | PY → JS 事件 | 没有 |
| `AxonEvent.dispatchPYEvent(...)` | JS → PY 事件 | 没有 |
| `store.set(...)` | 双向推送 | 没有 |
| `Axon("MainView").Js.fn()` | PY → JS 调用 | 有，`.result()` 或 `await` |

## 启动顺序

页面刚加载时通道还没建好，所以：

1. Python 侧创建 `AxonGUI`，先注册通道对象，再加载页面。
2. 页面里 `await AxonInit()`，QWebChannel 连上，拿到 `{connected: true}`。
3. JS 侧告诉 Python「我好了」，Python 这才派发 `loadFinished` 事件。
4. 之后两端可以随意互调。

这也解释了为什么 `loadFinished` 事件不会漏：它等 JS 报到之后才发。没连上 Python 时 `AxonInit()` 返回 `{connected: false, reason: "no-qt-transport"}`，页面可以据此退化成普通网页（见[双模式](/projects/dual-mode)）。

## 多窗口

- 一个 `AxonGUI("名字", url)` 就是一个窗口，名字在进程内唯一。
- 控制器注册在某个窗口名下（`@AxonController("MainView")`），只在该窗口可用；不写窗口名则对所有窗口可用。
- `AxonStore` 和 `AxonEvent` 是进程级的，天然跨窗口；要给所有窗口发消息用 `Axon.broadcast`，见[广播](/examples/broadcast)。
