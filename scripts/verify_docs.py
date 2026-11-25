"""用真实的 AxonGUI 窗口把文档站里每个可点击示例跑一遍。

不是截图式检查：脚本真的加载构建产物、等前端握手成功、逐个点击 `.try-it__run`，
把页面上渲染出来的消息流（JS → PY / PY → JS / 事件）读回来逐条记录。

    core-py/.venv/bin/python docs/verify_docs.py
    core-py/.venv/bin/python docs/verify_docs.py --page examples/call --headful
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
WEB_NAME = "AxonDocs"

PAGES = [
    "examples/call",
    "examples/property",
    "examples/py-to-js",
    "examples/event",
    "examples/store",
    "examples/magicgui",
    "examples/broadcast",
    # 英文站：同一套组件在 /en/ 下也要能跑（示例 id 与中文页一一对应）
    "en/examples/call",
    "en/examples/event",
]

# 这两个示例本来就该以异常收尾
EXPECT_ERROR = {"timeout", "error"}

def ready_js(page: str) -> str:
    """页面对 + 已握手 + 有示例卡片: 三个条件都满足才算就绪。

    只判断 ``window.__axonDocs`` 是不够的 —— 刚 setUrl 时旧页面还活着，会立刻返回 true，
    随后导航把点击脚本的上下文销毁，脚本就再也不会落地。
    """
    return f"""(() => {{
  const want = {page!r};
  let path = location.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const onPage = path === "/" + want || path === "/" + want + ".html";
  const el = document.querySelector(".try-it");
  const st = window.__axonDocs;
  return onPage && !!el && !!st && st.connected === true;
}})()"""


CLICK_JS = r"""(async () => {
  window.__verify = null;
  const cards = [...document.querySelectorAll('.try-it')];
  const out = [];
  try {
  for (const card of cards) {
    const id = card.dataset.demoId || '?';
    const btn = card.querySelector('.try-it__run');
    if (!btn) { out.push({ id, skipped: 'no-button' }); continue; }
    if (btn.disabled) { out.push({ id, skipped: 'disabled' }); continue; }
    btn.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      await new Promise((r) => setTimeout(r, 100));
      if (!btn.disabled) break;
    }
    await new Promise((r) => setTimeout(r, 250));
    const entries = [...card.querySelectorAll('.entry')].map((e) => ({
      kind: (e.className.match(/entry--(\w+)/) || [, '?'])[1],
      title: ((e.querySelector('.entry__title') || {}).textContent || '').trim(),
      detail: ((e.querySelector('.entry__detail') || {}).textContent || '').trim(),
      result: ((e.querySelector('.entry__json--result') || {}).textContent || '')
        .replace(/\s+/g, ' ').trim().slice(0, 200),
      ms: ((e.querySelector('.entry__ms') || {}).textContent || '').trim(),
    }));
    const summary = ((card.querySelector('.live-demo__summary-out') || {}).textContent || '').trim();
    out.push({ id, entries, summary });
  }
  window.__verify = { done: true, out };
  } catch (e) {
    window.__verify = { done: true, out, error: String((e && e.stack) || e) };
  }
})()"""


sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(ROOT_DIR))
from server import start_server  # noqa: E402


def process_events(seconds: float) -> None:
    from PySide6.QtCore import QCoreApplication, QEventLoop

    deadline = time.time() + seconds
    while time.time() < deadline:
        QCoreApplication.processEvents(QEventLoop.ProcessEventsFlag.AllEvents, 50)
        time.sleep(0.02)


def run_js(view, script: str, timeout: float) -> object:
    box: dict[str, object] = {}

    def _store(value: object) -> None:
        box["v"] = value

    deadline = time.time() + timeout
    while time.time() < deadline:
        box.clear()
        view.page().runJavaScript(script, 0, _store)
        process_events(0.15)
        if box.get("v"):
            return box["v"]
        time.sleep(0.05)
    return box.get("v")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="验证文档站的可交互示例")
    parser.add_argument("--dist", type=Path, default=ROOT_DIR / "web" / ".vitepress" / "dist")
    parser.add_argument("--page", action="append", default=None, help="只验证这一页（可重复）")
    parser.add_argument("--report", type=Path, default=ROOT_DIR / "verify_report.json")
    parser.add_argument("--headful", action="store_true", help="显示窗口（默认 offscreen）")
    args = parser.parse_args(argv)

    dist = args.dist.resolve()
    if not (dist / "index.html").is_file():
        print(f"找不到构建产物: {dist}，先跑 npm run docs:build", file=sys.stderr)
        return 2
    if not args.headful:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    os.environ.setdefault(
        "QTWEBENGINE_CHROMIUM_FLAGS", "--no-sandbox --disable-gpu --disable-dev-shm-usage"
    )
    sys.path.insert(0, str(BASE_DIR))
    sys.path.insert(0, str(ROOT_DIR))

    from PySide6.QtWidgets import QApplication

    import controller  # noqa: F401  注册 DemoController
    from axon import AxonGUI, AxonMagicGUI

    httpd = start_server(dist)
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    app = QApplication(sys.argv[:1])
    AxonMagicGUI()
    view = AxonGUI(WEB_NAME, f"{base}/")
    view.resize(1280, 840)
    if args.headful:
        view.show()

    pages = args.page or PAGES
    report: dict[str, object] = {"base": base, "pages": {}}
    failures: list[str] = []

    for page in pages:
        url = f"{base}/{page}"
        view.setUrl(url)  # type: ignore[attr-defined]
        if not run_js(view, ready_js(page), timeout=40):
            failures.append(f"{page}: 页面没有连上 Python 后端（或没有示例卡片）")
            report["pages"][page] = {"error": "not-connected"}
            continue
        run_js(view, "window.__verify = null; true", timeout=5)
        view.page().runJavaScript(CLICK_JS, 0, lambda _v: None)
        verified = None
        deadline = time.time() + 150
        while time.time() < deadline:
            process_events(0.3)
            # 注意: runJavaScript 的回调把 JS 对象转成 Python 对象并不可靠,
            # 统一走 JSON.stringify, 由 Python 侧 json.loads。
            raw = run_js(view, "JSON.stringify(window.__verify || null)", timeout=3)
            if raw and raw != "null":
                verified = json.loads(raw)
                break
        if not verified:
            failures.append(f"{page}: 示例没有在 150s 内跑完")
            report["pages"][page] = {"error": "timeout"}
            continue

        demos = []
        for demo in verified["out"]:  # type: ignore[index]
            demo_id = demo["id"]
            entries = demo.get("entries") or []
            kinds = [e["kind"] for e in entries]
            problems = []
            if demo.get("skipped"):
                problems.append(f"跳过（{demo['skipped']}）")
            if len(entries) < 2:
                problems.append(f"消息流只有 {len(entries)} 条")
            errors = [e for e in entries if e["kind"] == "error"]
            if errors and demo_id not in EXPECT_ERROR:
                problems.append("出现意外异常: " + (errors[0]["detail"] or errors[0]["title"])[:160])
            if demo_id in EXPECT_ERROR and not errors:
                problems.append("预期失败但成功返回")
            demos.append(
                {
                    "id": demo_id,
                    "ok": not problems,
                    "problems": problems,
                    "steps": kinds,
                    "summary": demo.get("summary", ""),
                    "last": (entries[-1]["detail"] or entries[-1]["title"] or entries[-1]["result"])[:200]
                    if entries
                    else "",
                }
            )
            if problems:
                failures.append(f"{page}#{demo_id}: {'；'.join(problems)}")
        report["pages"][page] = {"demos": demos}

    report["failures"] = failures
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    print("\n=== 文档站可交互示例验证 ===")
    for page, data in report["pages"].items():  # type: ignore[union-attr]
        if "demos" not in data:
            print(f"  ✗ {page}: {data.get('error')}")
            continue
        for demo in data["demos"]:
            mark = "✓" if demo["ok"] else "✗"
            print(f"  {mark} {page}#{demo['id']:<18} {' → '.join(demo['steps'])}")
            if not demo["ok"]:
                for problem in demo["problems"]:
                    print(f"      · {problem}")
            elif demo["summary"]:
                print(f"      {demo['summary']}")
    if failures:
        print(f"\n失败 {len(failures)} 项，详见 {args.report}")
        return 1
    print(f"\n全部通过，详见 {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
