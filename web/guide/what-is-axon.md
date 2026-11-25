# 什么是 Axon？

**用 Python 写后端，用 Web 写界面。**

Axon 是一个混合桌面框架：一个 Python 进程负责逻辑，一份网页负责界面，两边可以互相调用——
写起来跟调本地函数差不多：

::: code-group

```js [JS 调 Python]
const total = await Axon.Cart.total("CNY");
```

```python [Python 调 JS]
Axon("MainView").Chart.redraw([1, 2, 3])
```

:::

没有 IPC 协议要手写，没有 JSON 序列化要自己拼，也没有「前端构建产物怎么塞进窗口」这一层胶水。

## 它解决什么问题

- **想用 Python 的库，又不想用 Qt 控件摆界面。** 数据处理、文件、串口、模型、爬虫都在 Python 里；
  界面想用 HTML/CSS 写，而不是 `QGridLayout`。
- **想用 Web 生态，又不想多养一套 Node 运行时。** Python 直接起窗口、直接读本地文件、直接开子进程；
  不需要 Electron 那种「主进程 + 渲染进程 + 打包器」三层结构。
- **要的只是一个窗口，不是浏览器。** 打包后是一个能双击运行的桌面程序，可以设图标、自定义窗口外观、
  放原生菜单，也可以把网页单独部署出去当说明书用（本站就是这样）。

## 它由什么组成

| 包 / 仓库 | 作用 | 装不装 |
| --- | --- | --- |
| [`axon-gui`](https://pypi.org/project/axon-gui/)（Python + npm） | 运行时：窗口、通道、`Axon` 语法糖、事件、Store、跨窗口 | 必须 |
| [`axon-shell`](https://github.com/AxonGUI/AxonShell) | 可选外观层：无边框窗口、拖拽/缩放命中、窗口控制、原生菜单 | 想要自绘标题栏时 |
| [`templates`](https://github.com/AxonGUI/templates) | Vue 3 / React 19 / Angular 20 三套起步模板 | `axon-gui init` 自动取 |

## 一次调用是怎么走的

以 `await Axon.Cart.total("CNY")` 为例：

1. JS 侧 `Axon.Cart.total("CNY")` 发出一个 `call`，带 `call_id`；
2. 经过 Qt 的 `QWebChannel` 到 Python，`AxonJSCallHandler` 按控制器名找到对象、按方法名找到函数；
3. 普通 `def` 进线程池执行；`async def` 进独立的 asyncio 循环；
4. 返回值（或异常）带着同一个 `call_id` 回到 JS，Promise resolve / reject。

细节（线程模型、属性为什么是惰性的、事件与 Store 各走哪条路）在[架构与消息流](/guide/architecture)。

## 和 Electron / Tauri 的区别

| | Axon | Electron | Tauri | pywebview |
| --- | --- | --- | --- | --- |
| 后端语言 | Python（也在跑） | Node | Rust | Python |
| 界面 | 任何网页 | 任何网页 | 任何网页 | 任何网页 |
| 多一套运行时 | 否（Qt WebEngine 已在 PySide6 里） | 要 Node/Chromium | 否（用系统 WebView） | 否 |
| 双向调用 | 内置（Python ↔ JS 互相调） | IPC 自己封 | command / event 自己封 | 单向为主 |
| 打包体积 | 大（≈220 MB，带 Qt） | 大 | 小 | 中 |

选 Axon 的理由通常是「逻辑已经在 Python 里了」；如果你的逻辑是 JS，[Electron](https://www.electronjs.org/)
更直接。

## 什么时候不该用它

- 逻辑全在 JS/TS 里：直接用 Electron 或 Tauri。
- 只需要一个只读网页：不需要框架，静态站点就够了。
- 对安装包体积敏感、且能接受系统 WebView 差异：Tauri 更合适。

## 接下来

想尽快看到一次往返 → [快速开始](/guide/quickstart)；
想先搞懂消息怎么走 → [架构与消息流](/guide/architecture)；
想看真实调用长什么样 → [可交互示例](/examples/call)。
