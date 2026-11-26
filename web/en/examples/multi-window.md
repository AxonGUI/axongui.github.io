# Cross-window interaction

An Axon app can open several windows (one `AxonGUI` each). Windows can talk to each
other: JS in window A can call JS in window B, or hit every window at once.

::: tip In one sentence
Windows have no direct channel to each other — every cross-window call is routed
through Python, because Python is the only side that knows which windows are alive.
:::

## Two names, easily confused

The most common mistake in cross-window code is mixing up the **window name** and the
**controller name**:

| Name | Where it appears | Example |
| --- | --- | --- |
| Window name | first argument of `AxonGUI("charts", url)` | `"charts"` |
| Controller name | id in `AxonController.register("Series", {...})` | `"Series"` |

```javascript
//                window name ↓   controller name ↓
await AxonCross.web("charts").Series.reload("600s");
```

In this page the windows are `main` and `charts`, and the controllers inside them are
`Shell` (Python) and `Series` (JS) — **window names are lowercase and point at a page,
controller names are capitalised and point at an object inside that page**. They do not
have to match; keeping them different makes the code easier to read.

## Three things you can do

| Goal | JS side | Python side |
| --- | --- | --- |
| List open windows | `AxonCross.windows()` | `AxonCross.windows()` |
| Call a JS method in one window | `AxonCross.web("charts").Series.reload()` | `AxonCross.call("charts", "Series", "reload")` |
| Hit every window | `AxonCross.broadcast({...})` | `AxonCross.broadcast("Toasts", "show", "Saved")` |
| Emit an event to all windows | `AxonCross.emit("theme:changed", "dark")` | `AxonCross.emit("theme:changed", "dark")` |
| Emit an event to one window | `AxonCross.emitTo("charts", "theme:changed", "dark")` | `AxonCross.emit_to("charts", "theme:changed", "dark")` |

## Calling one specific window

Say the `main` window wants the `charts` window to reload its data.

```python [main.py]
from axon import AxonGUI, AxonMagicGUI

app = QApplication([])
AxonMagicGUI()
main = AxonGUI("main", "http://127.0.0.1:5173/")
charts = AxonGUI("charts", "http://127.0.0.1:5173/charts.html")   # [!code highlight]
```

```javascript [charts.html]
// inside the charts window: register a JS controller others can call
import { AxonController } from "axon-gui";

AxonController.register("Series", {
  reload(range = "1d") {
    return loadSeries(range); // returning a Promise is fine
  },
});
```

```javascript [main.html]
// inside the main window: call Series.reload() in the charts window
import { AxonCross } from "axon-gui";

await AxonCross.web("charts").Series.reload("600s");
```

Positional arguments are spread just like `Axon.xxx`; use the packed form
`Series.reload([args], { kwargs }, timeoutMs)` when you need kwargs or a timeout.

The explicit form:

```javascript [main.html]
const value = await AxonCross.call({
  web: "charts",          // window name
  controller: "Series",   // controller name
  func: "reload",
  args: ["600s"],
  timeout: 5000,
});
```

## Hitting every window

For "everyone refresh" use a broadcast. Each window returns its own result and
**one failing window does not affect the others**.

```javascript [main.html]
import { AxonCross, AxonChannels } from "axon-gui";

const results = await AxonCross.broadcast({
  controller: "Toasts",
  func: "show",
  args: ["Settings saved"],
  exclude: [AxonChannels.AxonEnv.web_name], // skip yourself
});

for (const item of results) {
  if (!item.ok) console.warn(item.web, "did not get it:", item.error);
}
```

From Python:

```python [main.py]
from axon import AxonCross

futures = AxonCross.broadcast("Toasts", "show", "Settings saved")

# wait for all of them; a broken window only shows up in its own entry
for item in AxonCross.results(futures, timeout=5):
    if not item["ok"]:
        print(f"{item['web']} failed: {item['error']}")
```

## Events

An event is "notify only, no return value" — lighter than a call. **Write the two
directions separately, never mixed:**

### Direction 1: JS fires → Python listens

Typical case: the user clicks "export" in the `charts` window and Python in the `main`
window should record it.

```javascript [charts.html]
import { AxonEvent } from "axon-gui";

// the JS side only sends
AxonEvent.dispatchPYEvent({ type: "series:exported", args: ["600s", 1280] });   // [!code highlight]
```

```python [controller.py]
from axon import AxonController, AxonEvent

@AxonController("main")
class Shell:
    def __init__(self) -> None:
        # the Python side only receives
        AxonEvent.add_listener("series:exported", self._on_exported)           # [!code highlight]

    def _on_exported(self, range: str, points: int) -> None:
        print(f"exported {range} with {points} points")
```

### Direction 2: Python fires → JS listens

Typical case: the backend finished loading and tells every window about a theme change,
or tells just the `charts` window to refresh.

```python [controller.py]
from axon import AxonCross

AxonCross.emit("theme:changed", "dark")                   # every window's JS gets this
AxonCross.emit_to("charts", "series:reloaded", "600s")    # only the charts window
```

```javascript [charts.html]
import { AxonEvent } from "axon-gui";

// the JS side only receives
AxonEvent.addListener("theme:changed", (theme) => applyTheme(theme));
AxonEvent.addListener("series:reloaded", (range) => loadSeries(range));
```

::: warning How to remember
`AxonCross.emit` / `emitTo` are **Python → JS only**.
The other way (JS → Python) uses `AxonEvent.dispatchPYEvent({ type, args })`.
Do not mix them in one block.
:::

## The window table and lifetime

`AxonCross.windows()` returns the windows that are **currently open**.

Closing a window removes it from the table; calls to a closed window fail fast instead
of hanging forever:

```
RuntimeError: web `charts` not found
```

To open a window from JS, let Python do it:

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

## Timeouts and errors

- JS `timeout` is in **milliseconds** (same as `Axon`); Python `timeout` is in **seconds**
  (same as `.result(5)`).
- An exception in the target window comes back to the caller: a rejected Promise on the
  JS side (with the Python traceback in the message), a failed Future on the Python side.
- In a broadcast, a timeout/error is reported per window (`{web, ok:false, error}`).

::: warning Do not build a loop
A → B → A works fine (no deadlock), but do not write recursion without an exit: every
cross-window call is a real round trip.
:::

## Shared state across windows

If what you need is "both windows see the same data", do not fake it with calls — use
the shared store:

```javascript [main.html]
import { AxonStore } from "axon-gui";

AxonStore.shared.set("theme", "dark"); // every window's shared store updates
```

See [cross-side store](/en/examples/store).

## Try it (it really opens a second window)

These buttons are not an animation: the first one opens a real `charts` window on your screen —
a **dedicated demo page** (`/demo/cross-window.html`), not a page of this manual.
The second one sends a call through Python into that page — **each window shows its own half**.

<CrossInbox />

::: tip Watch both sides
The `charts` window has its own buttons: hit "call main" there and the "calls from other windows"
list on this page gains an entry; hit the second button here and the charts log gains a line.
:::

```js
// 1. open a second window named charts
const windows = await Axon.DemoController.cross_open();
// → ["AxonDocs", "charts"]

// 2. call a JS controller inside it (that page registers Peer and DocsJS)
const reply = await AxonCross.web("charts").Peer.ping("cross-window call from AxonDocs");
// → { web: "charts", echo: "cross-window call from AxonDocs", at: "…" }

// 3. broadcast to every window, collect results per window
await AxonCross.broadcast({ controller: "DocsJS", func: "note", args: ["broadcast"] });

// 4. emit an event (fire-and-forget)
await AxonCross.emit("demo:cross", "event from AxonDocs");
```

<LiveDemo id="crossOpen" />

<LiveDemo id="crossCall" />

<LiveDemo id="crossBroadcast" />

<LiveDemo id="crossEmit" />

<LiveDemo id="crossClose" />

