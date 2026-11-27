# Python 端 API

```python
from axon import (
    AxonGUI, AxonController, Axon, AxonCall,
    AxonEvent, AxonStore, AxonMagicGUI,
)
```

分发包名是 `axon-gui`，模块名是 `axon`。

## 类型

包内带 `py.typed`（PEP 561），所以在你的项目里 `from axon import AxonGUI` 是有类型的，
mypy / pyright 会真的检查我们这边的注解。框架自身按 `mypy --strict` 维护，CI 会挡回归。

动态部分（`Axon("web").任何控制器`）在 Python 侧是 `Any` —— 控制器名只有运行时知道：

```python
from typing import Any, cast

future = Axon("MainView").Calc.add(2, 3)      # 返回 AxonFuture[Any]
sum_: int = future.result(5)
```

需要强类型时可以自己包一层：

```python
class CalcApi:
    def add(self, a: int, b: int) -> AxonFuture[int]: ...

calc = cast(CalcApi, Axon("MainView").Calc)
```

## `AxonGUI` —— 窗口

```python
from PySide6.QtWidgets import QApplication
from axon import AxonGUI

app = QApplication(sys.argv)
view = AxonGUI("MainView", "http://127.0.0.1:8000/")   # 窗口名 + 页面地址
view.resize(1200, 700)
view.show()
app.exec()
```

| 参数 | 说明 |
| --- | --- |
| `web_name` | 窗口名，进程内唯一；控制器和 `Axon("...")` 都用它定位 |
| `url` | 页面地址，可以是 `http://`、`file://` |
| `options` | `{"disable_native_context_menu": True}` 可关掉 Qt 原生右键菜单，让前端自己画；`crash_recovery` / `crash_reload_limit` 控制崩溃后的行为（见下文「崩溃之后」） |

| 方法 / 属性 | 说明 |
| --- | --- |
| `get_web(web_name)` | 取已创建的窗口（类方法） |
| `windows()` | 所有还开着的窗口名 |
| `registerChannel(id, obj)` | 额外暴露一个 QObject 给页面 |
| `web_name` | 窗口名 |

页面加载完成且 JS 通道就绪后，会向页面派发 `loadFinished` 事件。

### 崩溃之后

渲染进程崩掉（窗口还在、页面进程没了）时，Axon 做三件事，而不是留一张白纸：

1. 发给这个窗口、还在等回包的调用**立刻**变成 `AxonChannelLostError`（`CHANNEL_LOST`）——以前它们会一直挂着，没写 `timeout` 就是永远；
2. 在 Python 侧派发 `renderProcessCrashed` 事件，帮你把「刚才崩了」这件事记下来；
3. 默认自动重载页面，重载后通道重新握手、调用恢复可用。当前状态看 `view.render_crashed` / `view.last_crash`。

```python
from axon import AxonEvent

AxonEvent.add_listener(
    "renderProcessCrashed",
    lambda info: print(f"{info['webName']} 崩了：{info['status']}，作废 {info['failedCalls']} 个调用"),
)
```

事件参数：`webName`、`status`（如 `KilledTerminationStatus`）、`exitCode`、`failedCalls`、`willReload`。

重载有上限（默认连续 3 次），页面稳定 5 秒才把计数清零，避免「崩-重载-崩」死循环。要自己接管恢复：

```python
view = AxonGUI("MainView", url, options={"crash_recovery": "none", "crash_reload_limit": 3})
```

`"none"` 时只记录状态、派发事件，不重载。

## `AxonController` —— 让 JS 能调用 Python

```python
from axon import AxonController

@AxonController("MainView")            # 只在这个窗口可用
class Calc:
    def add(self, a: int, b: int) -> int:
        return a + b

@AxonController()                      # 所有窗口可用，控制器名 = 类名
class Common:
    ...
```

签名：`AxonController(web_name="*", id=None, shared=False)`

| 参数 | 说明 |
| --- | --- |
| `web_name` | 字符串或列表；`"*"` 表示所有窗口（含之后创建的窗口） |
| `id` | 控制器名，默认等于类名；JS 侧用 `Axon.<id>.<方法>` |
| `shared` | 为 `True` 时所有窗口共用一个实例 |

实例化时机：窗口创建（或控制器注册）时惰性创建。方法分两类：

- `def method(...)` → 工作线程池执行
- `async def method(...)` → asyncio 事件循环执行

## `Axon` —— 调用 JS

```python
from axon import Axon

js = Axon("MainView")              # 窗口名

js.DocsJS.mirror({"hello": "world"}).result(5)   # 调用并等结果（秒）
js.DocsJS.value.get(5)                            # 读 JS 属性
js.DocsJS.value = 99                              # 写 JS 属性（发出即忘）
```

### 该用 `.result()` 还是 `await`？

只看一件事：**你所在的函数是不是 `async def`**。

```python
@AxonController("MainView")
class Demo:
    def sync_method(self):                    # 普通 def -> 用 .result(超时秒数)
        return Axon("MainView").DocsJS.mirror({"a": 1}).result(5)

    async def async_method(self):             # async def -> 用 await
        return await Axon("MainView").DocsJS.mirror({"a": 1})
```

普通 `def` 里写 `await` 是语法错误；`async def` 里写 `.result()` 会把事件循环线程卡住
（阻塞等待，期间同一循环上的其它协程都没法跑）。所以这不是风格问题，是必须配对。

| 形式 | 说明 |
| --- | --- |
| `js.Ctrl.fn(*args, kwargs={...})` | 返回 `AxonFuture` |
| `js.Ctrl.fn(...).result(timeout)` | 同步等结果，超时抛异常 |
| `await js.Ctrl.fn(...)` | 异步等结果 |
| `js.Ctrl.prop.get(timeout)` | 读属性 |
| `js.Ctrl.prop = v` | 写属性 |

窗口不存在时 `.result()` 抛 `RuntimeError: web 'X' not found`；JS 侧抛的错会变成 `JSRuntimeError`。

## `AxonCall` —— 模块级函数

`AxonCall` 是四个函数的命名空间，等价于直接 import 它们：

```python
from axon import AxonCall

AxonCall.call("MainView", "DocsJS", "mirror", [{"a": 1}])
AxonCall.setVar("MainView", "DocsJS", "value", 99)
AxonCall.getVar("MainView", "DocsJS", "value")
AxonCall.broadcast("DocsJS", "note", ["hi"])       # 返回 list[Future]，发给所有窗口
```

签名：

```python
call(web_name, controller_id, func, args=(), kwargs=None)
setVar(web_name, controller_id, var_name, value)
getVar(web_name, controller_id, var_name)
broadcast(controller_id, func, args=(), kwargs=None) -> list[Future]
```

## `AxonEvent` —— 事件

```python
from axon import AxonEvent

AxonEvent.add_listener("demo:pong", handler)          # 监听 JS 发来的事件
AxonEvent.add_listener("demo:once", handler, {"once": True})
AxonEvent.remove_listener("demo:pong", handler)
AxonEvent.remove_all_listeners("demo:pong")

AxonEvent.dispatch_event("demo:pong", 1, 2)           # 只在 Python 内部派发
AxonEvent.dispatch_js_event("MainView", "demo:event", ["hello"])   # 发给页面
AxonEvent.dispatch_js_event_batch("demo:event", ["hello"], web_names="*")  # 发给所有窗口
```

监听器在工作线程里执行；异常只打印，不影响其它监听器。

## `AxonStore` —— 跨端键值

```python
from axon import AxonStore

store = AxonStore("docs-store", "MainView")   # 名字要和对端一致
store.set("user", "travis")                    # 写并同步给页面
store.get("user")                              # 读本地缓存
store.prop("theme").set("dark")
store.prop("theme").value
store.release()
```

| 成员 | 说明 |
| --- | --- |
| `AxonStore(id, *web_names, auto_create=True)` | 同名复用；`web_names` 是这个 store 服务的窗口 |
| `get(name)` / `prop(name)` | 读一个键（本地缓存） |
| `set(name, value)` | 写并推给所有关联窗口 |
| `setFromPeer(name, value)` | 接收 JS 写入（框架内部用） |
| `AxonStore.shared` | 进程级共享 store |
| `release()` | 注销 |

## `AxonMagicGUI` —— 回到 Qt 主线程

```python
from PySide6.QtWidgets import QApplication
from axon import AxonMagicGUI

app = QApplication(sys.argv)
AxonMagicGUI()                        # 创建一次

def on_main() -> str:
    return "现在在 Qt 主线程"

result = AxonMagicGUI.run(on_main).result(5)
```

未初始化时调用 `run()` 会抛 `RuntimeError: init AxonMagicGUI first`。

## 错误

| 类 | `code` | 什么时候 |
| --- | --- | --- |
| `AxonTimeoutError` | `TIMEOUT` | 等不到 JS 回包（同时继承内置 `TimeoutError`） |
| `AxonNotConnectedError` | `NOT_CONNECTED` | 目标窗口不存在 / 已经关掉 |
| `AxonChannelLostError` | `CHANNEL_LOST` | 通道中途断开（页面卸载 / 渲染进程崩溃），发出去的调用等不到回包 |
| `JSRuntimeError` | `JS_RUNTIME` | JS 侧抛了异常，被带回来 |
| `AxonError` | `AXON` | 上面四个的基类 |

```python
from axon import Axon, AxonTimeoutError, JSRuntimeError

try:
    Axon("MainView").DocsJS.mirror({"a": 1}).result(5)
except AxonTimeoutError:
    print("JS 没在 5 秒内回")
except JSRuntimeError as exc:
    print("JS 里炸了：", exc)
```

## `AxonCross` —— 跨窗口

```python
from axon import AxonCross

AxonCross.windows()                       # ['main', 'charts']
AxonCross.has("charts")                   # True
AxonCross.call("charts", "Charts", "reload", "600s").result(5)
AxonCross.broadcast("Toasts", "show", "已保存")      # {web: Future}
AxonCross.emit("theme:changed", "dark")             # 所有窗口
AxonCross.emit_to("charts", "theme:changed", "dark")  # 一个窗口
```

| 成员 | 说明 |
| --- | --- |
| `windows()` | 现在开着的窗口名（关窗会自动摘掉） |
| `has(web)` | 这个窗口还在不在 |
| `call(web, controller, func, *args, kwargs=None, timeout=None)` | 调 JS 方法，返回 Future；`timeout` 单位**秒** |
| `broadcast(controller, func, *args, kwargs=None, timeout=None, exclude=())` | 打到所有窗口，返回 `{web: Future}` |
| `results(futures, timeout=None)` | 等一组广播结果，返回 `[{web, ok, value?/error?}]` |
| `emit(type, *args, exclude=())` | 事件发给所有窗口 |
| `emit_to(web, type, *args)` | 事件发给指定窗口 |

## 异常

| 异常 | 何时出现 |
| --- | --- |
| `RuntimeError: web 'X' not found` | 窗口名不存在（还没创建或已销毁） |
| `JSRuntimeError` | JS 侧方法抛了错，消息里带原文 |
| `TimeoutError`（`Future.result`） | 等结果超时 |

## 自检

仓库自带一套真 WebEngine 的断言（37 条，覆盖两条通道、store、事件、语法糖）：

```bash
core-py/.venv/bin/python core-py/tests/run_web_tests.py
```
