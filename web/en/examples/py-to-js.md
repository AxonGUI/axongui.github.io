# Calling JS from Python

<span class="channel-tag">PY → JS</span>

The other direction is just as simple: register a plain object in the page, then call it from Python with
`Axon("window name").objectName.method(...)`.

## JS side: register an object

```js [docs-js.js]
// docs-js.js
import { AxonController } from "axon-gui";

AxonController.register("DocsJS", {
  value: 7,

  mirror(payload) {                     // a plain method
    return { mirrored: payload, at: Date.now() };
  },

  async sleepEcho(payload, ms = 300) {  // async methods work too
    await new Promise((r) => setTimeout(r, ms));
    return payload;
  },
});
```

`DocsJS` is the name Python will use.

## Python side: collect the result

```python [controller.py]
from axon import Axon

# MainView in Axon("MainView") is the window name; it must match AxonGUI("MainView", ...)
js = Axon("MainView").DocsJS

# call and wait for the result (seconds); on timeout it raises instead of hanging forever
result = js.mirror({"hello": "from python"}).result(5)
print(result)          # {'mirrored': {'hello': 'from python'}, 'at': 1732...}

# async methods are called the same way
js.sleepEcho("hi", 200).result(5)
```

Inside `async def` you can simply `await`:

```python [controller.py]
result = await js.mirror({"hello": "from python"})
```

<LiveDemo id="pyToJs" />

## Reading and writing JS attributes

```python [controller.py]
value = Axon("MainView").DocsJS.value.get(5)     # read
Axon("MainView").DocsJS.value = 99               # write
```

<LiveDemo id="pyToJsProperty" />

## Key points

- **`.result(timeout)` or `await`**: without collecting the result the JS return value is dropped and you
  never see the error either.
- **The window name must match**: `Axon("MainView")` must equal `AxonGUI("MainView", ...)`, otherwise you
  get `web 'MainView' not found`.
- **Errors thrown in JS arrive as `JSRuntimeError`** in Python, so `try/except` works.
- **Python → JS only works while the window is alive**; calling before the page finishes loading fails.
  If you need to wait, use the `loadFinished` event — see [Events](/en/examples/event).
