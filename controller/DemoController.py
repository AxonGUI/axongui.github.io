"""文档站的后端: 页面里每个可点击示例都落到这里的一个方法上。"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import Any

from PySide6.QtCore import QThread
from PySide6.QtWidgets import QApplication

from axon import Axon, AxonAsset, AxonController, AxonCross, AxonEvent, AxonGUI, AxonMagicGUI, AxonStore

WEB = "AxonDocs"


def _cross_demo_url(view: Any) -> str:
    """第二个窗口开独立的演示页（web/public/demo/cross-window.html），不是说明书里的任何一页。"""
    if view is None:
        return "about:blank"
    u = view.url()
    origin = f"{u.scheme()}://{u.host()}:{u.port()}"
    return f"{origin}/demo/cross-window.html"


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

    # ---------- 大块二进制：axon:// URL ----------
    def blob(self, size: int = 2_000_000) -> str:
        """生成一段二进制，返回 axon:// URL（前端 fetch 取字节）。"""
        size = max(1024, min(int(size), 64 * 1024 * 1024))
        data = bytes((i * 31) % 251 for i in range(size))
        return AxonAsset.from_bytes(data, name=f"blob-{size}.bin")

    def image(self) -> str:
        """生成一张 16×16 PNG，返回 URL（<img src> 直接用）。"""
        import struct
        import zlib

        w = h = 16
        raw = b"".join(b"\x00" + bytes((52, 81, 178)) * w for _ in range(h))

        def chunk(tag: bytes, data: bytes) -> bytes:
            body = tag + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        png = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b"")
        )
        return AxonAsset.from_bytes(png, name="demo.png")

    def asset_count(self) -> int:
        return AxonAsset.count()

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


    # ---------- 跨窗口 ----------

    def cross_open(self) -> list[str]:
        """开一个叫 charts 的第二个窗口（同一个页面），返回当前所有窗口名。"""

        def on_main() -> list[str]:
            if "charts" not in AxonGUI.instance_dict:
                view = AxonGUI.instance_dict.get(WEB)
                url = _cross_demo_url(view)
                win = AxonGUI("charts", url)
                win.resize(900, 620)
                # AxonGUI 自己不 show(): 不显示的话页面照样加载、JS 照样能跑,
                # offscreen 下测试全绿、真机上用户却什么都看不到。
                win.show()
                win.raise_()
                win.activateWindow()
                if not win.isVisible():
                    raise RuntimeError("第二个窗口没能显示出来")
            return AxonGUI.windows()

        return AxonMagicGUI.run(on_main).result(10)

    def cross_call(self, text: str = "来自 AxonDocs 的跨窗口调用") -> Any:
        """只调 charts 那个窗口里的 JS 控制器。"""
        return AxonCross.call("charts", "DocsJS", "note", text, timeout=5).result(10)

    def cross_broadcast(self, text: str = "广播：所有窗口都该收到") -> dict[str, Any]:
        """一次广播到所有窗口（含自己），逐窗口收结果。"""
        futures = AxonCross.broadcast("DocsJS", "note", text, timeout=5)
        return {web: future.result(10) for web, future in futures.items()}

    def cross_emit(self, text: str = "事件：来自 AxonDocs") -> list[str]:
        """发一个事件给所有窗口，谁监听谁处理（不等回执）。"""
        AxonCross.emit("demo:cross", text)
        return AxonGUI.windows()

    def cross_close(self) -> list[str]:
        """关掉那个第二个窗口。"""

        def on_main() -> list[str]:
            win = AxonGUI.instance_dict.get("charts")
            if win is not None:
                win.close()
            return AxonGUI.windows()

        return AxonMagicGUI.run(on_main).result(10)

    # ---------- Store ----------

    def store_read(self, key: str) -> Any:
        return _store().prop(key).get()

    def store_write(self, key: str, value: Any) -> bool:
        _store().prop(key).set(value)
        return True
