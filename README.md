# Axon 说明书

https://axongui.github.io/ 的源码。独立于框架仓库，消费的是 PyPI / npm 上的**发布版**，
所以「文档里写的」和「用户装到的」永远是同一个东西。

## 这个站点有两种形态

| 形态 | 打开方式 | 表现 |
| --- | --- | --- |
| 纯说明书 | 浏览器直接访问（线上站、`npm run docs:dev`） | 只有文字和代码，没有任何按钮 |
| 可交互 | `python scripts/main.py`（在 AxonGUI 窗口里） | 每个示例下面出现「▶ 运行这段示例」，点了真的调 `controller/` 里的 Python，并把两端消息逐条列出来 |

判据是同一份前端产物：`AxonInit()` 返回 `{ connected: false }` 就是纯说明书，`{ connected: true }` 才挂上可交互那层。

## 本地跑

```bash
npm install -g  # 不需要
cd web && npm install && npm run docs:build && cd ..

# 纯说明书
cd web && npm run docs:dev          # http://127.0.0.1:5174

# 可交互（需要 Python 3.12+ 与 libxkbfile1）
uv sync
uv run python scripts/main.py          # 构建产物形态
WEB_ENV=dev uv run python scripts/main.py   # dev server 形态
```

## 验证

```bash
cd web && npm run docs:build && cd ..
uv run python scripts/verify_offline.py   # 纯网页形态：不出现任何「需要后端」字样
uv run python scripts/verify_docs.py      # 真窗口里逐页点示例
```

## 目录

```
web/                 VitePress 站点（中文在根，英文在 web/en）
web/.vitepress/      配置 + 主题（AxonStatus / LiveDemo / custom.css）
controller/          Python 侧示例后端（DemoController.py）
scripts/             宿主与验证脚本（main.py / build_client.py / verify_*.py）
assets/              窗口图标与标记
```

## 打包成桌面客户端

```bash
cd web && npm install && npm run docs:build && cd ..
uv run python scripts/build_client.py
uv run ./build/client/dist/AxonDocs/AxonDocs --smoke   # Windows: build\client\dist\AxonDocs\AxonDocs.exe
```

## 改了框架之后

文档站**不会**自动跟着源码走。发新版 `axon-gui` 之后，把 `web/package.json` 里的版本号调一下：

```bash
cd web && npm install axon-gui@latest
```

这也是故意的：文档永远是发布版的说明书。

## License

MIT
