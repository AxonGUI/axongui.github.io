# Verification record

This record comes from the automated harness in `core-py/tests/`, not from a hand-written checklist: the
script loads the page in a real `QWebEngineView` over a real `QWebChannel` and exercises both channels,
properties, events, the store and main-thread tasks, writing results to `core-py/tests/last_report.json`.

Reproduce it:

```bash
cd core-py && uv sync                     # first time: Python 3.12 + PySide6
sudo apt-get install -y libxkbfile1        # QtWebEngine runtime dependency
core-py/.venv/bin/python core-py/tests/run_web_tests.py
```

Current result: **49 / 49** assertions pass on Python 3.12 / 3.13 / 3.14 (Linux), together with **18 / 18** multi-window and **20 / 20** crash-recovery / channel-loss checks. macOS (arm64 and x86_64 runners) runs all of them too — see the macOS section at the bottom. (The tables below are the original 37-check snapshot kept for history.)

## JavaScript → Python

| Assertion | Result | Note |
| --- | --- | --- |
| `js2py/call` | ✅ | `await Axon.TestController.add(2, 3)` returns `5` |
| `js2py/call_spread` | ✅ | spread form `add(1, 2)` equals `add([1, 2])` |
| `js2py/call_spread_kwargs` | ✅ | packed form `with_kwargs([1], { b: 2 })` still works |
| `js2py/kwargs` | ✅ | kwargs arrive as the trailing object argument |
| `js2py/async` | ✅ | Python `async def` runs on its own loop, JS can await it |
| `js2py/timeout` | ✅ | rejected with `Timeout Error, py not return in Nms` |
| `js2py/error` | ✅ | Python exception → JS rejection carrying the original `ValueError: ...` |
| `js2py/getVar` | ✅ | `await Axon.TestController.counter` |
| `js2py/setVar` | ✅ | `Axon.TestController.counter = 42`, Python reads 42 |

## Python → JavaScript

| Assertion | Result | Note |
| --- | --- | --- |
| `py2js/call` | ✅ | `Axon(web).JSBridge.echo("hi")` returns a Future |
| `py2js/async_call` | ✅ | a JS `async` method's Promise resolves properly |
| `py2js/getVar` | ✅ | `Axon(web).JSBridge.value.get(1)` |
| `py2js/setVar` | ✅ | `Axon(web).JSBridge.value = 99` |
| `py2js/error` | ✅ | a JS throw surfaces as `JSRuntimeError` |
| `py2js/kwargs` | ✅ | Python kwargs arrive as the trailing object argument |

## Store / Event

| Assertion | Result | Note |
| --- | --- | --- |
| `store/js2py` | ✅ | JS `prop().set()` is visible to Python `prop().get()` |
| `store/js2py_shortcut` | ✅ | `store.set("k4", "via-set")` reaches Python |
| `store/js2py_get` | ✅ | `store.get("k")` returns the value (same name, same meaning on both sides) |
| `store/py2js` | ✅ | Python writes, JS reads |
| `event/py2js` | ✅ | `dispatch_js_event` reaches a JS `AxonEvent` listener |
| `event/js2py` | ✅ | `dispatchPYEvent` reaches a Python listener |
| `event/loadFinished` | ✅ | dispatched exactly once (`count=1`), never lost, never doubled |

## Python-side call sugar

| Assertion | Result | Note |
| --- | --- | --- |
| `py/sugar_no_recursion` | ✅ | `Axon("w1").Ctl` no longer raises `RecursionError` |
| `py/getVar_sync` | ✅ | `prop.get(timeout)` |
| `py/call_sync` | ✅ | `prop.call(...).result()` |
| `py/await_property` | ✅ | `await Axon(w).Ctl.prop` |
| `py/await_call` | ✅ | `await Axon(w).Ctl.func()` |
| `py/web_not_found` | ✅ | missing window → `RuntimeError: web 'x' not found` |
| `py/multi_web_decorator` | ✅ | `@AxonController(["a","b"])` registers both windows |
| `py/magic_gui_main_thread` | ✅ | `AxonMagicGUI.run()` really runs on the Qt main thread |
| `py/store_set` / `py/store_get_set_shortcut` | ✅ | `store.foo = v` and `store.set/get` stay in sync |
| `py/shared_store_web_names` | ✅ | `AxonStore.shared.web_names` readable and a list |
| `py/broadcast` | ✅ | `Axon.broadcast.*` reaches every window |
| `py/store_prop_api` | ✅ | `prop().get()/set()/value` agree |
| `py/store_set_visible_in_js` | ✅ | Python writes `k3='x'`, `bridgeValue=99`; JS sees them |

Both sides now expose the peer-write operation under one name, `setFromPeer` (JS
`AxonStore.setFromPeer(prop, value)`, Python `store.prop("k").setFromPeer(v)`); the old `PYSet` / `JSSet`
pair is gone. Python's `AxonCall` became `SimpleNamespace(call=..., setVar=..., getVar=..., broadcast=...)`,
so each function has exactly one implementation.

## The documentation site verifies itself

Every "Run this example" button in this handbook is clicked by a script, not eyeballed from a screenshot:

```bash
core-py/.venv/bin/python docs/verify_docs.py       # real AxonGUI window, clicks every card
core-py/.venv/bin/python docs/verify_offline.py    # QWebEngineView without a channel, pure-docs mode
```

`verify_docs.py` loads the build output, waits for the frontend handshake, clicks every card on the six
example pages and reads back the message flow rendered on the page. It covers the 7 Chinese example
pages plus 2 English ones (`/en/examples/call`, `/en/examples/event`, reusing the same example ids).
Latest run: **22 / 22** cards pass, each with a conclusion line. Highlights:

| Page | Example | Observed flow | Conclusion |
| --- | --- | --- | --- |
| `examples/call` | `call` | info → js2py → js2py | Python returned 5 |
| `examples/call` | `kwargs` | info → js2py → js2py | `{"hint":"...","label":"hi","sum":3}` |
| `examples/call` | `async` | info → js2py → js2py | `async:hi` (waited 300ms) |
| `examples/call` | `timeout` | info → js2py → error | JS gave up after 300ms, Python kept running |
| `examples/call` | `error` | info → js2py → error | the Python exception came back to JS |
| `examples/property` | `property` | info → js2py ×2 → info → js2py ×2 | 0 → write 42 → read 42 |
| `examples/py-to-js` | `pyToJs` | info → js2py → py2js → js2py | JS received `{hello: "from python"}` |
| `examples/py-to-js` | `pyToJsProperty` | info → js2py ×6 | `DocsJS.value` 7 → write 99 → 99 |
| `examples/event` | `eventPyToJs` | info → js2py → event → js2py | JS received `["hello from python"]` |
| `examples/event` | `eventJsToPy` | info → js2py ×4 | Python received `[[1,2,3]]` |
| `examples/event` | `stream` | info → js2py → event ×4 → js2py | 4 progress events plus `{done: 4}` |
| `examples/store` | `store` | info → js2py ×5 → py2js | JS writes seen by Python and vice versa |
| `examples/magicgui` | `magicgui` | info → js2py → js2py | confirmed to be on the Qt main thread |
| `examples/broadcast` | `broadcast` | info → js2py → py2js → js2py | the window received the broadcast |

The English site uses the same components (`theme/i18n.ts` picks strings from the current path and the
page `lang`), so buttons, the status bar and flow titles are verified in both languages;
`verify_offline.py` checks `/examples/call` and `/en/examples/call` by default.

Pure-docs mode (`verify_offline.py`) checks six things per page: `connected === false`, zero `.try-it` and
`.try-it__run` nodes (the interactive block is not rendered at all), zero `.axon-status` nodes, no
"needs a Python backend" / "documentation-only mode" strings anywhere, readable sample code, rendered
headings.

Both scripts start their own static server (`docs/server.py` handles VitePress clean URLs) and shut it
down afterwards.

## `axon-gui init` end to end

```bash
uv run axon-gui init demo                # template + core-js (with dist) + Python runtime vendored in
cd demo && uv sync
cd web && npm install && npm run build    # vue-tsc and vite both pass
cd ../.. && python main.py
```

One recorded run (offscreen real window, scripted click):

- page loaded: `_page_loaded = True`, frontend handshake `_js_ready = True`
- clicking "call Python" made Python print
  `onCall('js-to-py-arg1', 'js-to-py-arg2', kwargs={'jskwargs': 'jskwargs'})`
  — positional and keyword arguments both survive the template, channel and controller
- the generated `vendor/axon-core/dist` is self-contained (`promise-retry`, `uuid`, `qwebchannel` are
  bundled), so a `file:` reference needs no extra packages on the consumer side

## Windows 10 IoT Enterprise LTSC (real machine)

The same harness also ran inside a Windows guest (Windows 10 IoT Enterprise LTSC build 19044 in
Docker + QEMU/KVM, `C:\axon-test`, Python 3.12.10 + PySide6 6.11.1 win_amd64 wheels, fully offline,
per-user install):

| Item | Value |
| --- | --- |
| OS / build | Microsoft Windows 10 IoT Enterprise LTSC 10.0.19044.0 |
| Python | 3.12.10 (`InstallAllUsers=0`, under `%LOCALAPPDATA%\Programs\Python\Python312`) |
| PySide6 | 6.11.1 (`pip --no-index --find-links` from local wheels) |
| Result | **37 / 37 passed, 0 failed**, harness exit code 0 |
| Raw log | `verify/windows/axon-win-log.txt` |

Windows has no esbuild, so it runs `python run_web_tests.py --no-build` against the committed
`core-py/tests/web/axon.bundle.js`; otherwise the procedure matches Linux.

## Packaged client on a real Windows desktop (1280×800 VM)

The unpacked `AxonDocs/AxonDocs.exe` (v5.3.4, directory layout) was measured on the same guest:

| Check | Measured |
| --- | --- |
| Unzipping the 208 MB archive | 19.9 s (one-off) |
| Double-click → built-in static server reachable | **807 ms** |
| `GET /` | 200, 21,134 bytes |
| Double-click → window appearing (title `Axon 文档 · 可交互示例`) | 831 ms |
| Window size (desktop 1280×800, work area 1280×760) | 1219×753 at (30,23), fully visible and centred |
| Process footprint | 149 MB |
| Rendering + channel | home page complete; status bar "Python backend connected · AxonEnv, AxonJSCallHandler, AxonPYCall" |
| Clicking "Run this example" | 2 flow entries: `JS → PY Axon.DemoController.add(2, 3)` then `JS → PY result back in JS: 5` (12 ms), conclusion "✓ Python returned 5" |
| exe icon | the A mark in both title bar and taskbar |

The "white page + `ERR_EMPTY_RESPONSE`" bug was reproduced and fixed on this machine: in a windowed build
`sys.stderr` is `None`, so the static server's `log_message()` raised on every request and each one was
dropped. See [Pitfalls](/en/notes/pitfalls#white-page-after-packaging-windowed-exe-err-empty-response).

The earlier v5.3.3 single-file build behaved differently on the same machine: noticeably slower cold
start (unpacking 200+ MB every launch) and a hard-coded 1280×840 window that overflowed the screen. Both
were fixed in v5.3.4.

## macOS (5.8.0, both architectures)

macOS had no reading at all until now. `.github/workflows/macos.yml` runs the suites on two native runners:

| Runner | OS | Interface | Multi-window | Crash/loss | Window visibility |
| --- | --- | --- | --- | --- | --- |
| `macos-latest` (arm64) | macOS Tahoe 26.7.2 | 49 / 49 | 18 / 18 | 20 / 20 | 6 / 6 |
| `macos-15-intel` (x86_64) | macOS Sequoia 15.7.9 | 49 / 49 | 18 / 18 | 20 / 20 | 6 / 6 |

Both on Qt 6.11.1 with the `cocoa` platform plugin (not `offscreen`). The visibility check requires
`QWindow.isExposed()` to be true, a real window size, and a screen — so these greens are not
"headless counts as passing".

The window layer (`axon-shell`) ran `main.py --smoke` on the same runners:

```
[smoke] info={'connected': True, 'drag': True, 'regions': 3, 'platform': 'darwin', ...}
[smoke] window={... 'visible': True, 'focused': True, 'resizable': True}
[smoke] PASS
```

The client artifacts now include macOS: `AxonDocs-macos-arm64.tar.gz` (180.6 MB), unsigned —
clear the quarantine flag with `xattr -dr com.apple.quarantine AxonDocs` before opening.

### Runner-name gotcha

`macos-13` (Intel) has been retired by GitHub: putting it in a matrix does not fail, the job just
**queues forever**. The current x86_64 standard image is `macos-15-intel`; arm64 is `macos-latest`.
