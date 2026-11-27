#!/usr/bin/env python3
"""给文档里的 Python 代码块生成悬停类型信息（纯静态分析，不需要语言服务）。

产物：web/.pyhover.json —— {代码块 sha1: [{"line","start","end","text"}]}
用法：python web/scripts/py_hover.py

思路：
- 代码块里自己定义的东西（类/方法/变量）从块的 AST 里取注解与签名；
- `from axon import X` / `axon.X` 这类外部符号，用真实安装的 axon 包反射出签名
  （文档站 dev 环境已装 axon-gui，签名就是用户看到的那份）；
- 参数、内置类型、无法确定的符号直接跳过，宁缺勿滥。
"""
from __future__ import annotations

import ast
import hashlib
import importlib
import inspect
import json
import pathlib
import re
import sys
import tokenize
import io
import typing

ROOT = pathlib.Path(__file__).resolve().parent.parent      # web/
DOCS = ROOT.parent
OUT = ROOT / ".pyhover.json"
FENCE = re.compile(r"^(`{3,})\s*(python|py)\b([^\n]*)$")

SKIP_NAMES = {
    "self", "cls", "None", "True", "False", "str", "int", "float", "bool", "bytes",
    "list", "dict", "tuple", "set", "object", "type", "print", "len", "range",
}
MODULES = {"axon"}


def fmt_annotation(node) -> str | None:
    try:
        return ast.unparse(node)
    except Exception:
        return None


def fmt_args(args: ast.arguments) -> str:
    parts: list[str] = []
    posonly = getattr(args, "posonlyargs", [])
    for a in [*posonly, *args.args]:
        s = a.arg
        if a.annotation is not None:
            s += ": " + (fmt_annotation(a.annotation) or "?")
        parts.append(s)
    if args.vararg:
        parts.append("*" + args.vararg.arg)
    elif args.kwonlyargs:
        parts.append("*")
    for a in args.kwonlyargs:
        s = a.arg
        if a.annotation is not None:
            s += ": " + (fmt_annotation(a.annotation) or "?")
        parts.append(s)
    if args.kwarg:
        parts.append("**" + args.kwarg.arg)
    # 有默认值的参数补上
    return ", ".join(parts)


def sig_of_func(node: ast.FunctionDef | ast.AsyncFunctionDef, prefix: str = "def") -> str:
    ret = f" -> {fmt_annotation(node.returns)}" if node.returns is not None else ""
    kw = "async def" if isinstance(node, ast.AsyncFunctionDef) else prefix
    return f"{kw} {node.name}({fmt_args(node.args)}){ret}"


def sig_of_class(node: ast.ClassDef) -> str:
    bases = ", ".join(ast.unparse(b) for b in node.bases) if node.bases else ""
    return f"class {node.name}" + (f"({bases})" if bases else "")


def ann_text(ann) -> str:
    if isinstance(ann, type):
        return ann.__name__
    return str(ann).replace("typing.", "").replace("<class '", "").replace("'>", "")


def describe(name: str, obj) -> str:
    """给「从 axon 里 import 出来的东西」写一句悬停文本。"""
    if inspect.ismodule(obj):
        return f"module {obj.__name__}"
    if inspect.isclass(obj):
        try:
            params = [
                f"{p}" for p in list(inspect.signature(obj).parameters.values())
                if p.name not in ("self", "cls")
            ]
        except Exception:
            params = []
        return f"class {name}" + (f"({', '.join(params)})" if params else "")
    sig = real_signature(obj)
    if sig:
        return sig
    if callable(obj):
        return f"{name}(...)"
    return f"{name}: {type(obj).__name__}"


def real_signature(obj) -> str | None:
    try:
        hints: dict[str, object] = {}
        try:
            hints = typing.get_type_hints(obj)
        except Exception:
            hints = {}
        if inspect.isclass(obj):
            doc = (inspect.getdoc(obj) or "").strip().split("\n")[0]
            head = f"class {obj.__name__}"
            return head + (f"\n{doc}" if doc else "")
        sig = inspect.signature(obj)
        params = []
        for name, p in sig.parameters.items():
            if name in ("self", "cls"):
                continue
            ann = hints.get(name)
            text = name
            if ann is not None:
                text += ": " + ann_text(ann)
            if p.default is not inspect._empty:
                text += " = " + repr(p.default)
            params.append(text)
        ret = ""
        if "return" in hints:
            ret = " -> " + ann_text(hints["return"])
        elif sig.return_annotation is not inspect.Signature.empty and isinstance(sig.return_annotation, type):
            ret = " -> " + sig.return_annotation.__name__
        return f"{obj.__name__}({', '.join(params)}){ret}"
    except Exception:
        return None


class BlockIndex:
    """一个 Python 块里「名字 → 悬停文本」的映射。"""

    def __init__(self, code: str):
        self.code = code
        self.text: dict[str, str] = {}
        self.attrs: dict[tuple[str, str], str] = {}
        self.modules: dict[str, object] = {}
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return
        self._walk(tree)

    def _module(self, name: str):
        try:
            return importlib.import_module(name)
        except Exception:
            return None

    def _resolve_module_symbol(self, name: str) -> str | None:
        for mod_name in MODULES:
            mod = self._module(mod_name)
            if mod is None:
                return None
            obj = getattr(mod, name, None)
            if obj is None:
                continue
            return describe(name, obj)
        return None

    def _resolve_attr(self, base: str, attr: str) -> str | None:
        mod = self.modules.get(base)
        if mod is None:
            return None
        obj = getattr(mod, attr, None)
        if obj is None:
            return None
        sig = real_signature(obj)
        return sig

    def _walk(self, tree: ast.AST) -> None:
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                self.text[node.name] = sig_of_class(node)
                for sub in node.body:
                    if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        self.attrs[(node.name, sub.name)] = sig_of_func(sub)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self.text[node.name] = sig_of_func(node)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                src = node.module or ""
                for alias in node.names:
                    real = alias.asname or alias.name
                    # 从我们自己的包里 import 出来的子模块（axon.AxonAsset）单独记
                    sub = self._module(f"{src}.{alias.name}") if src else None
                    if inspect.ismodule(sub):
                        self.modules[real] = sub
                        self.text[real] = f"module {sub.__name__}"
                        continue
                    sig = self._resolve_module_symbol(alias.name)
                    if sig:
                        self.text[real] = f"from {src}: {sig}"
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in MODULES:
                        real = alias.asname or alias.name
                        mod = self._module(alias.name)
                        if mod is not None:
                            self.modules[real] = mod
                        self.text[real] = f"module {alias.name}"
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                ann = fmt_annotation(node.annotation)
                if ann:
                    self.text[node.target.id] = f"{node.target.id}: {ann}"
            elif isinstance(node, ast.Assign):
                for t in node.targets:
                    if isinstance(t, ast.Name) and t.id not in self.text:
                        self.text[t.id] = t.id
        # 属性访问：AxonAsset.from_bytes（AxonAsset 是从 axon 里 import 出来的子模块）
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                base = node.value.id
                if base not in self.modules:
                    continue
                sig = self._resolve_attr(base, node.attr)
                if sig:
                    self.attrs[(base, node.attr)] = sig


def name_tokens(code: str):
    """[(line, start, end, name, prev_prev, prev)]，行号从 0 开始。"""
    out = []
    recent: list[tuple[int, str]] = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(code).readline):
            if tok.type in (tokenize.NL, tokenize.NEWLINE, tokenize.COMMENT, tokenize.INDENT, tokenize.DEDENT):
                continue
            if tok.type == tokenize.NAME:
                prev2 = recent[-2] if len(recent) >= 2 else (0, "")
                prev = recent[-1] if recent else (0, "")
                out.append((tok.start[0] - 1, tok.start[1], tok.end[1], tok.string, prev2, prev))
            recent.append((tok.type, tok.string))
    except Exception:
        pass
    return out


def hovers_for(code: str) -> list[dict]:
    idx = BlockIndex(code)
    if not idx.text:
        return []
    out = []
    for line, start, end, name, prev2, prev in name_tokens(code):
        if name in SKIP_NAMES:
            continue
        text = None
        if prev[1] == "." and prev[0] == tokenize.OP and prev2[0] == tokenize.NAME:
            text = idx.attrs.get((prev2[1], name))
        if text is None:
            text = idx.text.get(name)
        if not text or text == name:
            continue
        out.append({"line": line, "start": start, "end": end, "text": text[:240]})
    return out


def blocks(md: pathlib.Path):
    lines = md.read_text(encoding="utf-8").split("\n")
    i = 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if not m:
            i += 1
            continue
        fence, body = m.group(1), []
        j = i + 1
        while j < len(lines) and not lines[j].startswith(fence):
            body.append(lines[j]); j += 1
        yield "\n".join(body)
        i = j + 1


def main() -> int:
    files = sorted(f for f in ROOT.glob("**/*.md") if not {"node_modules", ".vitepress"} & set(f.parts))
    result: dict[str, list] = {}
    count = 0
    for md in files:
        for code in blocks(md):
            if not code.strip():
                continue
            key = hashlib.sha1(code.rstrip().encode()).hexdigest()
            if key in result:
                continue
            hv = hovers_for(code)
            if hv:
                result[key] = hv
                count += len(hv)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[pyhover] {len(result)} 个 Python 代码块，{count} 条悬停信息 → {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
