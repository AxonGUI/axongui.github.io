# Quickstart

An Axon app has two halves:

- **Python side**: an ordinary Python program that opens a window with `AxonGUI`.
- **Web side**: an ordinary HTML/Vue page displayed in that window.

The two sides call each other through the `Axon` object. Either install path below gets you a
round trip from JS to Python in a few minutes. Take route one if you just want to see something
working (the official template already has the runtimes, build and an example wired up); take
route two if you want to wire it yourself or only need a plain HTML page.

## Prerequisites

| Need | Notes |
| --- | --- |
| Python 3.12+ | check with `python --version` |
| Node.js 20+ | only needed to build the web side (Vue/TypeScript); a plain HTML page does not need it |
| Extra Linux dependency | `sudo apt-get install -y libxkbfile1` (required by Qt WebEngine — without it `import axon` fails immediately) |

## Route 1: generate a project from the official template (recommended)

The template ships Vue 3 + Vite + TypeScript configured, ready for a real UI.

**The first step is still installing `axon-gui`** — the `init` command lives there and must be
callable from any directory (installed globally, or in a standalone CLI environment such as
`uv tool` / `pipx`), not only inside one project's virtualenv:

```bash
# the command itself (pick one)
uv tool install axon-gui        # recommended: isolated env, command available everywhere
pipx install axon-gui           # same idea
pip install --user axon-gui     # if you have neither uv nor pipx

# step two: generate the project (any empty directory works)
axon-gui init myapp
```

::: tip You only install it once
`axon-gui init` vendors both runtimes (including the prebuilt `dist`) into `myapp/vendor/`, so the
generated project no longer needs the `axon-gui` command, nor a clone of this repository.

Want the **frameless window with a self-drawn title bar** (the VSCode-style chrome)? Generate the
shell variant instead — it adds `axon-shell`, swaps `main.py` to `AxonShellWindow`, and ships a
title bar marked with `data-axon-drag` plus the three window buttons. Restyle it freely; no Python
changes needed.

```bash
axon-gui init myapp --shell
```

`--shell` works with all three templates (vue / react / angular) — pick any with `-t`.

Templates live in [AxonGUI/templates](https://github.com/AxonGUI/templates) and evolve independently of the framework; the CLI reads its `main` branch and both repos run their own build + contract tests in CI.

What you get:

```text
myapp/
├── main.py                  # window entry point, local static server already wired
├── pyproject.toml           # depends on axon-gui (pointing at the vendored vendor/axon-py)
├── controller/
│   └── JSCallPY.py          # example controller: receives JS calls and prints the arguments
├── vendor/
│   ├── axon-py/             # Python runtime (travels with the project, no global install)
│   └── axon-core/           # web runtime (prebuilt dist, npm consumes it directly)
└── web/
    └── src/components/JSCallPY.vue   # example component: calls the controller above
```

Then three commands:

```bash
cd myapp
uv sync                                          # Python deps (the vendored vendor/axon-py)
cd web && npm install && npm run build   # build the frontend
cd ../.. && python main.py
```

The runtimes are vendored into the project (`vendor/axon-py`, `vendor/axon-core`), so nothing here
needs a clone of this repository or a source build — `uv sync` installs the copy that ships with
the project.

Click the button in the window: the Python console prints
`-----JSCallPYController-onCall- count 1-----` and the page shows the text Python returned.

While working on the frontend you do not need to rebuild each time — use Vite's HMR:

```bash
cd web && npm run dev       # port 5173
WEB_ENV=dev python main.py          # the window connects to 5173
```

## Route 2: install from PyPI / npm

```bash
pip install axon-gui      # Python side
npm install axon-gui      # web side (a plain HTML page can skip npm, see below)
```

::: tip Versions
`axon-gui` is on [PyPI](https://pypi.org/project/axon-gui/). The npm package is the web runtime and
versions independently: **5.4.0** on PyPI, **1.1.2** on npm.
:::

Once installed, the smallest working project is two files.

### `main.py` — the Python side

```python
import sys
from pathlib import Path

from PySide6.QtWidgets import QApplication

from axon import AxonController, AxonGUI

HERE = Path(__file__).resolve().parent

@AxonController("MainView")            # register for the window named MainView
class Greeter:
    def greet(self, name: str) -> str:  # plain method; the return value goes back to JS
        return f"Hello, {name}!"

def main() -> int:
    app = QApplication(sys.argv)
    view = AxonGUI("MainView", (HERE / "index.html").as_uri())
    view.resize(900, 600)
    view.show()
    return app.exec()

if __name__ == "__main__":
    raise SystemExit(main())
```

Only three lines matter: `@AxonController("MainView")` registers the class for the window,
`AxonGUI("MainView", url)` creates the window, and methods are written as usual.

### `index.html` — the web side

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Hello Axon</title></head>
  <body>
    <h1>Hello Axon</h1>
    <button id="run">Call Python</button>
    <pre id="out"></pre>

    <script src="./node_modules/axon-gui/dist/axon.umd.cjs"></script>
    <script>
      const { Axon, AxonInit } = window.axon;

      // connect once at startup (await; a plain <script> has no top-level await, so wrap it)
      (async () => {
        const status = await AxonInit();
        console.log("connected:", status.connected);
      })();

      document.getElementById("run").addEventListener("click", async () => {
        // this single line calls Greeter.greet on the Python side
        document.getElementById("out").textContent = await Axon.Greeter.greet("Axon");
      });
    </script>
  </body>
</html>
```

Run it:

```bash
python main.py
```

Click "Call Python" and the page shows `Hello, Axon!` — that sentence was computed in Python and
sent back.

::: tip With a bundler (Vite / webpack)
Change the script to `import { Axon, AxonInit } from "axon-gui";` — every other example on this
site uses that form. `window.axon` above exists only so the page works without a build step.
:::

## Next

- [Calling Python](/en/examples/call): arguments, keyword arguments, async, timeouts, exceptions
- [Reading & writing properties](/en/examples/property): how properties sync both ways
- [Calling JS from Python](/en/examples/py-to-js): the opposite direction
- [Events](/en/examples/event): notifications without a return value
- [Architecture & message flow](/en/guide/architecture): what a call actually goes through
