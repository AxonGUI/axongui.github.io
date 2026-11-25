"""文档站的静态服务（VitePress 用的是 cleanUrls，需要把 /a/b 映射到 a/b.html）。"""

from __future__ import annotations

import functools
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path


def _log(message: str) -> None:
    """写日志: 打包成 windowed exe 时 sys.stderr 是 None, 直接写会抛异常把请求打断。"""
    target = os.environ.get("AXON_DOCS_LOG")
    if target:
        try:
            with open(target, "a", encoding="utf-8") as handle:
                handle.write(message + "\n")
        except OSError:
            pass
    stream = sys.stderr
    if stream is None:
        return
    try:
        stream.write(message + "\n")
        stream.flush()
    except (OSError, ValueError):
        pass


class CleanUrlsHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        resolved = super().translate_path(path)
        if not os.path.exists(resolved) and not resolved.endswith(os.sep):
            candidate = resolved + ".html"
            if os.path.isfile(candidate):
                return candidate
        return resolved

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        _log("[docs] %s" % (fmt % args))

    def handle_one_request(self) -> None:
        # 请求处理里任何异常都不该让连接静默断开(浏览器会显示 ERR_EMPTY_RESPONSE)。
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # noqa: BLE001
            _log("[docs] handler error: %r" % (exc,))
            try:
                self.send_error(500, "internal error")
            except Exception:  # noqa: BLE001
                pass


def start_server(directory: Path | str, port: int = 0, host: str = "127.0.0.1"):
    handler = functools.partial(CleanUrlsHandler, directory=str(directory))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer((host, port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
