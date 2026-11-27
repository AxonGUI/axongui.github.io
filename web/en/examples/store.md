# Store: shared key-value

<span class="channel-tag">both directions</span>

One key/value table shared by both sides. JS writes it and Python can read it; Python changes it and JS
sees the change.

It is meant for state both sides need: the current user, the selected item, settings. **Reads hit a local
cache, only writes send a message**, which is why reading is a synchronous `get()` with no round trip.

## Python side

```python [controller.py]
from axon import AxonStore

WEB = "MainView"

# get a store (same name means the same store; creating it again is idempotent)
store = AxonStore("docs-store", WEB)

store.set("user", "travis")          # write: synchronised to pages holding a store of the same name
print(store.get("user"))             # read: local cache, returns immediately

# the property style works too
store.prop("theme").set("dark")
print(store.prop("theme").value)
```

## JS side

```js twoslash [app.js]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
import { AxonStore } from "axon-gui";

const store = new AxonStore("docs-store");   // the name must match the Python side

store.set("user", "travis");                 // write: synchronised to Python
store.get("user").get();                     // read: local cache

// after Python writes, reading sees its value
const theme = store.get("theme").get();
```

<LiveDemo id="store" />

## Who notifies whom

| Action | What happens |
| --- | --- |
| `store.set("k", v)` | updates the local value, then sends `setFromPeer("k", v)` to the counterpart |
| counterpart write | applies `setFromPeer` locally and **does not echo back** (otherwise the two sides would ping-pong forever) |

So "both sides agree" comes from each side calling `set`, not from automatic two-way sync: whichever side
wrote last wins for that key.

## Key points

- **Names must match**: `AxonStore("docs-store", ...)` and `new AxonStore("docs-store")` are the same
  store; different names mean two independent stores.
- **Reads do not need `await`** (in JS `store.get("k")` is synchronous); use `store.prop("k")` when you need the property object (to write back).
- **Do not use it as a message queue**: it gives no ordering guarantees for notifications — use
  [events](/en/examples/event) for that.
- **Values must be JSON-serialisable**: `dict` / `list` / primitives.
