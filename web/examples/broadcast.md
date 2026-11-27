# 广播：一次调用打到所有窗口

<span class="channel-tag">PY → 所有窗口</span>

一个进程里可以开多个窗口（多个 `AxonGUI`）。`Axon.broadcast` 把一次调用发给**所有还在的窗口**里
同名对象的同名方法，每个窗口返回一个 `Future`，拿回一个列表。

它跟魔法窗口没有关系：魔法窗口管的是"在哪条线程执行"，广播管的是"发给谁"。

## Python 侧

```python [controller.py]
from axon import Axon

# 所有窗口里的 DocsJS.note(...) 都会被调用；每个窗口一个 Future
futures = Axon.broadcast.DocsJS.note("hi from python")

for future in futures:          # 想等结果就取，不关心就跳过
    future.result(5)
```

## JS 侧

JS 侧不需要特别写什么 —— 只要那个窗口里注册了同名控制器（这里是 `DocsJS`），就会收到调用：

```js twoslash [docs-js.js]
// @noErrors
import { Axon, AxonCall, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
import { AxonController } from "axon-gui";

AxonController.register("DocsJS", {
  note(text) {
    console.log("[广播收到]", text);   // 每个窗口都会打印一次
    return text;
  },
});
```

<LiveDemo id="broadcast" />

## 要点

- **不保证顺序**，也不做去重：每个窗口都会收到一次。
- **失败是独立的**：某个窗口的方法抛了异常，只影响它自己那个 `Future`；
  可以用 `future.exception()` 单独检查。
- **窗口关掉就没有了**：广播只打给当前活着的窗口，不排队、不补发。
- **只给「所有窗口都该知道」的通知用**（比如主题切换、全局状态变化）；
  只发给某一个窗口时，直接 `Axon("那个窗口名").DocsJS.note(...)`。

::: tip 相关
需要"在 Qt 主线程执行"，用[魔法窗口](/examples/magicgui)。
:::
