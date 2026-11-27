# Big data: files, images, binary

The channel is for small, structured data you need to act on right away. For **images, PDFs, video, exported files, multi-MB logs**, going through the channel means base64 first (+33% size), then JSON, then a copy on each side. Axon's answer: Python registers the bytes as a URL, the browser fetches it directly — the payload never touches the channel.

| | Through the channel | Through an `axon://` URL |
| --- | --- | --- |
| 1 MB binary | 1.33 MB after base64, copied twice | the original 1 MB, read by Chromium |
| 5 MB image | jank, double memory | renders, streams |
| Video | basically impossible | `<video src>` works (seeking not supported yet) |
| Frontend code | `await` data, convert to blob | hand the URL to `src` / `fetch` |

## Python side

```python [controller/Report.py]
from axon import AxonAsset, AxonController

@AxonController("MainView")
class Report:
    def chart_url(self) -> str:
        png = build_chart_png()                      # your own bytes
        return AxonAsset.from_bytes(png, name="chart.png")  # → axon://asset/<token>/chart.png

    def export_url(self) -> str:
        return AxonAsset.from_file("/tmp/report.pdf")     # file stays on disk

    def drop(self, url: str) -> bool:
        return AxonAsset.release(url)                # optional: free it early
```

| Function | Purpose |
| --- | --- |
| `AxonAsset.from_bytes(data, name="blob", mime=None)` | `bytes` → URL; `mime` is guessed from the name |
| `AxonAsset.from_file(path, name=None)` | local file → URL (**not read into memory**; opened per request) |
| `AxonAsset.release(url)` / `clear()` / `count()` | release / clear all / how many are held |

The URL looks like `axon://asset/<token>/<filename>`: the token selects the content, the filename only drives `Content-Type` and the default download name.

## JS side

Once you have the URL it is plain web code — no Axon API involved:

::: code-group

```js twoslash [Image]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
const url = await Axon.Report.chart_url();
document.querySelector("#chart").src = url;          // <img src="axon://asset/…">
```

```js twoslash [Read bytes]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
const url = await Axon.Report.export_url();
const buf = await (await fetch(url)).arrayBuffer();   // 1 MB in a few ms
console.log(buf.byteLength);
```

```js twoslash [Download]
// @noErrors
import { Axon, AxonCall, AxonController, AxonCross, AxonEvent, AxonInit, AxonStore } from "axon-gui";
await AxonInit();
const WEB = "MainView";
// ---cut---
const url = await Axon.Report.export_url();
const a = document.createElement("a");
a.href = url;
a.download = "report.pdf";
a.click();
```

:::

`<LiveDemo id="asset" />

Python makes 2 MB of bytes, registers them as a URL, and the frontend fetches them: the message stream above shows the URL, the byte count and the time — nothing went through the channel.

## Watch out for

::: info Lifetime is automatic
Nothing to manage by default: assets idle for **10 minutes** are dropped, and once the byte total exceeds
**256 MB** the least-recently-used ones are evicted (`from_file()` assets hold no memory, only a path). To tune:

```python
AxonAsset.configure(ttl=300, budget=64 << 20)   # seconds / bytes; <=0 disables
AxonAsset.release(url)                          # when you really want it gone now
```
:::

::: warning No Range support
Qt's `QWebEngineUrlRequestJob` exposes no request headers, so there is no partial-content response: **video seeking, resumable downloads and progressive playback of large files are not supported**. Use your app's own HTTP server for those.
:::

::: tip When to stay on the channel
Small structured data (one screen of a list, tens of KB of JSON) is simpler through the channel — no lifetime to manage. Use URLs only for "big" or "binary".
:::

## Relation to compression

Strings larger than 256 KB are gzipped automatically across the channel, so big *text* payloads are handled for you; `bytes` go through `axon://`. The two are complementary.
