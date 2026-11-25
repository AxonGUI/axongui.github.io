# Dual mode: with and without a backend

The same web page is a desktop app when it runs inside an Axon window, and an ordinary website when you
open it in a browser or host it as a static site — **without changing any code**.

::: info This is not a framework switch
"Dual mode" is not a setting — it is an `if` you write on the status returned by `AxonInit()`.
That is why it lives with the example projects and not with the framework capabilities;
[this documentation site](/en/projects/docs-site) uses it exactly this way.
:::

The framework gives you exactly one thing for this: an async init function that tells you whether a
Python backend is present.

## How to write the page

```js [app.js]
import { Axon, AxonInit, isAxonReady } from "axon-gui";

const status = await AxonInit();

if (status.connected) {
  // desktop mode: Python is reachable
  const data = await Axon.Backend.load();
  render(data);
} else {
  // web mode: use sample data, or show documentation only
  render(demoData);
  console.log("no Python backend:", status.reason);
}
```

What `AxonInit()` returns:

| Field | Meaning |
| --- | --- |
| `connected` | whether QWebChannel connected |
| `ready` | connected **and** all three channel objects are present (safe to call) |
| `reason` | why it failed: `"no-qt-transport"` (no Qt channel in the browser), `"retry-exhausted"` (connected but timed out) |
| `objects` | the channel object names actually received, useful for debugging |
| `error` | the exception message on failure |

`isAxonReady()` is the synchronous version, for the case where you already initialised and only want a
quick check.

## Why the explicit check matters

Calling `Axon.Xxx.yyy()` without a channel either throws or waits forever. So **any UI that depends on
the backend belongs behind `connected`**:

```html [index.html]
<button id="run" hidden>Call Python</button>

<script type="module">
  import { Axon, AxonInit } from "axon-gui";

  const status = await AxonInit();
  const button = document.getElementById("run");

  if (status.connected) {
    button.hidden = false;                     // only exists in desktop mode
    button.addEventListener("click", async () => {
      document.getElementById("out").textContent = await Axon.Backend.ping();
    });
  }
</script>
```

In web mode the button simply does not exist — it is not greyed out, there is no "backend required"
notice. It is absent.

## This documentation site does exactly that

([Full write-up here](/en/projects/docs-site).)

The pages you are reading are the same codebase in both modes:

- Open in a browser (or the [GitHub Pages build](https://axongui.github.io/Axon/)): pure documentation.
  The code samples are readable and there is no "backend required" message anywhere.
- Open with the [AxonDocs client](https://github.com/AxonGUI/Axon/releases/latest): every sample gets a
  "Run this example" button. Clicking it really calls Python and lists, step by step, what went over the
  wire in both directions.

## Key points

- **Call `AxonInit()` once** for the whole page; repeated calls reuse the same connection.
- **Check before calling**: do not touch `Axon.*` while `connected` is false.
- **Static-hosting friendly**: with no backend there is no retry loop, no dialog, nothing blocking first paint.
- **One build artifact**: the desktop client and the static site use the same `dist`; you do not build twice.
