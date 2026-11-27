# 跨窗口交互

一个 Axon 应用可以同时开好几个窗口（每个窗口一个 `AxonGUI`）。窗口之间也能互相调：
A 窗口的 JS 可以调 B 窗口的 JS，也可以一次打到所有窗口。

::: tip 一句话
窗口之间没有直连的通道，所有跨窗口调用都经 Python 中转——因为只有 Python 知道现在到底有哪些窗口活着。
:::

## 先分清两个名字

写跨窗口代码最容易踩的坑，是把**窗口名**和**控制器名**搞混：

| 名字 | 出现位置 | 例子 |
| --- | --- | --- |
| 窗口名 | `AxonGUI("charts", url)` 的第一个参数 | `"charts"` |
| 控制器名 | `AxonController.register("Series", {...})` 的 id | `"Series"` |

```javascript
//                窗口名 ↓        控制器名 ↓
await AxonCross.web("charts").Series.reload("600s");
```

本文的窗口叫 `main` 和 `charts`，里面的控制器叫 `Shell`（Python）和 `Series`（JS）——
**窗口名是小写的、指名「哪个页面」，控制器名是首字母大写的、指名「页面里的哪个对象」**。
两者不必相同，起名时故意错开，代码会好读很多。

## 三种用法

| 想要的效果 | JS 侧 | Python 侧 |
| --- | --- | --- |
| 问一下有哪些窗口 | `AxonCross.windows()` | `AxonCross.windows()` |
| 调指定窗口里的 JS 方法 | `AxonCross.web("charts").Series.reload()` | `AxonCross.call("charts", "Series", "reload")` |
| 一次打到所有窗口 | `AxonCross.broadcast({...})` | `AxonCross.broadcast("Toasts", "show", "已保存")` |
| 发事件给所有窗口 | `AxonCross.emit("theme:changed", "dark")` | `AxonCross.emit("theme:changed", "dark")` |
| 发事件给一个窗口 | `AxonCross.emitTo("charts", "theme:changed", "dark")` | `AxonCross.emit_to("charts", "theme:changed", "dark")` |

## 点一下试试（会真的再开一个窗口）

下面这些按钮不是动画演示：点第一个，真的会在你屏幕上再开一个 `charts` 窗口——
它打开的是一个**独立的演示页**（`/demo/cross-window.html`），不是说明书里的任何一页：
左边四个按钮、右边一列日志，专门用来看跨窗口调用往哪个方向走。
再点第二个，这条调用会穿过 Python 打到那个页面里——**两个窗口各显示自己那一半**。

<CrossInbox />

::: tip 两边一起看
`charts` 窗口里也有按钮：在那边点「回调主窗口」，这个页面上的「别的窗口调到我这里」会立刻多一条；
在这个页面点上面第二个按钮，`charts` 窗口的日志会多一条「收到 Peer.ping」。
:::

```js twoslash
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
// 1. 开第二个窗口（名字就叫 charts）
const windows = await Axon.DemoController.cross_open();
// → ["AxonDocs", "charts"]

// 2. 点名调用它里面的 JS 控制器（那个页面注册了 Peer 与 DocsJS）
const reply = await AxonCross.web("charts").Peer.ping("来自 AxonDocs 的跨窗口调用");
// → { web: "charts", echo: "来自 AxonDocs 的跨窗口调用", at: "…" }

// 3. 一次打到所有窗口，逐窗口收结果
await AxonCross.broadcast({ controller: "DocsJS", func: "note", args: ["广播"] });

// 4. 发事件（谁监听谁处理，不等回执）
await AxonCross.emit("demo:cross", "事件：来自 AxonDocs");
```

<LiveDemo id="crossOpen" />

<LiveDemo id="crossCall" />

<LiveDemo id="crossBroadcast" />

<LiveDemo id="crossEmit" />

<LiveDemo id="crossClose" />

::: tip 看两个窗口
点开 `charts` 窗口再点上面第二个按钮：`charts` 那边会立刻多一条日志
（`DocsJS.note` 被调用了），本站这边显示的是回执。
:::

## 调指定窗口

假设 `main` 窗口想通知 `charts` 窗口重新拉数据。

```python [main.py]
from axon import AxonGUI, AxonMagicGUI

app = QApplication([])
AxonMagicGUI()
main = AxonGUI("main", "http://127.0.0.1:5173/")
charts = AxonGUI("charts", "http://127.0.0.1:5173/charts.html")   # [!code highlight]
```

```javascript [charts.html]
// charts 窗口里：注册一个 JS 控制器，别人就能调它
import { AxonController } from "axon-gui";

AxonController.register("Series", {
  reload(range = "1d") {
    return loadSeries(range); // 返回 Promise 也行
  },
});
```

```javascript [main.html]
// main 窗口里：调 charts 窗口的 Series.reload()
import { AxonCross } from "axon-gui";

await AxonCross.web("charts").Series.reload("600s");
```

写法跟 `Axon.xxx` 一样：位置参数直接摊开；要 kwargs / 超时就用打包写法
`Series.reload([args], { kwargs }, timeoutMs)`。

也可以显式写全：

```javascript [main.html]
const value = await AxonCross.call({
  web: "charts",          // 窗口名
  controller: "Series",   // 控制器名
  func: "reload",
  args: ["600s"],
  timeout: 5000,
});
```

## 一次打到所有窗口

「所有人都刷新一下」这种，用广播。每个窗口各自返回结果，**一个窗口失败不影响别的**。

```javascript [main.html]
import { AxonCross, AxonChannels } from "axon-gui";

const results = await AxonCross.broadcast({
  controller: "Toasts",
  func: "show",
  args: ["配置已保存"],
  exclude: [AxonChannels.AxonEnv.web_name],   // 不用发给自己就不发
});

for (const item of results) {
  if (!item.ok) console.warn(item.web, "没收到:", item.error);
}
```

Python 侧：

```python [main.py]
from axon import AxonCross

futures = AxonCross.broadcast("Toasts", "show", "配置已保存")

# 一次等齐，单个窗口失败只记在它自己那条结果里
for item in AxonCross.results(futures, timeout=5):
    if not item["ok"]:
        print(f"{item['web']} 没收到: {item['error']}")
```

## 事件

事件是「只通知、不要返回值」，比调用更轻。**两个方向各写各的，别混在一起**——

### 方向一：JS 触发 → Python 监听

典型场景：用户在 `charts` 窗口点了「导出」，`main` 窗口的 Python 后端要记一笔。

```javascript [charts.html]
import { AxonEvent } from "axon-gui";

// JS 这一侧只负责「发」
AxonEvent.dispatchPYEvent({ type: "series:exported", args: ["600s", 1280] });   // [!code highlight]
```

```python [controller.py]
from axon import AxonController, AxonEvent

@AxonController("main")
class Shell:
    def __init__(self) -> None:
        # Python 这一侧只负责「收」
        AxonEvent.add_listener("series:exported", self._on_exported)           # [!code highlight]

    def _on_exported(self, range: str, points: int) -> None:
        print(f"导出了 {range}，{points} 个点")
```

### 方向二：Python 触发 → JS 监听

典型场景：后端拉完数据，通知所有窗口换主题、或者只通知 `charts` 刷新。

```python [controller.py]
from axon import AxonCross

AxonCross.emit("theme:changed", "dark")                       # 所有窗口的 JS 都会收到
AxonCross.emit_to("charts", "series:reloaded", "600s")        # 只发给 charts 窗口
```

```javascript [charts.html]
import { AxonEvent } from "axon-gui";

// JS 这一侧只负责「收」
AxonEvent.addListener("theme:changed", (theme) => applyTheme(theme));
AxonEvent.addListener("series:reloaded", (range) => loadSeries(range));
```

::: warning 记法
`AxonCross.emit` / `emitTo` 只走 **Python → JS**。
反过来（JS → Python）用 `AxonEvent.dispatchPYEvent({ type, args })`，两边不要混着写。
:::

## 悬停看类型

`AxonCross.call()` 是「点名调用」，`windows()` 拿当前窗口列表，`broadcast()` 返回每个窗口一份结果。

```ts twoslash
import { AxonCross } from "axon-gui";

async function pingCharts() {
  const reply = await AxonCross.call({ web: "charts", controller: "Peer", func: "ping", args: ["hi"] });
  const open = await AxonCross.windows();
  return { reply, open };
}
```

## 窗口表与生命周期

`AxonCross.windows()`（JS / Python 都一样）返回**现在还开着**的窗口名。

窗口关闭时会自动从表里摘掉；对已经关掉的窗口发起调用会立刻失败，而不是一直挂着：

```
RuntimeError: web `charts` not found
```

想在 JS 里开新窗口，让 Python 帮你开：

```python [controller.py]
@AxonController("main")
class Shell:
    def open_window(self, web_name: str, url: str) -> bool:
        from axon import AxonCross, AxonGUI

        if AxonCross.has(web_name):
            return False
        window = AxonGUI(web_name, url)
        window.show()
        return True
```

## 超时与错误

- JS 侧的 `timeout` 单位是**毫秒**（和 `Axon` 一致）；Python 侧的 `timeout` 单位是**秒**（和 `.result(5)` 一致）。
- 目标窗口里的异常会原样传回调用方：JS 侧是 rejected Promise（消息里带 Python 侧栈），
  Python 侧是 Future 里的异常。
- 广播里某个窗口超时/报错只影响它自己那条结果（`{web, ok:false, error}`）。

::: warning 别写成环
A → B → A 这种「回头调」是可以的（不会互相卡死），但别写出不带出口的递归：
每次跨窗口调用都是真实的往返，环会一直转下去。要传递结果就一路 return 回去。
:::

## 跨窗口共享状态

如果需求是「两个窗口看到同一份数据」，不要用调用硬凑，用共享 Store：

```javascript [main.html]
import { AxonStore } from "axon-gui";

AxonStore.shared.set("theme", "dark"); // 所有窗口的 shared 都会更新
```

细节见 [跨端 Store](/examples/store)。
