# Reading and writing Python attributes

<span class="channel-tag">JS → PY</span>

`Axon.Xxx.name` in JS is not a plain property access — it is a cross-process read. So **reads need
`await`, writes do not wait**.

## Python side: just an attribute

```python [controller.py]
# controller.py
from axon import AxonController

@AxonController("MainView")
class DemoController:
    counter: int = 0          # class or instance attribute, both work

    def get_counter(self) -> int:
        return self.counter
```

## JS side: await the read, assign the write

```js twoslash [app.js]
// @noErrors
import { AxonCall, AxonController, AxonCross, AxonEvent, AxonStore } from "axon-gui";
const WEB = "MainView";
// ---cut---
import { Axon, AxonInit } from "axon-gui";

await AxonInit();

// read: one round trip, so it must be awaited
const before = await Axon.DemoController.counter;   // 0

// write: send and forget, no waiting for Python
Axon.DemoController.counter = 42;

// read again after a moment to confirm Python really changed
const after = await Axon.DemoController.get_counter();   // 42
```

<LiveDemo id="property" />

## Why reading is asynchronous

`Axon.DemoController.counter` gives you a "value will arrive later" object in JS: the framework has to
send the request to Python and wait for the current value.

- `console.log(Axon.DemoController.counter)` shows an object, not the value;
- `await Axon.DemoController.counter` gives you the actual number.

## When a write takes effect

A write returns as soon as it is sent. It reaches Python in the same order as any later calls, so the
usual pattern is:

```js twoslash [app.js]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
Axon.DemoController.counter = 42;
const now = await Axon.DemoController.get_counter();   // always 42
```

If you need proof the write succeeded (say Python might reject it), call an explicit method and treat its
return value as the receipt.

## Hover to see the types

`getVar<T>()` returns `T` directly (reading a property is still a round trip).

```ts twoslash
import { AxonCall } from "axon-gui";

async function bump() {
  const n = await AxonCall.getVar<number>({ controller_id: "DemoController", var_name: "counter" });
  return n + 1;
}
```

## Key points

- **The attribute must exist**: reading a name that Python does not have fails.
- **JSON types only**: numbers, strings, booleans, `None`, arrays, objects.
- **Do not do heavy work in attributes**: `@property` runs on a worker thread; slow logic belongs in a
  method (ideally `async`).
- Attributes are for state; when you need parameters or a structured return, a method is clearer.
