# Frameless window & custom title bar

By default Axon uses the native window: the title bar, minimize/maximize/close are all drawn by the operating system.

If you want the VSCode-style "the whole surface is mine" look, you need three things a **web page cannot** do:

1. drop the OS title bar (a frameless window);
2. keep dragging, double-click maximize, edge snapping and border resizing **working** — on Windows that means answering `WM_NCHITTEST`;
3. control the window: minimize / maximize / close / always-on-top / resize, and know when its state changes.

The optional **axon-shell** package provides exactly those three. It ships **no UI at all**: no title bar, no menus, no button styles, not a single line of CSS — how your title bar looks is your own code. It is also unrelated to how the channel works, which is why it lives in its own repository.

Both packages are on PyPI:

```bash
pip install axon-gui      # the framework
pip install axon-shell    # optional: the chrome layer (pulls axon-gui>=5.3.4)
```

If `python -c "import axon, axon_shell"` works, you are done.

## Python side: swap the window class

```python
import sys

from PySide6.QtWidgets import QApplication

from axon import AxonController, AxonMagicGUI
from axon_shell import AxonShellWindow

WEB = "MainView"


@AxonController(WEB, id="App")
class App:
    def hello(self, name: str) -> str:
        return f"hello, {name}"


def main() -> int:
    app = QApplication(sys.argv[:1])
    AxonMagicGUI()                      # the runner AxonShellWindow relies on
    view = AxonShellWindow(WEB, "http://127.0.0.1:5173/", title="My App")
    view.show()
    return app.exec()


raise SystemExit(main())
```

`AxonShellWindow` is an `AxonGUI` subclass: frameless, themed icon, initial size clamped to 94% of the available screen and centred, plus a registered `Axon.Window` controller.

## Page side: write your own title bar

The package's `shell.js` does three things only: report `data-axon-drag` regions to Qt, wire `data-axon-window` buttons, and forward window-state events.

```html
<script src="/vendor/axon.umd.cjs"></script>
<script src="/axon-shell/shell.js"></script>

<header class="my-titlebar" data-axon-drag>
  <span class="brand">My App</span>
  <button data-axon-window="min" title="Minimize">–</button>
  <button data-axon-window="max" title="Maximize">□</button>
  <button data-axon-window="close" title="Close">×</button>
</header>

<script type="module">
  import { AxonInit } from "axon-gui";

  await AxonInit();
  window.AxonShell.init();

  window.AxonShell.window.onState((s) => {
    document.documentElement.dataset.maximized = String(s.maximized);
  });
</script>
```

Serve `shell.js` from the package:

```python
from axon_shell import assets_dir

print(assets_dir())   # .../axon_shell/assets
```

Buttons, inputs and links inside `data-axon-drag` are automatically excluded from the drag region; add `data-axon-no-drag` to exclude anything else.

## The primitives

| Name | What it does |
| --- | --- |
| `AxonShellWindow(...)` | frameless window + `Axon.Window` controller + icon + initial size that fits the screen |
| `Axon.Window` | `minimize` `maximize` `restore` `toggleMaximize` `toggleFullScreen` `close` `setAlwaysOnTop` `setTitle` `setDragRegions` `beginSystemMove` `moveTo` `resizeTo` `moveBy` `frame` `state` `platform` `popupMenu` `closeMenu` |
| `window:closerequest` event | Emitted before closing when `onCloseRequest()` is registered; call `confirmClose()` to proceed |
| `window:state` event | maximized / fullscreen / geometry changed (coalesced at 60 ms) |
| `window:menu` event | a native menu item was chosen: `{requestId, id}` |
| `AxonShell.init()` | wire `data-axon-drag`, `data-axon-window` and the two events above |
| `AxonShell.drag.refresh()` | re-report drag regions after a layout change |
| `AxonShell.menu.native(spec)` | ask Qt for a native menu (`{id,label,shortcut?,kind?:separator/check/radio,checked?,disabled?,items?}`) |

You can skip `shell.js` entirely and call `Axon.Window` directly — it is just a controller:

```js
await Axon.Window.resizeTo(1200, 800);
const frame = await Axon.Window.frame();
```

## Per-platform behaviour

- **Windows**: Python answers `WM_NCHITTEST` — reported regions become `HTCAPTION`, 6 px borders become `HTLEFT/HTRIGHT/HTTOP/...`. Dragging, double-click maximize, snapping and resizing are all OS behaviour.
- **Linux / macOS**: `startSystemMove()` first; otherwise `shell.js` falls back to pointer deltas plus eight invisible resize hot zones.

So you only mark the drag regions; you never write `-webkit-app-region` (Qt does not understand it anyway).

## Minimal example

`examples/basic` in the repository is one draggable bar, three window buttons and three demo buttons.

```bash
cd examples/basic
python main.py             # needs npm install axon-gui first, or set AXON_BUNDLE
python main.py --smoke     # headless self-check
python ../../tests/verify.py
```

Repository: <https://github.com/AxonGUI/AxonShell>
