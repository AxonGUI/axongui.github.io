"""把文档站打包成桌面客户端(AxonDocs)。

产物是一个自带 Python + PySide6 + 文档站构建产物的可执行文件:

- Windows: ``dist/AxonDocs.exe``
- macOS / Linux: ``dist/AxonDocs``

用法::

    cd web && npm ci && npm run docs:build && cd ..
    python docs/build_client.py                 # 依赖: pip install pyinstaller pyside6

可选参数 ``--dist`` 指定 VitePress 构建产物目录, ``--name`` 改产物名。
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Windows 控制台默认 cp1252, 中文 print 会 UnicodeEncodeError; 统一成 utf-8 兜底。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
DEFAULT_DIST = REPO_ROOT / "web" / ".vitepress" / "dist"
ASSETS_DIR = REPO_ROOT / "assets"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="打包 Axon 文档客户端")
    parser.add_argument("--dist", type=Path, default=DEFAULT_DIST, help="VitePress 构建产物目录")
    parser.add_argument("--name", default="AxonDocs", help="可执行文件名")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "build" / "client", help="PyInstaller 工作目录")
    parser.add_argument(
        "--onefile",
        action="store_true",
        help="打成单文件(启动要先把上百 MB 解压到临时目录, 冷启动慢; 默认打目录)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    dist = args.dist.resolve()
    if not (dist / "index.html").is_file():
        print(f"找不到文档站构建产物: {dist}", file=sys.stderr)
        print("先执行: cd web && npm ci && npm run docs:build", file=sys.stderr)
        return 2

    try:
        import PyInstaller.__main__ as pyinstaller  # noqa: PLC0415
    except ImportError:
        print("缺少 pyinstaller: pip install pyinstaller", file=sys.stderr)
        return 2

    out = args.out.resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    # --add-data 的分隔符跟着平台走: Windows 用 ';', 其他平台用 ':'
    sep = os.pathsep
    # 图标: Windows 用 .ico 换掉 exe 的默认图标; 其他平台 PyInstaller 的 --icon 不生效,
    # 窗口图标由 main.py 从打进包里的 icon-256.png 设置。
    png_icon = ASSETS_DIR / "icon-256.png"
    ico_icon = ASSETS_DIR / "axon.ico"
    cmd = [
        "--noconfirm",
        "--clean",
        "--name",
        args.name,
        "--onefile" if args.onefile else "--onedir",
        "--windowed",
        "--distpath",
        str(out / "dist"),
        "--workpath",
        str(out / "work"),
        "--specpath",
        str(out),
        "--paths",
        str(REPO_ROOT),
        "--add-data",
        f"{dist}{sep}web_dist",
        "--add-data",
        f"{png_icon}{sep}.",
        str(SCRIPTS_DIR / "main.py"),
    ]
    if not png_icon.is_file():
        print(f"缺少图标 {png_icon}, 先跑 python tools/make_icons.py", file=sys.stderr)
        return 2
    if os.name == "nt" and ico_icon.is_file():
        # exe 的资源图标只能用 .ico; 窗口图标仍走打进包里的 icon-256.png
        cmd += ["--add-data", f"{ico_icon}{sep}.", "--icon", str(ico_icon)]
    print("[build] pyinstaller " + " ".join(cmd))
    pyinstaller.run(cmd)

    suffix = ".exe" if os.name == "nt" else ""
    if args.onefile:
        produced = out / "dist" / (args.name + suffix)
    else:
        produced = out / "dist" / args.name / (args.name + suffix)
    if produced.is_file():
        print(f"[build] done: {produced} ({produced.stat().st_size / 1024 / 1024:.1f} MB)")
        if not args.onefile:
            print(f"[build] 分发时压整个目录: {produced.parent}")
    else:
        print(f"[build] done: {out / 'dist'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
