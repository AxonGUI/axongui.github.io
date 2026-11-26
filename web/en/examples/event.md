# Events: both directions

<span class="channel-tag">both directions</span>

Calls return values; events do not. They suit "just tell me something happened": a button was clicked,
progress moved, the window finished loading.

An event name is any string and the payload is a JSON array. The two directions use two different
APIs — **write them separately, never mixed:**

| Direction | Sender | Receiver |
| --- | --- | --- |
| JS → Python | `AxonEvent.dispatchPYEvent({ type, args })` | `AxonEvent.add_listener(type, fn)` |
| Python → JS | `AxonEvent.dispatch_js_event(web, type, args)` | `AxonEvent.addListener(type, fn)` |

Window broadcast (`AxonCross.emit`) is also Python → JS; see
[cross-window interaction](/en/examples/multi-window).

## Direction 1: JS fires → Python listens

```javascript [app.js]
import { AxonEvent } from "axon-gui";

// send only: event name + argument array
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

        # receive only: the name must match exactly what JS sent
        AxonEvent.add_listener("demo:pong", self._on_pong)           // [!code highlight]

    def _on_pong(self, *args) -> None:
        with self._lock:
            self.pong_log.append(list(args))
```

<LiveDemo id="eventJsToPy" />

Listeners run on a worker thread — **do not do slow work inside them**; hand heavy work to a queue
or back to the main thread with `AxonMagicGUI.run`.

## Direction 2: Python fires → JS listens

```python [controller.py]
from axon import AxonEvent

# send only: which window, event name, payload
AxonEvent.dispatch_js_event("MainView", "demo:event", ["hello from python"])   // [!code highlight]
```

```javascript [app.js]
import { AxonEvent } from "axon-gui";

// receive only
function onEvent(text) {
  console.log("Python says:", text);
}
AxonEvent.addListener("demo:event", onEvent);                    // [!code highlight]
```

<LiveDemo id="eventPyToJs" />

### Streaming progress with events

A single call waits until it finishes; if you want the UI to see intermediate state, push events
from the long-running method:

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

## Removing listeners

Keep the function you passed to `addListener`, otherwise you cannot remove it:

```javascript [app.js]
const onProgress = (p) => render(p);
AxonEvent.addListener("demo:progress", onProgress);

// on unmount, or when it is no longer needed
AxonEvent.removeListener("demo:progress", onProgress);
```

On the Python side: `AxonEvent.remove_listener(type, fn)` and `AxonEvent.remove_all_listeners(type)`.

## Built-in Qt events

The window itself emits events too (`loadFinished`, `contextMenu`, `dragEnter`, `dragMove`, `drop`,
`dragLeave`, `hide`, `show`). They work exactly like custom events, and the receiver is always JS:

```javascript [app.js]
AxonEvent.addListener("loadFinished", () => console.log("page loaded"));
```

`loadFinished` fires only after the page's JS has reported in, so it can never arrive before your
listener is registered — see [architecture](/en/guide/architecture#startup-order).

## Hover to see the types

`addListener()` returns an unsubscribe function; the callback receives what `dispatchPYEvent` sent.

```ts twoslash
import { AxonEvent } from "axon-gui";

const off: () => void = AxonEvent.addListener("demo:event", (text: string) => {
  console.log(text.toUpperCase());
});

off();
```

## Takeaways

- **Two directions, two APIs**: `dispatchPYEvent` is JS → Python, `dispatch_js_event` /
  `AxonCross.emit` is Python → JS;
- event names must match exactly on both sides (`demo:pong` ≠ `demo:Pong`);
- payloads must be JSON-representable;
- never do slow work in a listener, and never throw from one (it is only logged, never sent back).
