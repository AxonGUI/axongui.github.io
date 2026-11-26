# JavaScript API

Importing (with a bundler):

```js
import {
  Axon, AxonInit, isAxonReady, isAxonConnected,
  AxonCall, AxonChannels, initChannels,
  AxonController, AxonEvent, AxonStore,
} from "axon-gui";
```

Without a bundler use the UMD build; the global is `axon`:

```html
<script src="./node_modules/axon-gui/dist/axon.umd.cjs"></script>
<script>const { Axon, AxonInit } = window.axon;</script>
```

## Initialisation

### `AxonInit()`

Signature: `AxonInit(): Promise<IAxonInitResult>`. Connects QWebChannel and initialises the subsystems. **Call it once per page**; repeated calls reuse the
same connection.

```js
const status = await AxonInit();
// { connected, ready, reason?, objects, error? }
```

With no Python backend it does not throw; it returns `{connected: false, ready: false, reason:
"no-qt-transport"}`.

### `isAxonReady()`

Signature: `isAxonReady(): boolean`. Synchronous check for "connected and all three channel objects present". Useful for conditionals after
initialisation.

### `isAxonConnected()`

Signature: `isAxonConnected(): boolean`. Synchronous check for whether the channel is connected.

### `initChannels()`

Signature: `initChannels(): Promise<IAxonChannelStatus>`. Builds the channel only, without initialising the subsystems. Rarely needed directly.

## Convention: always `await`

Every call returns a `Promise`, and the examples always use `await` — it pairs naturally with
`try/catch` and avoids "forgot to return so the caller got undefined":

```js
try {
  const sum = await Axon.DemoController.add(2, 3);
} catch (err) {
  console.error(err);          // Python exceptions and timeouts both land here
}
```

`.then()` is fully equivalent (it is the same `Promise`); use it only where you **must** stay inside a
non-async callback:

```js
// e.g. a third-party callback that does not accept async functions
button.addEventListener("click", () => {
  Axon.DemoController.add(2, 3).then((sum) => console.log(sum));
});
```

One rule: if you can write `await`, write `await`.

## `Axon` — calling Python

`Axon` is a proxy: `Axon.controllerName.methodName` is one call.

```js
// positional arguments
await Axon.Calc.add(2, 3);

// packed form: [args, kwargs, timeoutMs]
await Axon.Calc.with_kwargs([1], { b: 2 });
await Axon.Calc.slow([1500], {}, 300);      // 300ms timeout

// read a property (one round trip, must be awaited)
const n = await Axon.Calc.counter;

// write a property (send and forget)
Axon.Calc.counter = 42;
```

| Form | Meaning |
| --- | --- |
| `Axon.Ctl.fn(...)` | positional arguments become `args`, returns a `Promise` |
| `Axon.Ctl.fn([args], kwargs?, timeoutMs?)` | packed form, when the first argument is an array |
| `await Axon.Ctl.prop` | read a property (`getVar`) |
| `Axon.Ctl.prop = v` | write a property (`setVar`), no waiting |

On timeout the promise rejects with a message like `Timeout Error, py not return in 300ms`. The Python
call itself keeps running.

## `AxonCall` — low-level calls

Use it when you need manual control (the framework uses it internally too).

```js
await AxonCall.call({ controller_id: "Calc", func: "add", args: [2, 3], kwargs: {}, timeout: 3000 });
await AxonCall.setVar({ controller_id: "Calc", var_name: "counter", value: 42 });
const v = await AxonCall.getVar({ controller_id: "Calc", var_name: "counter" });
await AxonCall.crossCall({ web_name: "MainView", controller_id: "Calc", func: "add", args: [1, 2] });
```

`AxonCall.init()` wires up the Python callback receiver; `AxonInit()` has already done that.

## `AxonController` — letting Python call JS

```js
import { AxonController } from "axon-gui";

// 1) register an object directly (recommended, clearest)
AxonController.register("DocsJS", {
  value: 7,
  mirror(payload) { return { mirrored: payload }; },
  async sleepEcho(payload, ms = 300) { /* ... */ },
});

// 2) decorator form; the controller name defaults to the class name
@AxonController()
class DocsJS { ... }
```

| Method | Meaning |
| --- | --- |
| `AxonController.register(id, object)` | register an object |
| `AxonController.unregister(id)` | unregister |
| `AxonController.get(id)` | fetch a registered object, throws when missing |

## `AxonEvent` — events

```js
AxonEvent.addListener("demo:event", handler);
AxonEvent.addListener("loadFinished", handler, { once: true });
AxonEvent.removeListener("demo:event", handler);
AxonEvent.removeAllListeners("demo:event");

// dispatch locally (listeners on this page run)
AxonEvent.dispatchEvent("demo:event", 1, 2);

// send to Python
AxonEvent.dispatchPYEvent({ type: "demo:pong", args: [1, 2, 3] });
```

`on` / `off` are aliases of `addListener` / `removeListener`.

Built-in events (dispatched by the Qt window): `loadFinished`, `contextMenu`, `dragEnter`, `dragMove`,
`drop`, `dragLeave`, `hide`, `show`.

## Errors

Everything thrown across the bridge is an `Error` subclass with a stable `code`, so you never match on message text:

| Class | `code` | When |
| --- | --- | --- |
| `AxonTimeoutError` | `TIMEOUT` | `timeout` expired before Python answered |
| `AxonNotConnectedError` | `NOT_CONNECTED` | a call was made before the channel was up |
| `AxonRemoteError` | `REMOTE` | Python raised; the message is carried over |
| `AxonError` | `AXON` | base class of the three |

```js
try {
  await Axon.Greeter.greet("Axon", { timeout: 300 });
} catch (e) {
  if (e instanceof AxonTimeoutError) console.warn("too slow", e.code);
  else if (e instanceof AxonRemoteError) console.error("Python raised:", e.message);
  else throw e;
}
```

All four are exported from `axon-gui`. Python has the mirror set (`AxonError / AxonTimeoutError /
AxonNotConnectedError / JSRuntimeError` — see [Python API](/en/api/python#errors)); `AxonTimeoutError` also extends the
builtin `TimeoutError`.

## `AxonStore` — cross-process key/value

```js
const store = new AxonStore("docs-store");     // same name, same store

store.set("k", 1);                             // write, and push to Python
store.get("k");                                // read the local cache (sync, already the value)
store.prop("k").set(2);                        // same as store.set("k", 2)
store.get<number>("k");                        // typed read

store.release();                               // unregister this store
```

| Member | Meaning |
| --- | --- |
| `new AxonStore(id)` | same name reuses the instance; notifies Python to create its counterpart |
| `get(name)` | read the **value** (sync, same meaning as Python's `store.get`) |
| `prop(name)` | get the `AxonStoreProperty` object (reading and writing through it) |
| `set(name, value)` | write and synchronise |
| `setFromPeer(name, value)` | apply a peer write (framework internal) |
| `AxonStore.shared` | the global shared store, created by `AxonInit()` |

`AxonStoreProperty` has `get()` / `set(value)` / `setFromPeer(value)` / `.value`.

## Types

```ts
interface IAxonInitResult {
  connected: boolean;
  ready: boolean;
  reason?: "no-qt-transport" | "retry-exhausted";
  objects: string[];
  error?: string;
}

interface IAxonChannelStatus {
  connected: boolean;
  reason?: "no-qt-transport" | "retry-exhausted";
  objects: string[];
  error?: string;
}
```
