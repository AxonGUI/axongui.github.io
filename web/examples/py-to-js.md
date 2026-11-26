# 从 Python 调 JS

<span class="channel-tag">PY → JS</span>

反方向也一样简单：网页里注册一个普通对象，Python 里用 `Axon("窗口名").对象名.方法名(...)` 调它。

## JS 侧：注册一个对象

```js [docs-js.js]
// docs-js.js
import { AxonController } from "axon-gui";

AxonController.register("DocsJS", {
  value: 7,

  mirror(payload) {                     // 普通方法
    return { mirrored: payload, at: Date.now() };
  },

  async sleepEcho(payload, ms = 300) {  // async 方法也可以
    await new Promise((r) => setTimeout(r, ms));
    return payload;
  },
});
```

注册名 `DocsJS` 就是 Python 侧用的名字。

## Python 侧：取结果

```python [controller.py]
from axon import Axon

# Axon("MainView") 里的 MainView 是窗口名，要和 AxonGUI("MainView", ...) 一致
js = Axon("MainView").DocsJS

# 调用并等结果（单位秒）；超时会抛异常，不会永远挂着
result = js.mirror({"hello": "from python"}).result(5)   # [!code highlight]
print(result)          # {'mirrored': {'hello': 'from python'}, 'at': 1732...}

# async 方法一样调
js.sleepEcho("hi", 200).result(5)
```

在 `async def` 里也可以直接 `await`：

```python [controller.py]
result = await js.mirror({"hello": "from python"})   # [!code highlight]
```

<LiveDemo id="pyToJs" />

## 读写 JS 的属性

```python [controller.py]
value = Axon("MainView").DocsJS.value.get(5)     # 读
Axon("MainView").DocsJS.value = 99               # 写
```

<LiveDemo id="pyToJsProperty" />

## 悬停看类型

`AxonController.register()` 传进去的对象就是你暴露给 Python 的 API，方法签名会被保留。

```ts twoslash
import { AxonController } from "axon-gui";

const DocsJS = {
  value: 7,
  mirror(payload: { hello: string }, label = "docs") {
    return { mirrored: true, payload, label, at: Date.now() };
  },
};

AxonController.register("DocsJS", DocsJS);
```

## 要点

- **`.result(timeout)` 或 `await`**：不取结果的话，JS 侧的返回会被丢掉，你还看不到错误。
- **窗口名必须对**：`Axon("MainView")` 里的名字要和 `AxonGUI("MainView", ...)` 一样，否则报 `web 'MainView' not found`。
- **JS 侧抛的错在 Python 是 `JSRuntimeError`**，可以被 `try/except` 接住。
- **Python → JS 只能在窗口活着的时候调**；页面还没加载完时调用会失败，需要的话用 `loadFinished` 事件等一等（见[事件](/examples/event)）。
