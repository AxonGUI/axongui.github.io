# Magic window: run code on the Qt thread

<span class="channel-tag">PY → GUI · main thread</span>

Controller methods **do not run on the Qt main thread** — a plain `def` runs on a worker pool and
`async def` runs on the asyncio event loop. So you cannot call `QMessageBox.information(...)` or
`QLabel.setText(...)` straight from a controller: Qt widgets may only be touched on the main thread.

`AxonMagicGUI` solves exactly that: it sends a function back to the main thread and returns the result as
a `Future`. Call it from anywhere — a worker thread, the event loop, a timer.

## Python side

```python [controller.py]
from PySide6.QtCore import QThread
from PySide6.QtWidgets import QApplication, QMessageBox

from axon import AxonController, AxonMagicGUI

@AxonController("MainView")
class DemoController:
    def ask(self) -> bool:
        def on_main() -> bool:
            # we are on the Qt main thread here: any widget is safe to use
            app = QApplication.instance()
            on_main_thread = QThread.currentThread() is app.thread()
            QMessageBox.information(None, "From Python", "this dialog is opened on the main thread")
            return on_main_thread

        # run() returns a Future; .result(5) waits up to 5 seconds
        return AxonMagicGUI.run(on_main).result(5)
```

```js [app.js]
// the JS side calls it as usual and cannot tell the difference
const onMainThread = await Axon.DemoController.ask();
```

<LiveDemo id="magicgui" />

::: warning Initialise it first
After creating `QApplication`, call `AxonMagicGUI()` once — otherwise `run()` raises
`RuntimeError("init AxonMagicGUI first")`:

```python [main.py]
app = QApplication(sys.argv)
AxonMagicGUI()                 # once is enough
view = AxonGUI("MainView", url)
```
:::

## Key points

- **Only use it when a Qt object is involved**: pure computation, file IO or HTTP requests do not need the
  main thread.
- **`run()` queues asynchronously**: the function goes into the main thread's event queue and the result
  comes back through a `Future`; you may ignore the result, but do not expect it to run "immediately".
- **Do not block inside `on_main`**: `time.sleep` or a synchronous request freezes the whole UI — that code
  runs on the main thread.
- **Awaiting it from `async def`**: `await asyncio.wrap_future(AxonMagicGUI.run(on_main))`.

::: tip Related
To send one call to every window, use [broadcast](/en/examples/broadcast).
:::
