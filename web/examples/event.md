# 事件：两个方向

<span class="channel-tag">双向</span>

调用有返回值，事件没有。适合「通知一声」的场景：按钮被点了、进度更新了、窗口加载完了。

事件名是任意字符串，参数是 JSON 数组。两个方向用的是两套 API，**分开写、别混**：

| 方向 | 发送方 | 接收方 |
| --- | --- | --- |
| JS → Python | `AxonEvent.dispatchPYEvent({ type, args })` | `AxonEvent.add_listener(type, fn)` |
| Python → JS | `AxonEvent.dispatch_js_event(web, type, args)` | `AxonEvent.addListener(type, fn)` |

窗口之间的广播（`AxonCross.emit`）也是 Python → JS 方向，见[跨窗口交互](/examples/multi-window)。

## 方向一：JS 发 → Python 收

```javascript [app.js]
import { AxonEvent } from "axon-gui";

// 只负责发：事件名 + 参数数组
AxonEvent.dispatchPYEvent({ type: "demo:pong", args: [1, 2, 3] });   // [!code highlight]
```

```python [controller.py]
import threading

from axon import AxonController, AxonEvent

@AxonController("MainView")
class DemoController:
    def __init__(self) -> None:
        self.pong_log: list[list] = []
        self._lock = threading.Lock()

        # 只负责收：事件名要和 JS 发的完全一致
        AxonEvent.add_listener("demo:pong", self._on_pong)           # [!code highlight]

    def _on_pong(self, *args) -> None:
        with self._lock:
            self.pong_log.append(list(args))
```

<LiveDemo id="eventJsToPy" />

监听器在工作线程里执行，**不要在里面做耗时操作**——要干活就丢队列或者用 `AxonMagicGUI.run` 回主线程。

## 方向二：Python 发 → JS 收

```python [controller.py]
from axon import AxonEvent

# 只负责发：发给哪个窗口、事件名、参数
AxonEvent.dispatch_js_event("MainView", "demo:event", ["hello from python"])   // [!code highlight]
```

```javascript [app.js]
import { AxonEvent } from "axon-gui";

// 只负责收
function onEvent(text) {
  console.log("Python 说:", text);
}
AxonEvent.addListener("demo:event", onEvent);                    // [!code highlight]
```

<LiveDemo id="eventPyToJs" />

### 用事件推进度

一次性调用会一直等到结束；想让界面先看到中间状态，就在长任务里推事件：

```python [controller.py]
def stream(self, count: int = 4) -> dict:
    for i in range(count):
        AxonEvent.dispatch_js_event(
            WEB, "demo:progress", [{"step": i + 1, "total": count}]
        )
        time.sleep(0.15)
    return {"done": count}
```

```javascript [app.js]
AxonEvent.addListener("demo:progress", ({ step, total }) => {
  bar.style.width = `${(step / total) * 100}%`;
});
```

<LiveDemo id="stream" />

## 摘掉监听

`addListener` 返回的监听函数要留着，不然摘不掉：

```javascript [app.js]
const onProgress = (p) => render(p);
AxonEvent.addListener("demo:progress", onProgress);

// 页面卸载或不再需要时
AxonEvent.removeListener("demo:progress", onProgress);
```

Python 侧对应 `AxonEvent.remove_listener(type, fn)` 与 `AxonEvent.remove_all_listeners(type)`。

## Qt 内置事件

窗口本身也会发事件（`loadFinished`、`contextMenu`、`dragEnter`、`dragMove`、`drop`、`dragLeave`、`hide`、`show`），
用法和自定义事件一样，接收方都在 JS：

```javascript [app.js]
AxonEvent.addListener("loadFinished", () => console.log("页面加载完成"));
```

其中 `loadFinished` 是「等页面里的 JS 报到之后」才发的，不会比你的监听器更早，见[架构与消息流](/guide/architecture#启动顺序)。

## 悬停看类型

`addListener()` 返回退订函数，回调参数就是 `dispatchPYEvent` 带过来的值。

```ts twoslash
import { AxonEvent } from "axon-gui";

const off: () => void = AxonEvent.addListener("demo:event", (text: string) => {
  console.log(text.toUpperCase());
});

off();
```

## 要点

- **两个方向两套 API**：`dispatchPYEvent` 是 JS 发，`dispatch_js_event` / `AxonCross.emit` 是 Python 发；
- 事件名两端必须一字不差（`demo:pong` ≠ `demo:Pong`）；
- 参数只能是 JSON 能表示的东西；
- 监听器里别做耗时操作，也别抛异常（会只打日志，不会传回发送方）。
