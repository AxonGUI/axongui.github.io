# Python API

```python
from axon import (
    AxonGUI, AxonController, Axon, AxonCall,
    AxonEvent, AxonStore, AxonMagicGUI,
)
```

The distribution name is `axon-gui`; the import name is `axon`.

## `AxonGUI` — the window

```python
from PySide6.QtWidgets import QApplication
from axon import AxonGUI

app = QApplication(sys.argv)
view = AxonGUI("MainView", "http://127.0.0.1:8000/")   # window name + page URL
view.resize(1200, 700)
view.show()
app.exec()
```

| Argument | Meaning |
| --- | --- |
| `web_name` | window name, unique in the process; controllers and `Axon("...")` use it to find the window |
| `url` | page URL, `http://` or `file://` |
| `options` | `{"disable_native_context_menu": True}` turns off the native Qt context menu so the page can draw its own |

| Method / attribute | Meaning |
| --- | --- |
| `get_web(web_name)` | get a created window (class method) |
| `get_web_names()` | all window names |
| `registerChannel(id, obj)` | expose an extra QObject to the page |
| `web_name` | the window name |

Once the page has loaded and the JS channel is ready, the `loadFinished` event is dispatched to the page.

## `AxonController` — letting JS call Python

```python
from axon import AxonController

@AxonController("MainView")            # available in this window only
class Calc:
    def add(self, a: int, b: int) -> int:
        return a + b

@AxonController()                      # available in every window, name = class name
class Common:
    ...
```

Signature: `AxonController(web_name="*", id=None, shared=False)`

| Argument | Meaning |
| --- | --- |
| `web_name` | a string or a list; `"*"` means every window (including windows created later) |
| `id` | controller name, defaults to the class name; JS calls `Axon.<id>.<method>` |
| `shared` | when `True`, all windows share one instance |

Instances are created lazily when the window (or the controller) is set up. Methods come in two flavours:

- `def method(...)` → runs on the worker pool
- `async def method(...)` → runs on the asyncio event loop

## `Axon` — calling JS

```python
from axon import Axon

js = Axon("MainView")              # window name

js.DocsJS.mirror({"hello": "world"}).result(5)   # call and wait for the result (seconds)
js.DocsJS.value.get(5)                            # read a JS property
js.DocsJS.value = 99                              # write a JS property (send and forget)
```

### `.result()` or `await`?

There is exactly one thing to check: **is the function you are in an `async def`?**

```python
@AxonController("MainView")
class Demo:
    def sync_method(self):                    # plain def -> use .result(timeout seconds)
        return Axon("MainView").DocsJS.mirror({"a": 1}).result(5)

    async def async_method(self):             # async def -> use await
        return await Axon("MainView").DocsJS.mirror({"a": 1})
```

`await` inside a plain `def` is a syntax error; `.result()` inside an `async def` blocks the event-loop
thread (other coroutines on the same loop cannot run while it waits). So this is not a style choice, the
pairing is mandatory.

| Form | Meaning |
| --- | --- |
| `js.Ctrl.fn(*args, kwargs={...})` | returns an `AxonFuture` |
| `js.Ctrl.fn(...).result(timeout)` | wait synchronously, raises on timeout |
| `await js.Ctrl.fn(...)` | wait asynchronously |
| `js.Ctrl.prop.get(timeout)` | read a property |
| `js.Ctrl.prop = v` | write a property |

If the window does not exist, `.result()` raises `RuntimeError: web 'X' not found`; errors thrown in JS
arrive as `JSRuntimeError`.

## `AxonCall` — module-level functions

`AxonCall` is a namespace for four functions, equivalent to importing them directly:

```python
from axon import AxonCall

AxonCall.call("MainView", "DocsJS", "mirror", [{"a": 1}])
AxonCall.setVar("MainView", "DocsJS", "value", 99)
AxonCall.getVar("MainView", "DocsJS", "value")
AxonCall.broadcast("DocsJS", "note", ["hi"])       # returns list[Future], one per window
```

Signatures:

```python
call(web_name, controller_id, func, args=(), kwargs=None)
setVar(web_name, controller_id, var_name, value)
getVar(web_name, controller_id, var_name)
broadcast(controller_id, func, args=(), kwargs=None) -> list[Future]
```

## `AxonEvent` — events

```python
from axon import AxonEvent

AxonEvent.add_listener("demo:pong", handler)          # listen to events from JS
AxonEvent.add_listener("demo:once", handler, {"once": True})
AxonEvent.remove_listener("demo:pong", handler)
AxonEvent.remove_all_listeners("demo:pong")

AxonEvent.dispatch_event("demo:pong", 1, 2)           # dispatch inside Python only
AxonEvent.dispatch_js_event("MainView", "demo:event", ["hello"])   # send to the page
AxonEvent.dispatch_js_event_batch("demo:event", ["hello"], web_names="*")  # send to every window
```

Listeners run on a worker thread; an exception is only printed and does not affect the other listeners.

## `AxonStore` — cross-process key/value

```python
from axon import AxonStore

store = AxonStore("docs-store", "MainView")   # the name must match the other side
store.set("user", "travis")                    # write and sync to the page
store.get("user")                              # read the local cache
store.prop("theme").set("dark")
store.prop("theme").value
store.release()
```

| Member | Meaning |
| --- | --- |
| `AxonStore(id, *web_names, auto_create=True)` | same name reuses the store; `web_names` are the windows it serves |
| `get(name)` / `prop(name)` | read a key (local cache) |
| `set(name, value)` | write and push to every associated window |
| `setFromPeer(name, value)` | apply a JS write (framework internal) |
| `AxonStore.shared` | process-wide shared store |
| `release()` | unregister |

## `AxonMagicGUI` — back to the Qt main thread

```python
from PySide6.QtWidgets import QApplication
from axon import AxonMagicGUI

app = QApplication(sys.argv)
AxonMagicGUI()                        # create it once

def on_main() -> str:
    return "now on the Qt main thread"

result = AxonMagicGUI.run(on_main).result(5)
```

Calling `run()` before initialisation raises `RuntimeError: init AxonMagicGUI first`.

## Exceptions

| Exception | When |
| --- | --- |
| `RuntimeError: web 'X' not found` | the window name does not exist (not created yet, or destroyed) |
| `JSRuntimeError` | a JS method threw; the message carries the original error |
| `TimeoutError` (from `Future.result`) | waiting for the result timed out |

## Self-check

The repository ships a real-WebEngine assertion suite (37 cases covering both channels, the store, events
and the call sugar):

```bash
core-py/.venv/bin/python core-py/tests/run_web_tests.py
```
