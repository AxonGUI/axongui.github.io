"""文档站的后端: 页面里每个可点击示例都落到这里的一个方法上。"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any

from PySide6.QtCore import QThread
from PySide6.QtWidgets import QApplication

from axon import Axon, AxonController, AxonEvent, AxonMagicGUI, AxonStore

WEB = "AxonDocs"


def _store() -> AxonStore:
    """按需取 store: JS 侧 new AxonStore("docs-store") 会反向创建, 这里幂等。"""
    return AxonStore("docs-store", WEB)


@AxonController(WEB)
class DemoController:
    """一个类就能覆盖 call / kwargs / async / 报错 / 属性 / 事件 / 主线程 的演示。"""

    counter: int = 0

    def __init__(self) -> None:
        self.pong_log: list[list[Any]] = []
        self._lock = threading.Lock()
        AxonEvent.add_listener("demo:pong", self._on_pong)

    # ---------- JS → Python: 调用 ----------

    def add(self, a: int, b: int) -> int:
        return a + b

    def with_kwargs(self, a: int, b: int = 0, label: str = "none") -> dict[str, Any]:
        return {"sum": a + b, "label": label, "hint": "b 与 label 是关键字参数"}

    async def delayed(self, msg: str, ms: int = 300) -> str:
        await asyncio.sleep(max(0, min(ms, 10_000)) / 1000)
        return f"async:{msg}（等了 {ms}ms）"

    def slow(self, ms: int = 1500) -> str:
        started = time.time()
        time.sleep(max(0, min(ms, 20_000)) / 1000)
        return f"阻塞了 {int((time.time() - started) * 1000)}ms"

    def fail(self, reason: str = "demo") -> None:
        raise ValueError(f"这是 Python 主动抛出的错误: {reason}")

    # ---------- JS → Python: 属性 ----------

    def get_counter(self) -> int:
        return self.counter

    # ---------- Python → JS ----------

    def call_js_mirror(self, payload: Any) -> Any:
        """调用页面上的 DocsJS.mirror, 把返回值再原样带回 JS。"""
        return Axon(WEB).DocsJS.mirror(payload).result(5)

    def read_js_value(self) -> Any:
        return Axon(WEB).DocsJS.value.get(5)

    def write_js_value(self, value: Any) -> bool:
        Axon(WEB).DocsJS.value = value
        return True

    # ---------- 事件 ----------

    def push_event(self, text: str) -> bool:
        AxonEvent.dispatch_js_event(WEB, "demo:event", [text])
        return True

    def stream(self, count: int = 4) -> dict[str, Any]:
        count = max(1, min(count, 20))
        for i in range(count):
            AxonEvent.dispatch_js_event(
                WEB, "demo:progress", [{"step": i + 1, "total": count}]
            )
            time.sleep(0.15)
        return {"done": count}

    def get_pong(self) -> list[list[Any]]:
        with self._lock:
            return list(self.pong_log)

    def _on_pong(self, *args: Any) -> None:
        with self._lock:
            self.pong_log.append(list(args))

    # ---------- 主线程 / 广播 ----------

    def magic_gui(self) -> bool:
        app = QApplication.instance()

        def on_main() -> bool:
            return QThread.currentThread() is app.thread()

        return bool(AxonMagicGUI.run(on_main).result(5))

    def broadcast(self, text: str) -> list[Any]:
        futures = Axon.broadcast.DocsJS.note(text)
        return [future.result(5) for future in futures]

    # ---------- Store ----------

    def store_read(self, key: str) -> Any:
        return _store().prop(key).get()

    def store_write(self, key: str, value: Any) -> bool:
        _store().prop(key).set(value)
        return True
