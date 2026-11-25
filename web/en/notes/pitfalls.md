# Known pitfalls and fixes

This page records what the "written but never run" call sugar turned into once a real dependency exercised
it. Every entry is **symptom → root cause → fix**, so you can match it against older code or a similar
problem.

## JavaScript side

### `await Axon.Ctl.prop` never resolves (old version)

- Symptom: `await Axon.TestController.counter` hangs, the Promise never settles; `.then(cb)` works fine.
- Cause: in `Axon.ts` the object literal member `then: () => {...}` was an **arrow function**, so it ignored
  `then`'s two arguments and the resolve value could never be delivered (`await` relies on exactly that).
- Fix: `then(onFulfilled, onRejected) { return promise.then(onFulfilled, onRejected) }`, same for
  `catch`/`finally`.

### `AxonInit()` throws in a plain browser

- Symptom: with no Qt channel the page goes blank, console shows `TypeError: Cannot read properties of undefined`.
- Cause: `initChannels()` only logged on failure and resolved anyway; the following
  `AxonPYCallHandler.init()` then read `AxonChannels.AxonPYCall` and blew up, so the caller had no way to
  know whether a backend existed.
- Fix: `initChannels()` returns `IAxonChannelStatus` and `AxonInit()` returns
  `{connected, ready, reason, objects, error}`; with no channel it returns `ready: false` instead of
  throwing. The documentation site's two modes switch on that value.

### The second `@AxonController()` reuses the first class name

- Symptom: with two classes using the default id, the second overwrote the first and JS could not reach it.
- Cause: the decorator closure rewrote `id` via `if (id === undefined) id = controller.name`, so on the
  second call `id` was no longer undefined.
- Fix: `const controllerId = id !== undefined ? id : controller.name`.

### Qt event names did not match

- Symptom: `AxonEvent.addListener("dragMove", ...)` / `"dragLeave"` never fired.
- Cause: Python dispatches `"dragMove"` / `"dragLeave"` (`AxonGUI.py`) while the JS typings declared
  `"dragMoveEvent"` / `"dragLeaveEvent"`.
- Fix: use Python's short names; `AxonQtEventMap` was updated to match.

## Python side

### `Axon("w").Ctl` raises `RecursionError`

- Symptom: `ax = Axon("w1"); ax.JSCallPYController` → `maximum recursion depth exceeded`.
- Cause: `JSController.__init__` assigned `self.web_name`, which went through `__setattr__` → `setVar` →
  `__getattr__` → read `self.web_name` → recursion.
- Fix: use `object.__setattr__` inside `__init__`; `__setattr__` only sends `setVar` and stores the Future
  in `_last_future` (the old `.result()` deadlocked on the main thread).

### `await Axon(w).Ctl.prop` raises `TypeError: __await__() returned non-iterator`

- Cause: `__await__` returned `future.result()`, i.e. a **value**, not an iterator.
- Fix: `return asyncio.wrap_future(self._ensure_get()).__await__()`.

### Cannot `await` a callback Future on the Python side

- Symptom: `await Axon(w).JSBridge.echo("hi")` → `TypeError: object Future can't be used in 'await' expression`.
- Cause: `concurrent.futures.Future` does not implement `__await__`.
- Fix: add `AxonFuture(Future)` with `__await__ = asyncio.wrap_future(self).__await__()`; `_call` returns it.

### The decorator registered only the first window

- Symptom: after `@AxonController(["webA", "webB"])` only `webA` could reach the controller.
- Cause: `return cls` sat inside the `for web_name in web_names` loop.
- Fix: return after the loop.

### A new window cannot find the `AxonEvent` controller

- Symptom: after `dispatchPYEvent` no Python listener fired; Python logged
  `RuntimeError: Controller AxonEvent of Web testWeb not found`.
- Cause: `AxonEvent` is an **instance** registered to `"*"`
  (`AxonController.register(AxonEvent, id="AxonEvent")`), but `auto_register` only merged the class
  registry, so instance entries under `"*"` were not inherited by windows created later.
- Fix: add `globalControllers` to `AxonJSCallHandler`; `register(..., "*")` records into it and
  `auto_register(web)` applies global instances before class instances.

### Dispatching `loadFinished` immediately loses the event

- Symptom: the counter is `0` on first load and only works after a refresh.
- Cause: Qt's `loadFinished` fires before the frontend handshake, so JS's `AxonPYCall.onCallSignal` was not
  connected yet and the message went nowhere.
- Fix: report in both directions. After initialisation JS calls `AxonEnv.ready()` (a new `@Slot()`), and
  `AxonGUI` waits for `_page_loaded` + `_js_ready` + `_load_finished_dispatched` before dispatching once via
  `QTimer.singleShot(0, ...)`.

### `AxonStore` ids got doubly wrapped

- Symptom: after `new AxonStore("demo")` the JS map key became `__AxonStore___AxonStore_demo____`.
- Cause: Python passed `self.controller_id` to `createStore`, while JS treats the argument as the store id.
- Fix: pass `self.id`.

### `AxonStore.shared` cannot add windows

- Symptom: `AttributeError: 'dict_keys' object has no attribute 'append'`.
- Cause: `SharedAxonStore.web_names` is a read-only property (it returns `AxonGUI.get_web_names()`), but the
  inherited `add_web` called `append` on it.
- Fix: use `self._web_names` internally; `SharedAxonStore.web_names` returns `list(...)`.

### Python writes to the Store do not reach JS

- Symptom: after `store.foo = 1`, JS `prop("foo").get()` still returns the old value.
- Cause: `AxonStoreProperty.__set__` was dead descriptor code (no class attribute referenced it), and
  `AxonStoreBase.__setattr__` wrote every attribute straight into `__dict__`.
- Fix: `AxonStoreProperty` became a plain object with `_value` + `get()/set()/setFromPeer()/value`, and
  `AxonStoreBase.__setattr__` routes non-reserved names to `self.prop(name).set(value)`.

### `AxonMagicGUI.run()` raises `AttributeError: instance`

- Cause: `instance: "AxonMagicGUI | None"` was only a **type annotation**; no class attribute existed.
- Fix: explicit `instance: AxonMagicGUI | None = None`, and `run()` checks `is None`.

### Page loads before QWebChannel is attached (race)

- Symptom: intermittent `qt init fail`, cured by a refresh.
- Cause: `AxonWebEngineView.__init__` called `self.load(url)` first, then `setWebChannel()` and the seven settings.
- Fix: move `load()` to the end of initialisation.

## Environment

- **`libxkbfile1` is required**, otherwise `import axon` fails with `ImportError` (`AxonEngineView` imports
  `QtWebEngineCore`, which needs the system library).
- **Running the harness headless** needs `QT_QPA_PLATFORM=offscreen` and
  `QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"`.
- **Timers are throttled when the window is invisible**: offscreen, `setTimeout(100)` measured ~400 ms, so
  "timeout" tests must give the server-side sleep at least 3× headroom.

## Pitfalls from building this site's example UI

- **Swapping the button node with `v-if` / `v-else` fools automation**: after expansion the run button
  became a different `<button>`, the old node the script held stayed `disabled = false`, and the script read
  the flow before the example finished, producing an empty conclusion line. Fix: keep one node and only
  change its label and disabled state.
- **`runJavaScript` callbacks cannot carry JS objects**: returning `{a:1}` yields an empty/unusable value in
  PySide6; `JSON.stringify` first and `json.loads` on the Python side.
- **Do not express "no backend" with a disabled button**: disabling still requires the reader to understand
  why, and that sentence is meaningless on a static site. Instead, UI that needs the backend renders only
  when `connected` is true, so in web mode that block simply does not exist.

## A project generated by a packaged `axon-gui init` was incomplete

- Symptom: after `pip install axon-gui`, running `axon-gui init myapp` produced a project with no
  `vendor/axon-core/dist` (and no `vendor/axon-py`); `npm install` failed with
  `TS2307: Cannot find module 'axon-gui'`.
- Cause: `cli.py` only vendored when the package lived inside the repository; the installed-package branch
  copied the template only.
- Fix: merge both branches — outside the repo, download the GitHub archive and vendor `template/` +
  `core-js/` + `core-py/` the same way; commit `core-js/dist` (CI checks it matches `lib/`), and fall back
  to the matching prebuilt npm tarball when the archive has no `dist`.

## White page after packaging as a windowed exe (ERR_EMPTY_RESPONSE)

- Symptom: double-clicking `AxonDocs.exe` opens the window with the right title, but the content area shows
  `This page isn't working / 127.0.0.1 didn't send any data / ERR_EMPTY_RESPONSE`. Development mode
  (`python scripts/main.py`) is fine, and CI's `--smoke` is green.
- Cause: a windowed build (PyInstaller `--windowed`) has no console, so `sys.stderr` is `None`; yet
  `SimpleHTTPRequestHandler` calls `log_message()` for every request, and the old implementation wrote
  directly with `sys.stderr.write(...)`. Every request raised `AttributeError` at the logging step and the
  connection was dropped — the browser sees "the server sent no data". CI's `--smoke` runs in a shell with a
  console, where `stderr` exists, so it passed.
- Reproduce without packaging:
  ```python
  sys.stderr = None            # simulate a windowed exe
  urllib.request.urlopen(url)  # old implementation -> RemoteDisconnected
  ```
- Fix: null-safe logging in `docs/server.py` (plus `AXON_DOCS_LOG=path` to write a file), and
  `handle_one_request()` catches handler exceptions and answers 500 instead of dropping the connection.

## Client window "absurdly large" / "very slow first start"

- Window: the code hard-coded `view.resize(1280, 840)`. A 1280×800 VM or a 1080p laptop at 125–150%
  scaling is smaller than that, so the window overflowed the screen and the title bar was pushed off it.
  Fix: shrink to 94% of `screen.availableGeometry()` and centre it (`scripts/main.py: fit_to_screen`).
- Startup: PyInstaller `--onefile` unpacks 200+ MB into `%TEMP%\_MEIxxxx` on every launch and then waits for
  Defender to scan it, so cold start is inevitably slow. Fix: use the directory layout (`--onedir`, now the
  default) so the exe and dependencies stay in place and start instantly; `--onefile` remains an explicit
  option.
