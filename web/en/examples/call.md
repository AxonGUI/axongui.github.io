# Calling Python methods

<span class="channel-tag">JS → PY</span>

A single `await Axon.Xxx.method(...)` in the page really calls the Python method with that name, and the
return value travels back to JS.

## Python side: write the method first

A method is just an ordinary method on a class decorated with `@AxonController`. The class name is the
controller name used from JS.

```python [controller.py]
from axon import AxonController

@AxonController("MainView")          # registers for the window MainView
class DemoController:
    def add(self, a: int, b: int) -> int:
        return a + b

    def with_kwargs(self, a: int, b: int = 0, label: str = "none") -> dict:
        return {"sum": a + b, "label": label}

    async def delayed(self, msg: str, ms: int = 300) -> str:
        import asyncio
        await asyncio.sleep(ms / 1000)
        return f"async:{msg}"

    def slow(self, ms: int = 1500) -> str:
        import time
        time.sleep(ms / 1000)
        return f"blocked for {ms}ms"

    def fail(self, reason: str = "demo") -> None:
        raise ValueError(f"raised on purpose in Python: {reason}")
```

Synchronous methods run on a worker pool and `async def` methods run on a dedicated asyncio event loop;
neither blocks the UI.

::: warning Two names that are easy to confuse
- **Window name**: the first argument of `@AxonController("MainView")`. It must match
  `AxonGUI("MainView", ...)` and decides which window can reach this controller. Omit it to make the
  controller available to every window.
- **Controller name**: defaults to the class name (here `DemoController`), which is what
  `Axon.DemoController.xxx` refers to. To rename it, write `@AxonController("MainView", id="calc")` and
  use `Axon.calc.xxx` from JS.
:::

## JS side: three ways to call

The same three methods, depending on whether you need keyword arguments or a timeout:

::: code-group

```js twoslash [positional]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
const sum = await Axon.DemoController.add(2, 3);   // 5
```

```js twoslash [kwargs + timeout]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
// [positional args, keyword args, timeout in ms]
const info = await Axon.DemoController.with_kwargs([1], { b: 2, label: "hi" });
// { sum: 3, label: "hi" }

// a timeout with no kwargs still needs the empty {}
await Axon.DemoController.slow([1500], {}, 300);
```

```js twoslash [async method]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
const text = await Axon.DemoController.delayed("hi", 300);   // "async:hi"
```

:::

The rule: **the first argument is an array *and* more arguments follow** → packed form
(`[args], kwargs?, timeout?`); a lone array is just an ordinary array argument.

The three clickable demos below match the three forms above (they appear when this page is opened in
the Axon client):

<LiveDemo id="call" />

<LiveDemo id="kwargs" />

<LiveDemo id="async" />

## Timeout

The third value is a timeout in milliseconds. When it fires, JS immediately gets `Timeout Error`, but the
**Python call keeps running** — it is not cancelled.

```js twoslash [app.js]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
// Python blocks for 1500ms, we only wait 300ms
try {
  await Axon.DemoController.slow([1500], {}, 300);
} catch (err) {
  console.error(err.message);   // Timeout Error, py not return in 300ms
}
```

<LiveDemo id="timeout" />

## Python raising an exception

A Python exception becomes a rejected promise on the JS side, so `try/catch` receives it.

```js twoslash [app.js]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
try {
  await Axon.DemoController.fail("manual");
} catch (err) {
  console.error(err.message);   // raised on purpose in Python: manual
}
```

<LiveDemo id="error" />

## Hover to see the types

`AxonCall.call<T>()` — `T` decides what `await` gives you; the payload fields are typed too.

```ts twoslash
import { AxonCall } from "axon-gui";

async function addTwo() {
  const sum = await AxonCall.call<number>({ controller_id: "DemoController", func: "add", args: [2, 3] });
  return sum.toFixed(1);
}
```

## Key points

- **Always `await`**: without it you get a Promise, not the return value.
- **The method name is the Python method name**; the controller name is the class name (or the explicit
  `id=` given to the decorator).
- **Arguments travel as JSON**: numbers, strings, lists and dicts are fine; file handles, class
  instances and lambdas are not.
- **Keep synchronous methods short**: they occupy the worker pool (CPU+4 threads); long tasks belong in
  `async def`.
- **A timeout is not a cancellation**: JS gives up, Python keeps working.
