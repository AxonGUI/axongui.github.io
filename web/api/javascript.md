# JavaScript 端 API

两种引入方式，选一种：

::: code-group

```js [打包器 / 构建工具]
import {
  Axon, AxonInit, isAxonReady, isAxonConnected,
  AxonCall, AxonChannels, initChannels,
  AxonController, AxonEvent, AxonStore,
} from "axon-gui";
```

```html [直接引入 (UMD)]
<script src="./node_modules/axon-gui/dist/axon.umd.cjs"></script>
<script>
  const { Axon, AxonInit } = window.axon;
</script>
```

:::

用 UMD 时全局变量就是 `axon`，所以 `window.axon.Axon` 等价于上面 import 进来的 `Axon`。

## 初始化

### `AxonInit()`

签名：`AxonInit(): Promise<IAxonInitResult>`。连接 QWebChannel 并初始化各子系统。**整个页面调一次**，重复调用复用同一连接。

```js
const status = await AxonInit();
// { mode, connected, ready, reason?, objects, error? }

// 双形态判断就一行：
if (status.mode === "web") {
  // 纯网页：后端相关的东西别渲染
}
```

没有 Python 后端时不抛错，返回 `{mode: "web", connected: false, ready: false, reason: "no-qt-transport"}`。

| 字段 | 含义 |
| --- | --- |
| `mode` | `"app"` 或 `"web"`。就是 `ready ? "app" : "web"`，要中间态看 `connected`/`reason` |
| `connected` | 通道是否连通 |
| `ready` | 三个通道对象齐备 + 握手完成 |
| `reason` | 没连上的原因（`no-qt-transport` / `retry-exhausted`） |
| `objects` | 后端暴露的对象名 |

### 悬停看类型

下面这段是真代码：鼠标悬停到任意标识符上（`status`、`mode`、`AxonInit`……），会显示从 `axon-gui` 类型定义里查出来的类型。

```ts twoslash
import { AxonInit } from "axon-gui";

async function boot() {
  const status = await AxonInit();
  return status.mode;
}
```

### `isAxonReady()`

签名：`isAxonReady(): boolean`。同步查询是否「已连上且三个通道对象齐全」。适合初始化之后再用来做条件判断。

### `isAxonConnected()`

签名：`isAxonConnected(): boolean`。同步查询是否连上了通道。

### `initChannels()`

签名：`initChannels(): Promise<IAxonChannelStatus>`。只建通道、不初始化子系统。一般不需要直接用。

## 类型：动态部分给 `any`，静态部分给真实类型

`Axon` 和 `AxonCross.web()` 背后的控制器名、方法名只有运行时才知道，所以这两个
**类型上就是 `any`** —— 硬要用索引签名去描述，只会让开了
`noPropertyAccessFromIndexSignature` / `noUncheckedIndexedAccess` 的项目报错。

想要静态类型，自己写一个接口再断言即可：

```ts
interface CalcApi {
  add(a: number, b: number): Promise<number>;
}
const calc = Axon.Calc as CalcApi;
const sum: number = await calc.add(2, 3);   // 有补全、有检查
```

其余 API（`AxonStore`、`AxonEvent`、`AxonCall`、`AxonCross.call/broadcast`、`AxonInit`）
都是真实类型，且允许指定返回值：

```ts
const sum = await AxonCall.call<number>({ controller_id: "Calc", func: "add", args: [2, 3] });
const title = await AxonCall.getVar<string>({ controller_id: "Calc", var_name: "title" });
```

> 包本身 `strict` 全绿，并带一个「消费方类型测试」（bundler 与 node16 两种解析、
> 开满严格选项）挡回归。

## 写法约定：一律 `await`

所有调用都返回 `Promise`，样例统一用 `await` —— 它跟 `try/catch` 一起用最直接，
也不会出现"忘了返回导致外层拿到 undefined"这类问题：

```js
try {
  const sum = await Axon.DemoController.add(2, 3);
} catch (err) {
  console.error(err);          // Python 抛的异常、超时，都在这里
}
```

`.then()` 与 `await` 完全等价（内部就是同一个 `Promise`），只在**必须待在非 async 回调里**
时才用：

```js
// 比如某个第三方回调不接受 async 函数
button.addEventListener("click", () => {
  Axon.DemoController.add(2, 3).then((sum) => console.log(sum));
});
```

一条规则：能写 `await` 就写 `await`。

## `Axon` —— 调用 Python

`Axon` 是代理对象，`Axon.控制器名.方法名` 就是一次调用。

```js
// 位置参数
await Axon.Calc.add(2, 3);

// 打包写法：[位置参数, 关键字参数, 超时毫秒]
await Axon.Calc.with_kwargs([1], { b: 2 });
await Axon.Calc.slow([1500], {}, 300);      // 300ms 超时

// 读属性（一次往返，必须 await）
const n = await Axon.Calc.counter;

// 写属性（发出即忘）
Axon.Calc.counter = 42;
```

| 形式 | 说明 |
| --- | --- |
| `Axon.Ctl.fn(...)` | 位置参数即 `args`，返回 `Promise` |
| `Axon.Ctl.fn([args], kwargs?, timeoutMs?)` | 第一个参数是数组时为打包写法 |
| `await Axon.Ctl.prop` | 读属性（`getVar`） |
| `Axon.Ctl.prop = v` | 写属性（`setVar`），不等待 |

超时会 reject，消息形如 `Timeout Error, py not return in 300ms`。Python 侧的调用不会因此中断。

## `AxonCall` —— 低层调用

需要手工控制时用它（框架内部也用它）。

```js
await AxonCall.call({ controller_id: "Calc", func: "add", args: [2, 3], kwargs: {}, timeout: 3000 });
await AxonCall.setVar({ controller_id: "Calc", var_name: "counter", value: 42 });
const v = await AxonCall.getVar({ controller_id: "Calc", var_name: "counter" });
await AxonCall.crossCall({ web_name: "MainView", controller_id: "Calc", func: "add", args: [1, 2] });
```

`AxonCall.init()` 负责挂上接收 Python 回调的信号，`AxonInit()` 已经调过。

## 悬停看返回类型

低层的 `AxonCall.call<T>()` 也是同样：类型参数决定 `await` 之后的类型。

```ts twoslash
import { AxonCall } from "axon-gui";

async function call() {
  const sum = await AxonCall.call<number>({ controller_id: "DemoController", func: "add", args: [2, 3] });
  return sum.toFixed(1);
}
```

## `AxonController` —— 让 Python 能调用 JS

```js
import { AxonController } from "axon-gui";

// 1) 直接注册对象（推荐，写法最清楚）
AxonController.register("DocsJS", {
  value: 7,
  mirror(payload) { return { mirrored: payload }; },
  async sleepEcho(payload, ms = 300) { /* ... */ },
});

// 2) 装饰器写法，控制器名默认取类名
@AxonController()
class DocsJS { ... }
```

| 方法 | 说明 |
| --- | --- |
| `AxonController.register(id, object)` | 注册一个对象 |
| `AxonController.unregister(id)` | 注销 |
| `AxonController.get(id)` | 取回已注册对象，没有则抛错 |

## `AxonEvent` —— 事件

```js
// addListener 返回退订函数，存起来在卸载时调
const off = AxonEvent.addListener("demo:event", handler);
off();                                        // 等价于 removeListener("demo:event", handler)

AxonEvent.addListener("loadFinished", handler, { once: true });
AxonEvent.removeListener("demo:event", handler);
AxonEvent.removeAllListeners("demo:event");

// 在 JS 侧派发（本页监听器会被调用）
AxonEvent.dispatchEvent("demo:event", 1, 2);

// 发给 Python
AxonEvent.dispatchPYEvent({ type: "demo:pong", args: [1, 2, 3] });
```

`on` / `off` 是 `addListener` / `removeListener` 的别名。

内置事件（由 Qt 窗口派发）：`loadFinished`、`contextMenu`、`dragEnter`、`dragMove`、`drop`、`dragLeave`、`hide`、`show`。

通道**中途**断开（窗口关闭、页面导航走）时，还在等 Python 回包的 Promise 会 reject 成
`AxonChannelLostError`（`CHANNEL_LOST`），`AxonChannelStatus.reason` 变成 `"page-unloaded"`。
以前这些 Promise 永远悬着：`await` 它既不 resolve 也不进 `catch`。

## 错误

两端抛出来的都是 `Error` 子类，带稳定的 `code`，不用靠匹配文案分流：

| 类 | `code` | 什么时候 |
| --- | --- | --- |
| `AxonTimeoutError` | `TIMEOUT` | `timeout` 到期，Python 没回 |
| `AxonNotConnectedError` | `NOT_CONNECTED` | 通道还没连上就发起调用 |
| `AxonChannelLostError` | `CHANNEL_LOST` | 通道中途断开（页面卸载 / 渲染进程退出），已发出的调用不会再回 |
| `AxonRemoteError` | `REMOTE` | Python 侧抛了异常，被带回来（`message` 是它的文案） |
| `AxonError` | `AXON` | 上面四个的基类 |

```js
try {
  await Axon.Greeter.greet("Axon", { timeout: 300 });
} catch (e) {
  if (e instanceof AxonTimeoutError) console.warn("太慢了", e.code);
  else if (e instanceof AxonRemoteError) console.error("Python 里炸了：", e.message);
  else throw e;
}
```

全部从 `axon-gui` 导出。Python 侧有对称的 `AxonError / AxonTimeoutError / AxonNotConnectedError /
AxonChannelLostError / JSRuntimeError`（见 [Python API](/api/python#错误)），`AxonTimeoutError` 同时继承内置 `TimeoutError`。

## `AxonStore` —— 跨端键值

```js
const store = new AxonStore("docs-store");     // 同名即同一份

store.set("k", 1);                             // 写，并推给 Python
store.get("k");                                // 读本地缓存（同步，直接是值）
store.get<number>("k");                        // 静态类型：取出来是 number
await store.get("k");                          // await 也行（值本身不是 thenable，直接返回）
store.prop("k").get();                         // 要属性对象时用 prop()
store.prop("k").set(2);                        // 等价于 store.set("k", 2)

store.release();                               // 注销这个 store
```

| 成员 | 说明 |
| --- | --- |
| `new AxonStore(id)` | 同名复用同一实例；会通知 Python 侧创建对应 store |
| `get(name)` | 读**值**（同步，与 Python 的 `store.get` 同义） |
| `prop(name)` | 取 `AxonStoreProperty` 对象（通过它读写） |
| `set(name, value)` | 写并同步 |
| `setFromPeer(name, value)` | 接收对端写入（框架内部用） |
| `AxonStore.shared` | 全局共享 store，`AxonInit()` 时创建 |

`AxonStoreProperty` 有 `get()` / `set(value)` / `setFromPeer(value)` / `.value`。

## `AxonCross` —— 跨窗口

窗口之间互调、广播、发事件都从这里走（详见 [跨窗口交互](/examples/multi-window)）。

```js
import { AxonCross } from "axon-gui";

await AxonCross.windows();                                  // ["main", "charts"]
await AxonCross.has("charts");                              // true
await AxonCross.web("charts").Charts.reload("600s");        // 指名调另一个窗口
await AxonCross.call({ web: "charts", controller: "Charts", func: "reload", args: ["600s"] });
await AxonCross.broadcast({ controller: "Toasts", func: "show", args: ["已保存"] });
await AxonCross.emit("theme:changed", "dark");              // 事件：所有窗口
await AxonCross.emitTo("charts", "theme:changed", "dark");  // 事件：一个窗口
```

| 成员 | 说明 |
| --- | --- |
| `windows()` | 现在开着的窗口名 |
| `has(web)` | 这个窗口还在不在 |
| `web(name)` | 返回 `Axon` 那样的 Proxy：`AxonCross.web("b").Ctl.fn(...)` |
| `call({web, controller, func, args, kwargs, timeout})` | 调一个窗口里的 JS 方法 |
| `broadcast({controller, func, args, kwargs, timeout, exclude})` | 打到所有窗口，返回 `{web, ok, value?, error?}[]` |
| `emit(type, ...args)` | 事件发给所有窗口 |
| `emitTo(web, type, ...args)` | 事件发给指定窗口 |

`timeout` 单位是毫秒；目标窗口里的异常会变成 rejected Promise。

## 类型

```ts
interface IAxonInitResult {
  mode: "app" | "web";
  connected: boolean;
  ready: boolean;
  reason?: "no-qt-transport" | "retry-exhausted";
  objects: string[];
  error?: string;
}

interface IAxonChannelStatus {
  connected: boolean;
  reason?: "no-qt-transport" | "retry-exhausted";
  objects: string[];
  error?: string;
}
```
