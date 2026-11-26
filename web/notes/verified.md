# 接口验证记录

这份记录来自仓库内的自动化验证台 `core-py/tests/`，不是手写清单：脚本会用真实的
`QWebEngineView` + 真实的 `QWebChannel` 加载页面，把两条通道、属性、事件、Store、主线程任务
逐条跑一遍，结果写进 `core-py/tests/last_report.json`。

复现命令：

```bash
cd core-py && uv sync                     # 首次: 装 Python 3.12 + PySide6
sudo apt-get install -y libxkbfile1        # QtWebEngine 运行时依赖
core-py/.venv/bin/python core-py/tests/run_web_tests.py
```

当前结果：**37 / 37 通过，失败 0**（本机 Linux：`2026-11-23 03:29`，Windows 10 IoT LTSC：同表，见下节）。

## JavaScript → Python

| 断言 | 结果 | 说明 |
| --- | --- | --- |
| `js2py/call` | ✅ | `await Axon.TestController.add([2,3])` 返回 `5` |
| `js2py/kwargs` | ✅ | `(args, kwargs)` 两个参数位：kwargs 作为最后一个对象参数传给方法 |
| `js2py/async` | ✅ | Python `async def` 走独立事件循环，JS 端正常 await |
| `js2py/timeout` | ✅ | 超时后被 reject，错误文本 `Timeout Error, py not return in Nms` |
| `js2py/error` | ✅ | Python 抛异常 → JS Promise reject，带原始 `ValueError: ...` 文本 |
| `js2py/getVar` | ✅ | `await Axon.TestController.counter` 读属性 |
| `js2py/setVar` | ✅ | `Axon.TestController.counter = 42` 写属性，Python 侧读到 42 |

## Python → JavaScript

| 断言 | 结果 | 说明 |
| --- | --- | --- |
| `py2js/call` | ✅ | `Axon(web).JSBridge.echo("hi")` 返回 Future |
| `py2js/async_call` | ✅ | JS `async` 方法返回的 Promise 被正确 resolve |
| `py2js/getVar` | ✅ | `Axon(web).JSBridge.value.get(1)` 读 JS 属性 |
| `py2js/setVar` | ✅ | `Axon(web).JSBridge.value = 99` 写 JS 属性 |
| `py2js/error` | ✅ | JS 抛错 → Python 端 Future 抛 `JSRuntimeError` |
| `py2js/kwargs` | ✅ | Python 侧 kwargs 以尾部对象参数传到 JS |

## Store / Event

| 断言 | 结果 | 说明 |
| --- | --- | --- |
| `store/js2py` | ✅ | JS 写 `prop().set()` → Python `prop().get()` 读到 |
| `store/py2js` | ✅ | Python 写 `prop().set()` / `store.x = v` → JS `prop().get()` 读到 |
| `event/py2js` | ✅ | Python `dispatch_js_event` → JS `AxonEvent` 监听器收到 |
| `event/js2py` | ✅ | JS `dispatchPYEvent` → Python `AxonEvent` 监听器收到 |
| `event/loadFinished` | ✅ | 页面加载完成事件恰好派发一次（`count=1`），不丢不重 |

## Python 端语法糖

| 断言 | 结果 | 说明 |
| --- | --- | --- |
| `py/sugar_no_recursion` | ✅ | `Axon("w1").Ctl` 不再 `RecursionError` |
| `py/getVar_sync` | ✅ | `prop.get(timeout)` 同步读 |
| `py/call_sync` | ✅ | `prop.call(...).result()` 同步调 |
| `py/await_property` | ✅ | `await Axon(w).Ctl.prop` 可用 |
| `py/await_call` | ✅ | `await Axon(w).Ctl.func()` 可用 |
| `py/web_not_found` | ✅ | 不存在的 web → `RuntimeError: web 'x' not found` |
| `py/multi_web_decorator` | ✅ | `@AxonController(["a","b"])` 两个窗口都能取到 |
| `py/magic_gui_main_thread` | ✅ | `AxonMagicGUI.run()` 真的跑在 Qt 主线程 |
| `py/store_set` | ✅ | `store.foo = v` 同步到 JS |
| `py/shared_store_web_names` | ✅ | `AxonStore.shared.web_names` 可读且为 list |
| `py/broadcast` | ✅ | `Axon.broadcast.*` 向所有窗口广播 |
| `py/store_prop_api` | ✅ | `prop().get()/set()/value` 一致 |
| `py/store_set_visible_in_js` | ✅ | Python 写 `k3='x'`、`bridgeValue=99`，JS 侧可见 |

## 文档站自身的可交互验证

手册里每个「运行示例」按钮都由脚本真点过一遍，而不是靠人工看截图：

```bash
core-py/.venv/bin/python docs/verify_docs.py       # 真实 AxonGUI 窗口, 逐个点按钮
core-py/.venv/bin/python docs/verify_offline.py    # 不挂通道的 QWebEngineView, 验证纯说明书形态
```

`docs/verify_docs.py` 会加载构建产物、等前端握手成功、依次点击示例页上的全部卡片，
再把页面上渲染出来的消息流（JS → PY / PY → JS / 事件）读回来判定。
覆盖 7 个中文示例页 + 2 个英文示例页（`/en/examples/call`、`/en/examples/event`，同一批示例 id
在英文站上也要能跑）。最近一次结果：

| 页面 | 示例 | 观测到的消息流 | 结论 |
| --- | --- | --- | --- |
| `examples/call` | `call` | info → js2py → js2py | Python 返回 5 |
| `examples/call` | `kwargs` | info → js2py → js2py | `{"hint":"...","label":"hi","sum":3}` |
| `examples/call` | `async` | info → js2py → js2py | `async:hi（等了 300ms）` |
| `examples/call` | `timeout` | info → js2py → error | JS 侧 300ms 后放弃，Python 仍在跑 |
| `examples/call` | `error` | info → js2py → error | Python 异常回到 JS |
| `examples/property` | `property` | info → js2py ×2 → info → js2py ×2 | 0 → 写 42 → 读到 42 |
| `examples/py-to-js` | `pyToJs` | info → js2py → py2js → js2py | JS 收到 `{hello: "from python"}` |
| `examples/py-to-js` | `pyToJsProperty` | info → js2py ×6 | `DocsJS.value` 7 → 写 99 → 99 |
| `examples/event` | `eventPyToJs` | info → js2py → event → js2py | JS 收到 `["hello from python"]` |
| `examples/event` | `eventJsToPy` | info → js2py ×4 | Python 收到 `[[1,2,3]]` |
| `examples/event` | `stream` | info → js2py → event ×4 → js2py | 4 条进度事件 + 最终 `{done: 4}` |
| `examples/store` | `store` | info → js2py ×5 → py2js | JS 写 Python 读、Python 写 JS 读 |
| `examples/magicgui` | `magicgui` | info → js2py → js2py | 确实在 Qt 主线程 |
| `examples/broadcast` | `broadcast` | info → js2py → py2js → js2py | 1 个窗口收到广播 |

英文站用同一套组件（`theme/i18n.ts` 按当前路径与页面 `lang` 选文案），所以中英两种语言下的
按钮、状态条、消息流标题都要一起验；`verify_offline.py` 默认同时检查 `/examples/call` 与
`/en/examples/call`。

纯文档模式（`verify_offline.py`）的六项检查：`connected === false`、页面上 `.try-it` 与
`.try-it__run` 数量都为 0（**交互区整块不渲染，连"点一下试试"这种标题也不留**）、
`.axon-status` 数量为 0、正文不含「需要 Python 后端 / 纯文档模式」这类字样、示例代码可读、
标题正常渲染。

设计取舍：每页原来有一个 `## 点一下试试` 大节，网页形态下只剩一个空标题。现在把这一节去掉，
示例卡片（`.try-it`）直接贴在对应代码块下面 —— 客户端里是"代码 + ▶ 运行这段示例"，
网页里只有代码，两种形态都读得顺。

> 两个脚本都会自己起静态服务（`docs/server.py` 处理 VitePress 的 cleanUrls），
> 用完即走，不占端口。

## 跨窗口交互验证（18 条）

`core-py/tests/run_multi_window_tests.py` 开两个真窗口（`web_name` = `A`、`B`，同一页 `web/multi.html`），
用真 Qt WebEngine 跑完下列断言，结果写 `core-py/tests/last_multi_window_report.json`：

| 断言 | 验的是什么 |
| --- | --- |
| `boot/A`、`boot/B` | 两个窗口都连上了 |
| `windows/from-js` | A 里 `AxonCross.windows()` 能看到 `["A","B"]` |
| `call/a-to-b`、`call/b-to-a` | 双向调用，摊开传参 |
| `call/a-to-b-kwargs` | 带 kwargs + 超时的显式调用 |
| `broadcast/from-js` | 广播给所有窗口，各自返回自己的名字 |
| `emit/all/settles`、`emit/all/A`、`emit/all/B` | 事件发到所有窗口（含自己） |
| `emit/to-one` | 事件只发一个窗口 |
| `nested/a-b-a` | A → B → A 回头调不互相卡死 |
| `error/propagates` | 目标窗口抛的异常能传回调用方 |
| `py/broadcast` | Python 侧广播到所有窗口 |
| `store/shared-cross-window` | A 写共享 Store，B 读得到 |
| `call/timeout` | 目标窗口慢时按 timeout 放弃 |
| `lifecycle/closed-removed` | 关掉 B 之后窗口表里只剩 A |
| `lifecycle/call-closed` | 对已关窗口调用立刻报 `web 'B' not found` |

## 语法糖简化后的追加验证（5 条）

`core-py/tests/run_web_tests.py` 从 32 条扩到 **37 条**，新增的 5 条专测这一轮简化：

| 断言 | 内容 | 结果 |
| --- | --- | --- |
| `js2py/call_spread` | 摊开写法 `await Axon.TestController.add(1, 2)` 等价于 `add([1, 2])` | ✅ |
| `js2py/call_spread_kwargs` | 打包写法 `with_kwargs([1], { b: 2 })` 仍可用 | ✅ |
| `store/js2py_shortcut` | `store.set("k4", "via-set")` 写进 Python 侧 | ✅ |
| `store/js2py_get` | `store.get("k")` 直接读值（与 Python 同名同义） | ✅ |
| `py/store_get_set_shortcut` | Python 侧 `store.set("k6", …)` / `store.get("k6")` | ✅ |

两端的对端写入方法统一叫 `setFromPeer`（JS `AxonStore.setFromPeer(prop, value)`、Python `store.prop("k").setFromPeer(v)`），
不再有 `PYSet` / `JSSet` 两个名字；Python 侧 `AxonCall` 由「四个 staticmethod 的类」变成
`SimpleNamespace(call=call, setVar=setVar, getVar=getVar, broadcast=broadcast)`，四个函数只有一份实现。

## `axon-gui init` 生成的项目（脚手架端到端）

```bash
uv run axon-gui init demo                # 模板 + core-js(含 dist) + Python 运行时全部 vendor 进来
cd demo && uv sync
cd web && npm install && npm run build    # vue-tsc + vite 均通过
cd ../.. && python main.py
```

一次实跑记录（offscreen 真窗口，脚本点按钮）：

- 页面加载完成：`_page_loaded = True`、前端握手 `_js_ready = True`
- 点「调用 Python」按钮后 Python 侧收到
  `onCall('js-to-py-arg1', 'js-to-py-arg2', kwargs={'jskwargs': 'jskwargs'})`
  —— 说明三种传参（位置参数、`**kwargs`）穿过模板、通道、控制器都正常
- 生成项目里 `vendor/axon-core/dist` 是自包含的（`promise-retry` / `uuid` / `qwebchannel` 已打进产物），
  所以 `file:` 或 vendor 引用都不需要消费方再装这几个包

## Windows 10 IoT 企业版 LTSC（真机实测）

同一套验证台在 Windows guest 里跑过一遍（Docker + QEMU/KVM 里的 Windows 10 IoT 企业版 LTSC build 19044，
`C:\axon-test`，Python 3.12.10 + PySide6 6.11.1 的 win_amd64 wheel，全程离线、用户级安装）：

| 项目 | 值 |
| --- | --- |
| OS / build | Microsoft Windows 10 IoT 企业版 LTSC 10.0.19044.0 |
| Python | 3.12.10（`InstallAllUsers=0`，装到 `%LOCALAPPDATA%\Programs\Python\Python312`） |
| PySide6 | 6.11.1（`pyside6` / `PySide6_Essentials` / `PySide6_Addons` / `shiboken6`，`pip --no-index --find-links` 从本地 wheel 装） |
| 结论 | **37 / 37 通过，失败 0**，harness 退出码 0 |
| 原始日志 | `verify/windows/axon-win-log.txt` |

Windows 上没有 esbuild，所以用 `python run_web_tests.py --no-build` 复用已构建好的
`core-py/tests/web/axon.bundle.js`；除此之外与本机跑法完全一致。

## 文档站改版后的复查（2026-11-23）

文档站按「一个第一次接触这个项目的人能照着抄」的标准重写后，重新跑了一遍全部验证：

```bash
cd web && npm run docs:build                    # build complete in ~2.2s
cd ../.. && docs/.venv/bin/python docs/verify_docs.py     # 22 个可点示例（含 2 个英文页）
docs/.venv/bin/python docs/verify_offline.py              # 纯网页形态 6 项
docs/.venv/bin/python scripts/main.py --smoke                # 客户端自检
```

| 检查 | 结果 |
| --- | --- |
| 可交互示例（真实窗口里点按钮，看消息流；7 中文页 + 2 英文页） | **22 / 22** 通过，每条都带结论行 |
| 纯网页形态（不挂 QWebChannel，中英各一页） | **12 / 12** 通过 |
| 打包客户端自检 | `connected=True flow=2 summary='✓ Python 返回 5'`，PASS |
| 接口断言（另一套，与本轮无关） | 37 / 37 |

14 个示例覆盖：`call` / `kwargs` / `async` / `timeout` / `error`（调用 Python）、
`property`（读写属性）、`pyToJs` / `pyToJsProperty`（Python 调 JS）、
`eventPyToJs` / `eventJsToPy` / `stream`（事件与流式进度）、`store`（跨端 Store）、
`magicgui`（魔法窗口)/`broadcast`（广播）—— 两个页面, 两件事。

纯网页形态的 6 项断言改成「和普通文档站一样」的标准：没有运行按钮、没有连接状态条、
正文不出现「需要 Python 后端 / 纯文档模式」、示例代码照样可读、标题正常渲染。

## PyPI 安装（2026-11-24，Trusted Publishing 首次发布）

从 PyPI 走真实用户路径装了一遍，不碰本仓库、不碰 Release wheel：

```bash
uv venv /tmp/pypi-check --python 3.12
uv pip install --python /tmp/pypi-check/bin/python --index-url https://pypi.org/simple "axon-gui==5.3.4"
# + pyside6 6.12.0 / pyside6-essentials / pyside6-webengine / shiboken6

/tmp/pypi-check/bin/python -c "import axon, importlib.metadata as m; print(m.version('axon-gui'))"   # 5.3.4
/tmp/pypi-check/bin/axon-gui --help          # 入口脚本可用
/tmp/pypi-check/bin/axon-gui init pypi-demo  # 取 tag v5.3.4 的模板 + vendor(axon-py, axon-core/dist)
```

结果：`https://pypi.org/pypi/axon-gui/json` 返回 200（`axon_gui-5.3.4-py3-none-any.whl` + sdist），
生成的项目结构完整（`vendor/axon-py`、`vendor/axon-core/dist/{axon.js,axon.umd.cjs,build-info.json,index.d.ts}`），
`pyproject.toml` 的 `[tool.uv.sources] axon-gui = { path = "vendor/axon-py" }` 正确。
发布本身走 `.github/workflows/publish-pypi.yml` 的 OIDC（runner 45401191484，`发布` 步骤 success），仓库里没有任何长期 token。

## 装成包之后再 init（真正的用户路径）

前面几节都是"在仓库里"跑 `axon-gui init`。真正用户走的是 `pip install` 之后那条路，单独验过：

```bash
# 干净 venv，不在仓库里
cd /tmp/cli_fb && axon-gui init fbdemo
# -> 自动 vendor: vendor/axon-py/axon、vendor/axon-core/{lib,dist}
# -> web/package.json 的依赖改成 file:../../vendor/axon-core

cd fbdemo && uv sync                                  # 装 PySide6
cd web && npm install && npm run build         # vue-tsc + vite 通过, index-*.js 81.06 kB
cd ../.. && python main.py                             # offscreen 真窗口点按钮
```

实测输出：Python 侧打印 `-----JSCallPYController-onCall- count 1-----`，页面显示
`value from py : call count 1` —— 模板 / 通道 / 控制器三段都通。

`core-js/dist` 现在跟着仓库走（`axon-gui init` 从 GitHub 归档里直接取），CI 里有一条
`npm run build && git diff --exit-code -- dist` 防止有人改了 `lib/` 忘了重新构建。
万一归档里没有 `dist`（老 tag 或本地刚清过），CLI 会退回从 npm 取同版本的预构建产物。

## 异步写法（await / .result）实测

文档样例统一成 `await`（JS）与「`async def` 用 `await`、普通 `def` 用 `.result(超时)`」（Python），
两种写法都跑过：

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| 普通页面 `(async () => { const s = await AxonInit(); })()` | ✅ | `s.connected === true`（在真窗口里读回 `window.__conn`) |
| 点击回调里 `await Axon.Greeter.greet("Axon")` | ✅ | 页面显示 `你好, Axon!` |
| `async def` 控制器方法里 `await Axon(web).JSBridge.asyncEcho(...)` | ✅ | 验证台 `py/await_call` |
| 普通 `def` 里 `.result(5)` | ✅ | 验证台 `py/call_sync` / `py/getVar_sync` |
| `async def` 里 `await Axon(web).JSBridge.value`（读属性） | ✅ | 验证台 `py/await_property` |

## 打包客户端的真机验证（Windows 10 IoT LTSC，1280×800 虚拟机）

在 Windows 虚拟机上跑解压后的 `AxonDocs/AxonDocs.exe`（v5.3.4 的目录形态），实测数字：

| 检查项 | 实测 |
| --- | --- |
| 解压 208 MB 的 zip | 19.9 s（一次性） |
| 从双击到内置静态服务可用 | **807 ms** |
| `GET /` 响应 | 200，21,134 字节 |
| 从双击到窗口出现（标题 `Axon 文档 · 可交互示例`） | 831 ms |
| 窗口尺寸（桌面 1280×800，可用区 1280×760） | 1219×753，位于 (30,23)，完整可见并居中 |
| 进程占用 | 149 MB |
| 页面渲染 + 通道 | 首页完整；状态栏「已连接 Python 后端 · 通道对象: AxonEnv, AxonJSCallHandler, AxonPYCall」 |
| 点「运行这段示例」 | 消息流 2 条：`JS → PY Axon.DemoController.add(2, 3)`（含 kwargs/type 载荷）→ `JS → PY 结果回到 JS: 5`（12 ms），结论「✓ Python 返回 5」 |
| exe 图标 | 标题栏与任务栏都是统一的 A 标记 |

同一台机器上复现并修掉了「白屏 + `ERR_EMPTY_RESPONSE`」：windowed 打包后 `sys.stderr` 为
`None`，静态服务的 `log_message()` 一写就抛异常，每个请求都被断连。详见
[踩坑](/notes/pitfalls#打包成-windowed-exe-后页面一片空白-err-empty-response)。

早期 v5.3.3 的单文件形态在同一台机器上的表现：冷启动明显更慢（每次启动解压 200+ MB），
窗口按 1280×840 写死导致超出屏幕。这两点都在 v5.3.4 里改掉了。

## 二进制走 `axon://`（5.4.4）

| 断言 | 结果 |
| --- | --- |
| `<img src="axon://asset/…">` | 32×16 PNG 正确渲染 |
| `fetch(url).arrayBuffer()` | 1,000,000 字节，3 ms |
| `from_file()` + `fetch().text()` | 读回 `hello from disk`（QFile 惰性读取） |
| `release()` 后再取 | `count` 3→2，HTTP 404 |
| 文档站示例页（`examples/assets`） | 2.0 MB，83 ms（客户端形态） |

跑法：`core-py/tests/run_web_tests.py`（46 条，含 4 条 asset 断言）、`docs/scripts/verify_docs.py`。

## 客户端下载引导（只在网页形态出现）

| 断言 | 结果 |
| --- | --- |
| 纯网页（无后端）：`.axon-download` 出现 | 1 条，含 2 个链接 |
| 链接指向 `releases/latest/download/AxonDocs-{windows-x64.zip,linux-x64.tar.gz}` | ✓ |
| 客户端（连上后端）：`.axon-download` 数量 | 0 |
| 点「在网页看就行」后 | 记 localStorage，刷新不再出现 |

跑法：`scripts/verify_offline.py`（断言出现）、`scripts/verify_docs.py`（断言不出现）。

## 文档站用的写法（VitePress 2.0.0-alpha.17 + 自建小插件）

- **代码块标题**：```` ```js [app.js] ```` 会在代码块上方渲染一条文件名栏。这个版本还不支持该语法，
  由 `web/.vitepress/config.mts` 里的 `markdown.config()` 插件实现（`.axon-file`，样式在 `custom.css`）；
  在 `::: code-group` 里方括号用作标签页名字，插件不重复渲染。
- **代码组**：`: :: code-group` + 每块一个 `[标签]`，把「同一件事的几种写法」收成标签页（如 `examples/call` 的三种调用形式、`api/javascript` 的两种引入方式）。
- **行高亮**：`{行号}` 或行尾 `// [!code highlight]`；`// [!code error]` / `// [!code warning]` 只用在「这行本身是错的」。
- **容器中文标题**：`::: tip 提示` / `::: warning 警告` / `::: details 展开查看`（主题默认标签是英文，逐页写中文标题）。
- **最后更新 / 编辑此页**：`lastUpdated: true` + `themeConfig.editLink`，CI 里 `actions/checkout` 需要 `fetch-depth: 0` 才有 git 时间。

## 外链交给系统浏览器（axon-gui 5.4.1）

客户端里点 GitHub 之类的站外链接时，不再把窗口导航走，而是用系统浏览器打开；
本机地址（`127.0.0.1` / `localhost`）照常在窗口内跳转。

```
view url: http://127.0.0.1:41207/guide/quickstart      # 没被导航走
opened:   ['https://github.com/AxonGUI/Axon']           # 交给系统浏览器
PASS
```

覆盖三种情况：同标签外链、`target="_blank"` 外链（走 `createWindow`）、站内相对链接（正常跳转）。

### 跨窗口示例（独立演示页）

第二个窗口不再复用说明书页面，而是打开 `/demo/cross-window.html`（`web/public/demo/`，构建时把 `axon-gui` 的 UMD 拷到 `public/vendor/`）。

| 检查 | 结果 |
| --- | --- |
| 主窗口点「打开第二个窗口」 | `AxonGUI.windows()` = `["AxonDocs","charts"]`，第二个窗口 `isVisible()` 为真 |
| 点名调用（`AxonCross.web("charts").Peer.ping`） | 回执 `{web:"charts", echo:…, at:…}`，演示页日志多一条 |
| 广播 | 两个窗口都收到，回执逐窗口列出 |
| 事件 `demo:cross` | 两个窗口各记一条；演示页也有监听器 |
| 关闭 | `["AxonDocs"]` |
| 纯网页打开演示页 | 「纯网页模式：没有检测到 Python 后端」，四个按钮全部 disabled |

## 跨窗口「两边一起显示」（v0.3.3）

| 检查 | 结果 |
| --- | --- |
| 每个示例按钮的文案 | 显示该示例自己的标题（`▶ 调用 Python 方法`、`▶ 点名调用另一个窗口` …），旁边一行说明「点下去会发生什么」 |
| 主窗口收到 charts 的调用 | 页面上的「别的窗口调到我这里」实时多一条（`调用 · 来自 charts 的回调 · 时间`） |
| charts 窗口收到主窗口的调用 | 演示页日志多一条青色「收到」记录，并回 `{"web":"charts","echo":…}` |
| 当前窗口列表 | `CrossInbox` 每 1.5s 轮询 `AxonCross.windows()`，显示 `AxonDocs` / `charts` |
| 纯网页形态 | 独立演示页显示「纯网页模式」且四个按钮全部不可点（`verify_offline.py` 断言） |

传真的坑：把按钮 id 从 `btn-back` 改名成 `btn-call-main` 时，页面脚本里还有一处旧 id，导致
`Cannot set properties of null (setting 'disabled')` —— 页面初始化中断、按钮全灰。这类「改名后遗漏引用」
用 `grep -n "旧id"` 扫一遍再构建，比看截图快。
