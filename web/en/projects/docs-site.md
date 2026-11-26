# This documentation site: an example project

The site you are reading is a complete Axon project in itself: **one build output that works as a plain static website and, dropped into a window, becomes an interactive desktop app.**

It is closer to a real project than any toy demo — it has a build, a document structure, two languages, and its own Python backend. That is why it opens the example-projects section: if you want to copy a structure, copy this one.

## Four parts

| Part | Location | What it does |
| --- | --- | --- |
| Site content | `web/` | VitePress docs, plain static output after `npm run docs:build` |
| Site theme | `web/.vitepress/theme/` | Detects whether a backend exists, renders demo cards, shows the message flow |
| Python side | `controller/DemoController.py` | The methods the page can call (add, async, timeout, events, store…) |
| Window / packaging | `scripts/main.py`, `scripts/build_client.py` | Puts the same `dist` into an `AxonGUI`, optionally into one executable |

How they relate: `ensureAxon()` in the theme decides "is there a Python backend", `demos.ts` says how each demo runs, `DemoController` is the Python half, and `scripts/main.py` merely wraps the page in a window.

## Three ways to open it

| How | What you see |
| --- | --- |
| Visit the [GitHub Pages version](https://axongui.github.io/en/) | Pure documentation: code, prose and navigation work, with no "backend required" hints at all |
| Download the [AxonDocs client](https://github.com/AxonGUI/axongui.github.io/releases/latest) | Every example gains a "▶ Run this example" button; clicking really calls Python and lists what crossed the bridge |
| Run `python scripts/main.py` locally | Same as the client, just started from your machine |

The first two use **the same** `dist` — there is no second codebase.

## The key piece: detecting the backend

```ts [theme/axon.ts]
import { ref } from "vue";

export const connected = ref(false);
export const statusDetail = ref("");
let booted: Promise<void> | null = null;

/** Runs once per page: when there is no backend it just stays false — no throw, no retry loop */
export function ensureAxon(): Promise<void> {
  if (booted) return booted;
  booted = (async () => {
    const lib = await import("axon-gui");        // dynamic import: on a static host this is just one more js file
    const status = await lib.AxonInit();
    connected.value = status.ready;
    statusDetail.value = status.ready
      ? `channel objects: ${status.objects.join(", ")}`
      : "docs mode: no Python backend detected";
  })();
  return booted;
}
```

When `status.ready` is false **there is nothing else to do**: UI that needs the backend is simply not rendered (not greyed out, no "backend required" note).

## The key piece: demo cards only when connected

```vue [theme/components/LiveDemo.vue]
<template>
  <section v-if="demo && connected" class="try-it" :data-demo-id="id">
    <button class="try-it__run" @click="run">▶ Run this example</button>
    <ol class="live-demo__flow">
      <li v-for="entry in logs" :class="`entry entry--${entry.kind}`">…</li>
    </ol>
  </section>
</template>
```

- `v-if="connected"`: in plain-web mode the block does not exist, so there is no button in the DOM;
- `demos.ts` only knows *how to run* a demo; the code itself lives in the markdown, so readers see exactly what runs;
- one click and `trace()` records "sent / returned / took how long" as a message flow.

## Build your own the same way

1. Create a VitePress site (or any static site) and write documentation as usual;
2. Add `ensureAxon()`: dynamically `import("axon-gui")`, `await AxonInit()`, keep `connected` globally;
3. For anything you want to demo, add a component that renders its button under `v-if="connected"` and calls `Axon.Xxx.yyy()` on click;
4. Write a controller on the Python side (`@AxonController("AxonDocs")`) with the demo methods;
5. To make it a desktop app, run `python scripts/main.py` (or `scripts/build_client.py`) — the web page does not change.

Steps 1–4 work without Axon at all; **only step 5 uses the framework**. That is why "dual mode" belongs to the example projects rather than to the framework capabilities.

## Takeaways

- One `dist` for both the static site and the desktop app — never two codebases;
- Probe the backend once (`ensureAxon()` is idempotent); don't call `AxonInit()` in every component;
- Use `v-if="connected"` instead of "disabled + hint", so a plain-web reader just sees normal documentation.
