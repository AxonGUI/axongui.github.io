# 双模式：有后端 / 没后端

同一份网页，放进 Axon 窗口就是一个桌面应用；直接用浏览器打开，或者托管成静态网站，就是一个普通网页 —— **不需要改代码**。

::: info 它不是框架开关
「双模式」不是一个配置项，而是用 `AxonInit()` 返回的状态自己写的一个 `if`。
所以它放在示例工程里，而不是框架能力里——[本说明书](/projects/docs-site)就是这么用的。
:::

框架只提供一件事：一个能告诉你「现在有没有 Python 后端」的异步初始化函数。

## 页面里怎么写

```js [app.js]
import { Axon, AxonInit, isAxonReady } from "axon-gui";

const status = await AxonInit();

if (status.connected) {
  // 桌面形态：可以调 Python
  const data = await Axon.Backend.load();
  render(data);
} else {
  // 网页形态：用示例数据，或者干脆只显示文档
  render(demoData);
  console.log("没有 Python 后端:", status.reason);
}
```

`AxonInit()` 返回的对象：

| 字段 | 含义 |
| --- | --- |
| `connected` | QWebChannel 连上了吗 |
| `ready` | 连上并且三个通道对象都在（可以放心调用） |
| `reason` | 没连上时的原因：`"no-qt-transport"`（浏览器里没有 Qt 通道）、`"retry-exhausted"`（连了但超时） |
| `objects` | 实际拿到的通道对象名，排查用 |
| `error` | 失败时的异常信息 |

`isAxonReady()` 是同步版本，给「已经初始化过、只想快速判断」的场景用。

## 为什么要显式判断

通道没连上时调 `Axon.Xxx.yyy()` 会抛错或一直等。所以**所有依赖后端的 UI 都应该挂在 `connected` 后面**：

```html [index.html]
<button id="run" hidden>调用 Python</button>

<script type="module">
  import { Axon, AxonInit } from "axon-gui";

  const status = await AxonInit();
  const button = document.getElementById("run");

  if (status.connected) {
    button.hidden = false;                     // 只在桌面形态出现
    button.addEventListener("click", async () => {
      document.getElementById("out").textContent = await Axon.Backend.ping();
    });
  }
</script>
```

网页形态下这个按钮根本不存在 —— 不是灰掉、不是提示「需要后端」，就是没有。

## 这份文档站自己就是这么做的

你现在看的页面（[完整说明在这里](/projects/docs-site)），就是同一套代码的两种形态：

- 用浏览器打开（或访问 [GitHub Pages 版本](https://axongui.github.io/Axon/)）：纯文档，示例代码照样能读，没有任何「需要后端」的提示。
- 用 [AxonDocs 客户端](https://github.com/AxonGUI/Axon/releases/latest)打开：每段示例下方多一个「运行这段示例」按钮，点了会真的调用 Python，并逐条显示两端传了什么。

## 要点

- **一次 `AxonInit()`**：在整个页面里调一次就够了，重复调用会复用同一个连接。
- **先判断再调用**：`connected` 为假时不要碰 `Axon.*`。
- **静态托管友好**：没有后端时不会有重试循环、不会有弹窗、不会卡住首屏。
- **同一份构建产物**：桌面客户端和静态站用同一份 `dist`，不用打两次包。
