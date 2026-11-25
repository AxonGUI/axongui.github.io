# 无边框窗口与自绘标题栏

Axon 默认用系统原生窗口：标题栏、最小化/最大化/关闭都是操作系统画的。

如果你想要 VSCode 那种「整块界面都是我的」的外观，需要三件**网页做不到**的事：

1. 去掉系统标题栏（无边框窗口）；
2. 拖动、双击最大化、贴边、四边缩放**仍然有效**——Windows 上必须接管 `WM_NCHITTEST`；
3. 能控制窗口：最小化 / 最大化 / 关闭 / 置顶 / 改尺寸，并且知道窗口状态变化。

这三件事由可选包 **axon-shell** 提供。它**不含任何界面**：没有标题栏、没有菜单、没有按钮样式、没有一行 CSS——标题栏长什么样、菜单怎么排，都是你自己写。它跟通道怎么走也没有关系，所以单独一个仓库。

两个包都在 PyPI 上，各一条：

```bash
pip install axon-gui      # 框架本体
pip install axon-shell    # 可选：外观层（会自动带上 axon-gui>=5.3.4）
```

装完 `python -c "import axon, axon_shell"` 不报错就对了。

## Python 侧：换个窗口类

```python
import sys

from PySide6.QtWidgets import QApplication

from axon import AxonController, AxonMagicGUI
from axon_shell import AxonShellWindow

WEB = "MainView"


@AxonController(WEB, id="App")
class App:
    def hello(self, name: str) -> str:
        return f"你好，{name}"


def main() -> int:
    app = QApplication(sys.argv[:1])
    AxonMagicGUI()                      # AxonShellWindow 内部要用这个执行器
    view = AxonShellWindow(WEB, "http://127.0.0.1:5173/", title="My App")
    view.show()
    return app.exec()


raise SystemExit(main())
```

`AxonShellWindow` 就是 `AxonGUI` 的子类：去系统边框、设图标、初始尺寸按屏幕可用区域收 94% 并居中，另外注册一个 `Axon.Window` 控制器。

## 网页侧：写你自己的标题栏

包里的 `shell.js` 只做三件事：把标了 `data-axon-drag` 的区域上报给 Qt、把 `data-axon-window` 接上窗口按钮、把窗口状态事件转给你。

```html
<script src="/vendor/axon.umd.cjs"></script>
<script src="/axon-shell/shell.js"></script>

<header class="my-titlebar" data-axon-drag>
  <span class="brand">My App</span>
  <button data-axon-window="min" title="最小化">–</button>
  <button data-axon-window="max" title="最大化">□</button>
  <button data-axon-window="close" title="关闭">×</button>
</header>

<script type="module">
  import { AxonInit } from "axon-gui";

  await AxonInit();
  window.AxonShell.init();

  window.AxonShell.window.onState((s) => {
    document.documentElement.dataset.maximized = String(s.maximized);
  });
</script>
```

`shell.js` 从包里取，静态服务挂到 `/axon-shell/` 即可：

```python
from axon_shell import assets_dir

print(assets_dir())   # .../axon_shell/assets
```

`data-axon-drag` 里面的按钮、输入框、链接会自动被排除在拖动区外；要排除别的元素，加 `data-axon-no-drag`。

## 它给的原语

| 名字 | 说明 |
| --- | --- |
| `AxonShellWindow(...)` | 无边框窗口 + `Axon.Window` 控制器 + 图标 + 不超出屏幕的初始尺寸 |
| `Axon.Window` | `minimize` `maximize` `restore` `toggleMaximize` `toggleFullScreen` `close` `setAlwaysOnTop` `setTitle` `setDragRegions` `beginSystemMove` `moveTo` `resizeTo` `moveBy` `frame` `state` `platform` `popupMenu` `closeMenu` |
| `window:state` 事件 | 最大化 / 全屏 / 位置尺寸变化（60ms 合并） |
| `window:menu` 事件 | 原生菜单被选中：`{requestId, id}` |
| `AxonShell.init()` | 接上 `data-axon-drag` / `data-axon-window` 与上面两个事件 |
| `AxonShell.drag.refresh()` | 布局变了以后重新上报拖动区 |
| `AxonShell.menu.native(spec)` | 让 Qt 弹原生菜单（`{id,label,shortcut?,kind?:separator/check/radio,checked?,disabled?,items?}`） |

页面里也可以完全不用 `shell.js`，直接调 `Axon.Window`——它就是普通控制器：

```js
await Axon.Window.resizeTo(1200, 800);
const frame = await Axon.Window.frame();
```

## 各平台怎么动窗口

- **Windows**：Python 接管 `WM_NCHITTEST`——上报的拖动区返回 `HTCAPTION`，边框 6px 返回 `HTLEFT/HTRIGHT/HTTOP/...`。拖动、双击最大化、贴边、四边缩放都是系统行为，没有 JS 手搓的延迟。
- **Linux / macOS**：优先 `startSystemMove()`；不支持时 `shell.js` 用指针增量 + `moveTo/resizeTo` 兜底，八向缩放靠 8 条透明热区。

所以拖动区只要标出来就行，不用写 `-webkit-app-region`（Qt 也不认它）。

## 最小示例

仓库里的 `examples/basic` 就是一个最小应用：一条可拖动的顶栏、三个窗口按钮、三行演示按钮。

```bash
cd examples/basic
python main.py             # 需要先 npm install axon-gui，或设 AXON_BUNDLE
python main.py --smoke     # 无头自检
python ../../tests/verify.py
```

完整仓库：<https://github.com/AxonGUI/AxonShell>
