---
layout: home

hero:
  name: Axon
  text: Python + Web
  tagline: One window, running Python and a web page side by side — both directions can call methods, read and write properties, and send events.
  actions:
    - theme: brand
      text: Quickstart
      link: /en/guide/quickstart
    - theme: alt
      text: See a real call
      link: /en/examples/call

features:
  - title: No new frontend framework to learn
    details: Vue, React, Svelte, or a hand-written HTML page. If it runs in a browser, it runs in an Axon window.
  - title: Both sides read like local calls
    details: "`await Axon.Calc.add(2, 3)` in JS, `Axon(\"MainView\").DocsJS.mirror(x)` in Python — the framework moves the bytes."
  - title: One page, two shapes
    details: The same page is a desktop app inside an Axon window, and a plain static site in a browser. No code changes.
---

## What this project is for

Building a desktop UI in Python has always been awkward: Qt widgets are slow to draw and slow to change, and using web tech means wiring up a communication layer yourself.

Axon splits it as: **Python owns logic and system access, the web page owns the UI**, with a bidirectional channel in between.

- The page needs a computation → `await Axon.Calc.add(2, 3)`; Python's `add` runs and the result comes back to JS.
- Python needs to update the UI → `Axon("MainView").DocsJS.render(data)`; `render` runs in the page.

## One line per direction

**JS calling Python** — define an ordinary method in Python:

```python [controller.py]
from axon import AxonController

@AxonController("MainView")
class Calc:
    def add(self, a: int, b: int) -> int:
        return a + b
```

Call it from JS:

```js [app.js]
import { Axon, AxonInit } from "axon-gui";

await AxonInit();                       // wait for the channel
const sum = await Axon.Calc.add(2, 3);  // 5
```

**Python calling JS** — expose a plain object in the page:

```js [docs-js.js]
import { AxonController } from "axon-gui";

AxonController.register("DocsJS", {
  mirror(payload) {
    return { mirrored: payload, at: Date.now() };
  },
});
```

Call it from Python:

```python [controller.py]
from axon import Axon

result = Axon("MainView").DocsJS.mirror({"hello": "world"}).result(5)
```

## Where to go next

| What you want to do | Read this |
| --- | --- |
| Install and open a first window | [Quickstart](/en/guide/quickstart) |
| Understand how a message travels | [Architecture & message flow](/en/guide/architecture) |
| Use it as a plain web page only | [This docs site](/en/projects/docs-site) |
| Copy a complete example | [Calling Python](/en/examples/call) |

## This documentation is itself an example

This site ships as a desktop client built with Axon ([download](https://github.com/AxonGUI/Axon/releases/latest)). Opened in that client, every example page grows a "Run this example" button that really calls Python and lists what crossed the wire in both directions. Opened in a browser, there are no buttons — just a normal document.

<LiveDemo id="call" />
