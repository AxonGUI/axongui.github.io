# What is Axon?

**Python on the backend, web on the frontend.**

Axon is a hybrid desktop framework: a Python process owns the logic, a web page owns the UI, and the two can
call each other — in code it looks like a local function call:

::: code-group

```js [JS → Python]
const total = await Axon.Cart.total("CNY");
```

```python [Python → JS]
Axon("MainView").Chart.redraw([1, 2, 3])
```

:::

No IPC protocol to hand-write, no JSON plumbing, no glue for "how do I put a frontend build inside a window".

## What problem it solves

- **You want Python's libraries, not Qt widgets.** Data, files, serial ports, models live in Python;
  the UI should be HTML/CSS, not `QGridLayout`.
- **You want the web ecosystem without a second runtime.** Python opens the window, reads local files,
  spawns processes. No Electron-style "main + renderer + bundler" stack.
- **You want a window, not a browser.** The result is a double-clickable desktop app with an icon,
  optional custom window chrome and native menus — and the same page can also be deployed as a plain
  documentation site (this site is exactly that).

## What it is made of

| Package / repo | Role | Required |
| --- | --- | --- |
| [`axon-gui`](https://pypi.org/project/axon-gui/) (Python + npm) | Runtime: window, channels, `Axon` sugar, events, Store, cross-window | yes |
| [`axon-shell`](https://github.com/AxonGUI/AxonShell) | Optional chrome: frameless window, drag/resize hit-testing, window controls, native menus | for custom title bars |
| [`templates`](https://github.com/AxonGUI/templates) | Vue 3 / React 19 / Angular 20 starters | fetched by `axon-gui init` |

## How one call travels

For `await Axon.Cart.total("CNY")`:

1. JS sends a `call` with a `call_id`;
2. it crosses Qt's `QWebChannel` into Python, where `AxonJSCallHandler` finds the controller by id and the method by name;
3. plain `def` runs in a thread pool, `async def` runs on a dedicated asyncio loop;
4. the return value (or the exception) comes back with the same `call_id`, resolving or rejecting the Promise.

Details (threading, lazy properties, events, Store) are in [Architecture](/en/guide/architecture).

## How it compares

| | Axon | Electron | Tauri | pywebview |
| --- | --- | --- | --- | --- |
| Backend | Python (running) | Node | Rust | Python |
| Ship another runtime | no (Qt WebEngine comes with PySide6) | yes | no (system WebView) | no |
| Two-way calls | built in | roll your own IPC | commands/events | mostly one-way |
| Bundle size | large (≈220 MB with Qt) | large | small | medium |

Pick Axon when the logic already lives in Python. If your logic is JS, go straight to
[Electron](https://www.electronjs.org/).

## When not to use it

- All logic is JS/TS: Electron or Tauri.
- You only need a read-only page: a static site is enough.
- Bundle size is the hard constraint and system-WebView differences are acceptable: Tauri.

## Next

Fastest round-trip → [Quickstart](/en/guide/quickstart);
how messages travel → [Architecture](/en/guide/architecture);
real calls → [Live examples](/en/examples/call).
