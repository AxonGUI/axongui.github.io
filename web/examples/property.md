# 读写 Python 属性

<span class="channel-tag">JS → PY</span>

JS 里 `Axon.Xxx.名字` 不是普通属性访问，而是一次跨进程读取。所以**读要 `await`，写不用等**。

## Python 侧：就是普通属性

```python [controller.py]
# controller.py
from axon import AxonController

@AxonController("MainView")
class DemoController:
    counter: int = 0          # 类属性、实例属性都行

    def get_counter(self) -> int:
        return self.counter
```

## JS 侧：读要 await，写直接赋值

```js twoslash [app.js]
// @noErrors
import { AxonCall, AxonController, AxonCross, AxonEvent, AxonStore } from "axon-gui";
const WEB = "MainView";
// ---cut---
import { Axon, AxonInit } from "axon-gui";

await AxonInit();

// 读：一次往返，所以必须 await
const before = await Axon.DemoController.counter;   // 0   // [!code highlight]

// 写：发出去就不管了，不等待 Python 返回
Axon.DemoController.counter = 42;

// 等一下再去读，确认 Python 真的改了
const after = await Axon.DemoController.get_counter();   // 42   // [!code highlight]
```

<LiveDemo id="property" />

## 为什么读取是异步的

`Axon.DemoController.counter` 在 JS 侧拿到的是一个「未来会有值」的对象：框架要先把请求发给 Python、等它把当前值传回来。

- 直接 `console.log(Axon.DemoController.counter)` 只会看到一个对象，看不到值；
- `await Axon.DemoController.counter` 才拿到真正的数字。

## 写属性之后什么时候生效

写属性是「发出即返回」。它之后到 Python 的到达顺序和后续调用一致，所以常见写法是：

```js twoslash [app.js]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
Axon.DemoController.counter = 42;
const now = await Axon.DemoController.get_counter();   // 一定是 42
```

如果要确认写入成功（比如怕 Python 侧拒绝），就显式调用一个方法，用它的返回值当回执。

## 悬停看类型

`getVar<T>()` 的返回值直接就是 `T`（读属性本质是一次往返调用）。

```ts twoslash
import { AxonCall } from "axon-gui";

async function bump() {
  const n = await AxonCall.getVar<number>({ controller_id: "DemoController", var_name: "counter" });
  return n + 1;
}
```

## 要点

- **属性名必须存在**：Python 里没有这个名字，读取会失败。
- **只走 JSON 类型**：数字、字符串、布尔、`None`、数组、字典。
- **不要在属性里做重活**：`@property` 会在工作线程里被调用，慢逻辑请用方法 + `async`。
- 属性适合放「状态」；需要参数、需要返回结构体时，还是写方法更清楚。
