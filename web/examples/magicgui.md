# 魔法窗口：随时随地调用 Qt UI

<span class="channel-tag">PY → GUI · 主线程</span>

控制器方法**不跑在 Qt 主线程**上 —— 普通 `def` 在线程池里，`async def` 在 asyncio 事件循环里。
所以你不能在控制器里直接 `QMessageBox.information(...)` 或者改 `QLabel.setText(...)`：Qt 控件只能在主线程碰。

`AxonMagicGUI` 解决的就是这件事：把一段函数送回主线程执行，结果用 `Future` 拿回来。
想在哪调就在哪调 —— 线程池里、事件循环里、定时器里都行。

## Python 侧

```python [controller.py]
from PySide6.QtCore import QThread
from PySide6.QtWidgets import QApplication, QMessageBox

from axon import AxonController, AxonMagicGUI

@AxonController("MainView")
class DemoController:
    def ask(self) -> bool:
        def on_main() -> bool:
            # 这里已经在 Qt 主线程：任何 Qt 控件都能安全使用
            app = QApplication.instance()
            on_main_thread = QThread.currentThread() is app.thread()
            QMessageBox.information(None, "来自 Python", "这个弹窗在主线程里弹出")
            return on_main_thread

        # run() 返回 Future；.result(5) 等 5 秒
        return AxonMagicGUI.run(on_main).result(5)
```

```js [app.js]
const onMainThread = await Axon.DemoController.ask();
```

<LiveDemo id="magicgui" />

::: warning 先初始化
建好 `QApplication` 之后要调用一次 `AxonMagicGUI()`，否则 `run()` 抛
`RuntimeError("init AxonMagicGUI first")`：

```python [main.py]
app = QApplication(sys.argv)
AxonMagicGUI()                 # 只需要一次
view = AxonGUI("MainView", url)
```
:::

## 要点

- **只在需要碰 Qt 对象时用**：纯计算、读写文件、发请求不需要绕主线程。
- **`run()` 是异步排队的**：它把函数丢进主线程的事件队列，结果通过 `Future` 拿；
  不关心结果可以不取，但不能指望它"立刻"执行。
- **`on_main` 里别阻塞**：`time.sleep`、同步网络请求会让整个界面卡住 —— 这段跑在主线程上。
- **`async def` 里想 await 它**：`await asyncio.wrap_future(AxonMagicGUI.run(on_main))`。

::: tip 相关
一次要把调用发给所有窗口，用[广播](/examples/broadcast)。
:::
