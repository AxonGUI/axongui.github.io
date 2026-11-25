# Architecture and message flow

One page to explain where a call starts, what it goes through, and where it ends.

## There is exactly one channel

```text [message flow]
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

The left side is a web page (Vue, React, or plain hand-written HTML); the right side is the Python
process. Both live inside the same `AxonGUI` window. The two routes point in opposite directions:
`AxonJSCall` goes from the page to Python, `AxonPYCall` goes from Python to the page. Both ride on the
QWebChannel that ships with Qt WebEngine, and arguments and return values are JSON.

| Channel | Direction | Used for |
| --- | --- | --- |
| `AxonJSCallHandler` | JS → PY | calling methods, reading/writing properties, events, Store writes |
| `AxonPYCall` | PY → JS | calls in the other direction, Python-dispatched events, Store pushes |

Both are **request/response**: every message carries a `call_id`, and the other side replies with that
id. That is why either side can `await`.

## What happens during one JS → Python call

```js [app.js]
await Axon.DemoController.add(2, 3);
```

1. `Axon.DemoController.add(2, 3)` creates a `call_id` and registers the callbacks under it.
2. It sends `{call_id, web_name, controller_id: "DemoController", prop: "add", args: [2, 3]}` through `AxonJSCallHandler`.
3. Python finds the window by `web_name`, then the controller instance by `controller_id`, then the `add` method.
4. The method runs in a worker thread (`async def` goes to the event loop) and returns a value.
5. The result travels back over `AxonPYCall`, tagged with the same `call_id`.
6. JS looks up the callback by `call_id`, resolves the Promise — `await` yields `5`.

Exceptions follow the same path: Python sends the error back, the JS Promise rejects, and `try/catch`
receives Python's error message.

## Thread model

Methods run off the UI thread, so they do not freeze the window — but be careful with shared state.

| How the Python method is written | Where it runs |
| --- | --- |
| `def method(self)` | worker pool (default `CPU count + 4` threads) |
| `async def method(self)` | a dedicated asyncio event loop |
| `fn` passed to `AxonMagicGUI.run(fn)` | the Qt main thread |

When you need to touch Qt widgets (dialogs, window changes, any QWidget), use `AxonMagicGUI` — see
[Magic window](/en/examples/magicgui).

## How properties, events and Store travel

| Usage | Route | Has a return value |
| --- | --- | --- |
| `Axon.Xxx.method(...)` | JS → PY call | yes, via `await` |
| `await Axon.Xxx.prop` | JS → PY property read | yes |
| `Axon.Xxx.prop = v` | JS → PY property write | no reply awaited |
| `AxonEvent.dispatch_js_event(...)` | PY → JS event | no |
| `AxonEvent.dispatchPYEvent(...)` | JS → PY event | no |
| `store.set(...)` | both directions | no |
| `Axon("MainView").Js.fn()` | PY → JS call | yes, `.result()` or `await` |

## Startup order

Right after the page loads the channel does not exist yet, so:

1. Python creates `AxonGUI`, registers the channel objects first, then loads the page.
2. The page runs `await AxonInit()`, QWebChannel connects, and it receives `{connected: true}`.
3. JS tells Python "I am ready"; only then does Python dispatch the `loadFinished` event.
4. From that point the two sides can call each other freely.

That is also why the `loadFinished` event is never lost: it is dispatched after JS checks in. With no
Python backend, `AxonInit()` returns `{connected: false, reason: "no-qt-transport"}` and the page can
degrade into a plain website — see [Dual mode](/en/projects/dual-mode).

## Multiple windows

- One `AxonGUI("name", url)` is one window, and the name is unique inside the process.
- A controller is registered under a window name (`@AxonController("MainView")`) and is only reachable
  from that window; omit the name to expose it to every window.
- `AxonStore` and `AxonEvent` are process-wide and work across windows. To reach every window at once
  use `Axon.broadcast` — see [Broadcast](/en/examples/broadcast).
