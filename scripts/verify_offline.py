"""验证「纯文档模式」：用不带 QWebChannel 的 QWebEngineView 打开同一份构建产物。

这就是普通浏览器 / 静态托管看到的形态 —— 页面必须是一份干净的说明书：
没有「运行」按钮、没有任何「需要 Python 后端」之类的提示、状态条也不出现，
但示例代码要照样能读。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(ROOT_DIR))
from server import start_server  # noqa: E402

PROBE_JS = """(() => {
  const bodyText = document.body.innerText;
  const st = window.__axonDocs;
  return JSON.stringify({
    path: location.pathname,
    loaded: !!document.querySelector('.live-demo__flow') || !!document.querySelector('h1'),
    hooked: !!st,
    connected: st ? st.connected : null,
    status: st ? st.status : null,
    tryItCount: document.querySelectorAll('.try-it').length,
    runButtonCount: document.querySelectorAll('.try-it__run').length,
    statusBarCount: document.querySelectorAll('.axon-status').length,
    downloadBar: document.querySelectorAll('.axon-download').length,
    downloadLinks: [...document.querySelectorAll('.axon-download a')].map((a) => a.getAttribute('href')),
    mentionsBackend:
      bodyText.includes('需要 Python 后端') || bodyText.includes('纯文档模式') ||
      /needs a python backend/i.test(bodyText) || /documentation-only/i.test(bodyText),
    codeBlocks: document.querySelectorAll('pre.shiki, div[class*="language-"]').length,
    headings: [...document.querySelectorAll('h1, h2')].map((h) => h.textContent.trim()).slice(0, 6),
  });
})()"""


def process_events(seconds: float) -> None:
    from PySide6.QtCore import QCoreApplication, QEventLoop

    deadline = time.time() + seconds
    while time.time() < deadline:
        QCoreApplication.processEvents(QEventLoop.ProcessEventsFlag.AllEvents, 50)
        time.sleep(0.02)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="验证文档站的纯网页形态")
    parser.add_argument("--dist", type=Path, default=ROOT_DIR / "web" / ".vitepress" / "dist")
    parser.add_argument(
        "--page",
        action="append",
        default=None,
        help="要检查的页面路径，可重复；默认同时检查中文页与英文页",
    )
    args = parser.parse_args(argv)

    dist = args.dist.resolve()
    if not (dist / "index.html").is_file():
        print(f"找不到构建产物: {dist}", file=sys.stderr)
        return 2
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    os.environ.setdefault(
        "QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox --disable-gpu --disable-dev-shm-usage"
    )

    from PySide6.QtCore import QUrl
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWidgets import QApplication

    pages = args.page or ["examples/call", "en/examples/call"]
    httpd = start_server(dist)
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    app = QApplication(sys.argv[:1])
    view = QWebEngineView()  # 关键: 不挂 webChannel, 等价于普通浏览器
    view.resize(1280, 840)

    failures = 0
    for page in pages:
        url = f"{base}/{page}"
        view.setUrl(QUrl(url))
        result: dict[str, object] = {}
        deadline = time.time() + 45
        while time.time() < deadline:
            box: dict[str, object] = {}
            view.page().runJavaScript(PROBE_JS, 0, lambda v: box.setdefault("v", v))
            process_events(0.4)
            raw = box.get("v")
            if raw:
                data = json.loads(raw)  # type: ignore[arg-type]
                expected = f"/{page}"
                if (
                    data.get("hooked")
                    and data.get("codeBlocks")
                    and str(data.get("path", "")).rstrip("/") == expected
                ):
                    result = data
                    break

        if not result:
            print(f"✗ 页面在 45s 内没有加载完成（{url}）")
            failures += 1
            continue
        failures += check_page(page, result)

    failures += check_cross_demo_page(view, base)
    return 0 if failures == 0 else 1


def check_cross_demo_page(view: "QWebEngineView", base: str) -> int:
    """第二个窗口的独立演示页：纯网页打开时应该老实说「没有后端」，并且按钮点不动。"""
    from PySide6.QtCore import QUrl
    js = """JSON.stringify({
      status: (document.getElementById('status') || {}).textContent || '',
      disabled: Array.from(document.querySelectorAll('button')).map((b) => b.disabled),
      title: document.title,
    })"""
    view.setUrl(QUrl(f"{base}/demo/cross-window.html"))
    probe: dict[str, object] = {}
    deadline = time.time() + 30
    while time.time() < deadline:
        box: dict[str, object] = {}
        view.page().runJavaScript(js, 0, lambda v: box.setdefault("v", v))
        process_events(0.4)
        raw = box.get("v")
        if raw and "纯网页模式" in str(raw):
            probe = json.loads(raw)  # type: ignore[arg-type]
            break
    checks = {
        "独立演示页加载出来了": probe.get("title") == "charts · 跨窗口演示",
        "诚实说明没有后端": "纯网页模式" in str(probe.get("status", "")),
        "按钮全部不可点": bool(probe.get("disabled")) and all(probe.get("disabled")),  # type: ignore[union-attr]
    }
    print("=== 纯网页形态验证 · /demo/cross-window.html ===")
    for name, ok in checks.items():
        print(f"  {'✓' if ok else '✗'} {name}")
    return 0 if all(checks.values()) else 1


def check_page(page: str, result: dict[str, object]) -> int:

    checks = {
        "connected 为 false（确实没有后端）": result["connected"] is False,
        "页面上没有「运行」按钮": result["tryItCount"] == 0 and result["runButtonCount"] == 0,
        "没有连接状态条": result["statusBarCount"] == 0,
        "没有出现「需要 Python 后端 / 纯文档模式」字样": result["mentionsBackend"] is False,
        "示例代码照样可读": int(result["codeBlocks"]) >= 3,
        "标题正常渲染": int(len(result["headings"])) >= 2,
        "出现了客户端下载引导（纯网页才显示）": result["downloadBar"] == 1,
        "下载链接指向 latest release": all(
            "/releases/latest/download/" in (h or "") for h in result["downloadLinks"]
        )
        and len(result["downloadLinks"]) == 2,
    }
    print(f"=== 纯网页形态验证 · /{page} ===")
    for name, ok in checks.items():
        print(f"  {'✓' if ok else '✗'} {name}")
    print(f"  connected: {result['connected']}，代码块: {result['codeBlocks']}，标题: {result['headings']}")
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
