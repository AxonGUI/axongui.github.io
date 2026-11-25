# Broadcast: one call, every window

<span class="channel-tag">PY → all windows</span>

A process can open several windows (several `AxonGUI`s). `Axon.broadcast` sends one call to the method of
the same name on the object of the same name in **every window that is still alive**, returning one
`Future` per window in a list.

It has nothing to do with the magic window: the magic window is about *which thread* runs the code, the
broadcast is about *who receives it*.

## Python side

```python [controller.py]
from axon import Axon

# DocsJS.note(...) is called in every window; one Future per window
futures = Axon.broadcast.DocsJS.note("hi from python")

for future in futures:          # collect the results if you care, otherwise skip
    future.result(5)
```

## JS side

Nothing special is needed on the JS side — any window that registered a controller with that name (here
`DocsJS`) receives the call:

```js [docs-js.js]
import { AxonController } from "axon-gui";

AxonController.register("DocsJS", {
  note(text) {
    console.log("[broadcast]", text);   // printed once per window
    return text;
  },
});
```

<LiveDemo id="broadcast" />

## Key points

- **No ordering guarantee** and no de-duplication: every window gets the call once.
- **Failures are independent**: an exception in one window only affects that window's `Future`; inspect it
  with `future.exception()`.
- **Closed windows are gone**: the broadcast only reaches live windows; nothing is queued or replayed.
- **Use it for "everyone should know"** notifications (theme change, global state). To reach one specific
  window, call `Axon("that-window").DocsJS.note(...)`.

::: tip Related
To run something on the Qt main thread, use the [magic window](/en/examples/magicgui).
:::
