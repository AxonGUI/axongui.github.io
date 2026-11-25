# 大块数据：文件、图片、二进制

通道适合传「小、结构化、要立刻处理」的数据。反过来，**图片、PDF、视频、导出文件、几 MB 的日志**这类东西，走通道要先 base64（体积 +33%）、再塞进 JSON、两端各复制一遍。Axon 的做法是：Python 把字节登记成一个 URL，浏览器自己去取，数据完全不经过通道。

| | 走通道 | 走 `axon://` URL |
| --- | --- | --- |
| 1 MB 二进制 | base64 后 1.33 MB，两端各一次复制 | 原始 1 MB，Chromium 直接读 |
| 5 MB 图片 | 卡顿、内存翻倍 | 正常显示，可流式 |
| 视频 | 基本不可行 | `<video src>` 可用（拖动进度条暂不支持） |
| 前端写法 | 先 `await` 拿数据再转 blob | 直接把 URL 给 `src` / `fetch` |

## Python 侧

```python [controller/Report.py]
from axon import AxonAsset, AxonController

@AxonController("MainView")
class Report:
    def chart_url(self) -> str:
        png = build_chart_png()                      # 你自己的 bytes
        return AxonAsset.register(png, name="chart.png")   # → axon://asset/<token>/chart.png

    def export_url(self) -> str:
        return AxonAsset.register_file("/tmp/report.pdf")  # 也可以直接登记本地文件

    def drop(self, url: str) -> bool:
        return AxonAsset.release(url)                # 用完释放，不释放也能用到进程结束
```

三个函数：

| 函数 | 说明 |
| --- | --- |
| `AxonAsset.register(data, name="blob", mime=None)` | 登记一段 `bytes`，返回 URL；`mime` 默认按文件名猜 |
| `AxonAsset.register_file(path, name=None)` | 登记本地文件（内容读进内存） |
| `AxonAsset.release(url)` / `clear()` / `count()` | 释放 / 全清 / 查看当前数量 |

URL 形如 `axon://asset/<token>/<文件名>`：token 决定内容，文件名只影响 `Content-Type` 和下载时的默认名。

## JS 侧

拿到 URL 之后就是普通的 Web 写法，不用引任何 Axon 的 API：

::: code-group

```js [图片]
const url = await Axon.Report.chart_url();
document.querySelector("#chart").src = url;          // <img src="axon://asset/…">
```

```js [按字节读]
const url = await Axon.Report.export_url();
const buf = await (await fetch(url)).arrayBuffer();   // 1 MB → 几毫秒
console.log(buf.byteLength);
```

```js [下载]
const url = await Axon.Report.export_url();
const a = document.createElement("a");
a.href = url;
a.download = "report.pdf";     // 文件名以 URL 末尾为准
a.click();
```

:::

`<LiveDemo id="asset" />

Python 生成 2 MB 二进制登记成 URL，前端 `fetch` 回来：上面这条消息流里能看到 URL、字节数和耗时——数据没有经过通道。

## 要注意的

::: warning 内存
`register()` 把字节留在 Python 进程里，直到 `release()` 或进程结束。批量生成图片（比如列表里几百张缩略图）要记得释放，否则内存只涨不落。
:::

::: warning 不支持 Range
Qt 的 `QWebEngineUrlRequestJob` 拿不到请求头，所以服务端做不了分段响应：**视频拖动进度条、断点续传、大文件边下边播目前不支持**。需要这些就用应用自己的 HTTP 服务提供文件。
:::

::: tip 什么时候还是走通道
结构化的小数据（一屏列表、几十 KB 的 JSON）走通道更简单——不用管生命周期。只有「大」或「二进制」才值得用 URL。
:::

## 和压缩的关系

跨端传 **字符串** 时，超过 256 KB 会自动 gzip（见[调用 Python 方法](/examples/call)里的接口说明），所以文本类大 payload 不用你操心；`bytes` 走 `axon://`，两者互补。
