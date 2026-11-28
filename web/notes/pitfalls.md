## twoslash 的类型是常驻显示，不是悬停

**症状**：代码块里写了 `// ^?`，页面上那个类型说明一直挂着不走，悬停反而没有浮层。

**根因**：`^?` 在 twoslash 里是「查询（query）」，语义就是**常驻显示**——`style-rich.css` 里 `.twoslash-query-persisted .twoslash-popup-container { opacity: 1 }` 直接把它钉住了。悬停浮层只作用于普通的 `.twoslash-hover` 片段（`:hover` 才 `opacity: 1`）。

**修法**：想要悬停效果就别写 `^?`，只给代码块加 `twoslash` 标记；这样块里每个标识符都会变成可悬停的 token。

## 代码块文件名栏和类型悬停一起失效（VitePress alpha.21）

**症状**：升级到 `vitepress 2.0.0-alpha.21` 后，` ```ts [app.ts] ` 的文件名栏不再出现；照官方写法加 `markdown.codeTransformers` 跑 twoslash，产物里也没有任何 `twoslash-*` 标记。

**根因**（两件事都出在 VitePress 的渲染顺序上）：
1. `preWrapperPlugin` 在 `markdown.config(md)` **之后**才安装，并且它先把 `token.info` 里的 `[app.ts]` 删掉，所以挂在 `md.renderer.rules.fence` 上的钩子拿不到方括号；
2. `markdown.codeTransformers` 确实进了 `md.options`，但这版构建链的 `highlight()` 闭包没有读到它，transformer 一次都不会执行。

**修法**（`web/.vitepress/config.mts`）：不再挂 fence 规则，改成包 `md.renderAsync`——
- 渲染前扫一遍源码：带 `[文件名]` 的块拆出文件名、写成一行 `<div class="axon-file">`；带 `twoslash` 标记且含 `// ^?` 的块用 `createHighlighter` + `transformerTwoslash({ renderer: rendererRich() })` 直接渲染成 HTML，源码里留一个 `<div data-axon-slot="N"></div>` 占位；
- 渲染后把占位替换回 HTML。

**两个附带坑**：
- HTML block 必须以空行结束（CommonMark）。文件名栏 `div` 和后面的三反引号之间没有空行，整段代码会被当原始 HTML 塞进模板，Vue 报 `Element is missing end tag`；
- twoslash 的 `// ^?` 必须紧贴被查询的那一行、并且列号对准 token；查询放在多行调用结束的 `});` 下面会报 `The request on line N for quickinfo via ^? is in a removal range`。

**顺带**：浮层用 `rendererRich()`（内容内联进 HTML），不要用 `@shikijs/vitepress-twoslash` 的 floating-vue 版本——那条路依赖 Vue 运行时插槽，静态产物里浮层是空的。

# 已知坑与修复

这一页记录「写完没跑过」的那批语法糖在被真实依赖跑起来之后暴露的问题。每一条都写清
**症状 → 根因 → 修法**，方便对照旧版本代码或踩到同类问题时定位。

## JS 端

### `await Axon.Ctl.prop` 永远不返回（旧版）

- 症状：`await Axon.TestController.counter` 挂住，`Promise` 永不 settle；`.then(cb)` 却正常。
- 根因：`Axon.ts` 里对象字面量成员 `then: () => {...}` 是**箭头函数**，它忽略 `then` 的两个参数，
  Promise 的 resolve 永远传不出去（`await` 依赖的正是这个 `then`）。
- 修法：改写成 `then(onFulfilled, onRejected) { return promise.then(onFulfilled, onRejected) }`，
  `catch`/`finally` 同理。

### 普通浏览器里 `AxonInit()` 直接抛错

- 症状：没有 Qt 通道时整页白屏，控制台 `TypeError: Cannot read properties of undefined`。
- 根因：`initChannels()` 连接失败时只 `console.error` 然后照常 resolve，后继 `AxonPYCallHandler.init()`
  去读 `AxonChannels.AxonPYCall` 就炸了；调用方无从知道「现在有没有后端」。
- 修法：`initChannels()` 返回 `IAxonChannelStatus`，`AxonInit()` 返回
  `{connected, ready, reason, objects, error}`；未连通就直接返回 `ready: false`，不再抛错。
  文档站「纯说明书 / 可交互」两种形态就靠这个返回值切换。

### 第二个 `@AxonController()` 复用了第一个类名

- 症状：两个类都用默认 id 时，后一个覆盖前一个，JS 端调不到。
- 根因：装饰器闭包里的 `id` 被 `if (id === undefined) id = controller.name` **改写**，
  第二次调用时 `id` 已经不是 `undefined` 了。
- 修法：`const controllerId = id !== undefined ? id : controller.name`。

### Qt 事件名对不上

- 症状：`AxonEvent.addListener("dragMove", ...)` / `"dragLeave"` 永远收不到。
- 根因：Python 侧派发的是 `"dragMove"`、`"dragLeave"`（`AxonGUI.py`），JS 类型定义里写的是
  `"dragMoveEvent"`、`"dragLeaveEvent"`。
- 修法：统一为 Python 侧的短名，`AxonQtEventMap` 同步改。

## Python 端

### `Axon("w").Ctl` 直接 `RecursionError`

- 症状：`ax = Axon("w1"); ax.JSCallPYController` → `maximum recursion depth exceeded`。
- 根因：`JSController.__init__` 里 `self.web_name = ...` 走 `__setattr__` → 转 `setVar` →
  `__getattr__` → 又读 `self.web_name` → 递归。
- 修法：`__init__` 里用 `object.__setattr__`；`__setattr__` 只发 `setVar` 并把 Future 存
  `_last_future`（旧版 `.result()` 在主线程会死锁）。

### `await Axon(w).Ctl.prop` 抛 `TypeError: __await__() returned non-iterator`

- 根因：`__await__` 直接 `return future.result()`，返回的是**值**，不是迭代器。
- 修法：`return asyncio.wrap_future(self._ensure_get()).__await__()`。

### Python 端 `await` 不了回调 Future

- 症状：`await Axon(w).JSBridge.echo("hi")` → `TypeError: object Future can't be used in 'await' expression`。
- 根因：`concurrent.futures.Future` 本身不实现 `__await__`。
- 修法：新增 `AxonFuture(Future)`，`__await__ = asyncio.wrap_future(self).__await__()`，
  `_call` 统一返回它。

### 装饰器只注册第一个窗口

- 症状：`@AxonController(["webA", "webB"])` 之后只有 `webA` 能调到。
- 根因：`return cls` 写在了 `for web_name in web_names` 循环体里。
- 修法：循环结束再 `return cls`。

### 新窗口找不到 `AxonEvent` 控制器

- 症状：JS `dispatchPYEvent` 之后 Python 监听器没反应，Python 侧报
  `RuntimeError: Controller AxonEvent of Web testWeb not found`。
- 根因：`AxonEvent` 是**实例**注册到 `"*"`（`AxonController.register(AxonEvent, id="AxonEvent")`），
  而 `auto_register` 只合并「类注册表」，实例注册表里的 `"*"` 不会被后来创建的窗口继承。
- 修法：`AxonJSCallHandler` 新增 `globalControllers`，`register(..., "*")` 时记进去，
  `auto_register(web)` 时先铺全局实例再铺类实例。

### `AxonInit()` 之后立刻派发 `loadFinished` 会丢事件

- 症状：页面首次加载时计数 `0`，刷新一次才有。
- 根因：Qt 的 `loadFinished` 比前端握手更早触发；此时 JS 的 `AxonPYCall.onCallSignal` 还没 connect，
  消息发出去没人接。
- 修法：双向报到。JS 初始化完成后调 `AxonEnv.ready()`（新增的 `@Slot()`），Python 侧
  `AxonGUI` 用 `_page_loaded` + `_js_ready` + `_load_finished_dispatched` 三个标记，
  两者齐备才 `QTimer.singleShot(0, ...)` 派发一次。

### `AxonStore` 的 id 被套了两层

- 症状：`new AxonStore("demo")` 之后 JS 侧 map 的 key 变成 `__AxonStore___AxonStore_demo____`。
- 根因：Python 侧 `createStore` 传的是 `self.controller_id`，而 JS 侧 `createStore(id)` 会把它当 store id。
- 修法：传 `self.id`。

### `AxonStore.shared` 加不了窗口

- 症状：`AttributeError: 'dict_keys' object has no attribute 'append'`。
- 根因：`SharedAxonStore.web_names` 是只读 property（返回 `AxonGUI.windows()`），
  继承来的 `add_web` 却去 `append`。
- 修法：内部统一改 `self._web_names`；`SharedAxonStore.web_names` 返回 `list(...)`。

### Python 侧写 Store 不同步到 JS

- 症状：`store.foo = 1` 之后 JS `prop("foo").get()` 还是旧值。
- 根因：`AxonStoreProperty.__set__` 是描述符死代码（实例上没有类属性引用它），
  而 `AxonStoreBase.__setattr__` 又把所有属性直接写进 `__dict__`。
- 修法：`AxonStoreProperty` 变成「`_value` + `get()/set()/setFromPeer()/value`」的普通对象，
  `AxonStoreBase.__setattr__` 把非保留字段路由到 `self.prop(name).set(value)`。

### `AxonMagicGUI.run()` 报 `AttributeError: instance`

- 根因：`instance: "AxonMagicGUI | None"` 只是**类型注解**，没有赋值，类属性并不存在。
- 修法：显式 `instance: AxonMagicGUI | None = None`，`run()` 用 `is None` 判断。

### 页面先 load 再挂 QWebChannel（竞态）

- 症状：偶发 `qt init fail`，刷新才好。
- 根因：`AxonWebEngineView.__init__` 先 `self.load(url)`，之后才 `setWebChannel()` 与 7 个 settings。
- 修法：把 `load()` 移到初始化末尾。

## 环境类

- **必须装 `libxkbfile1`**，否则 `import axon` 就 `ImportError`（`AxonEngineView` 导入
  `QtWebEngineCore` 时缺系统库）。
- **无头环境跑验证台**要设 `QT_QPA_PLATFORM=offscreen` 与
  `QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"`。
- **窗口不可见时定时器会被节流**：offscreen 下 `setTimeout(100)` 实测 ~400ms 才回调，
  所以「超时用例」的服务端 sleep 要给 3 倍以上余量。

## 文档站自身踩过的坑（做示例 UI 时）

- **`v-if` / `v-else` 换掉按钮节点，自动化脚本会误判**：运行按钮展开后换成另一个 `<button>`，
  外部脚本捕获到的旧节点 `disabled` 一直是 `false`，于是示例还在跑它就开始读消息流，
  读到的结论行是空的。修法：始终用同一个节点，只改文案与禁用态。
- **`runJavaScript` 回调拿不到 JS 对象**：返回 `{a:1}` 这种对象在 PySide6 里回调收到的是空/
  不可用值，必须先 `JSON.stringify` 再在 Python 侧 `json.loads`。
- **离线模式（普通浏览器）不能用按钮禁用来表达「没后端」**：按钮禁用还需要用户理解为什么，
  而且这行文案在纯网页里毫无意义。改成「依赖后端的 UI 只在 `connected` 为真时渲染」，
  网页里那块根本不存在。

## `axon-gui init` 装成包之后生成的项目是残的

- 症状：`pip install axon-gui` 之后跑 `axon-gui init myapp`，生成的项目里没有
  `vendor/axon-core/dist`（也没有 `vendor/axon-py`），`npm install` 直接 `TS2307: Cannot find module 'axon-gui'`。
- 根因：`cli.py` 只在"当前包位于仓库里"时才做 vendor；装成包运行时走的是另一条分支，只拷了模板。
- 修法：两条分支合成一条——包外运行时从 GitHub main 归档取 `template/` + `core-js/` + `core-py/`，
  再统一做 vendor；`core-js/dist` 提交进仓库（并在 CI 里校验与 `lib/` 同步），归档里没有时退回
  npm 上同版本的预构建产物。

## 打包成 windowed exe 后页面一片空白（ERR_EMPTY_RESPONSE）

- 症状：`AxonDocs.exe` 双击打开，窗口出来了、标题也对，但内容区是
  `该网页无法正常运作 / 127.0.0.1 未发送任何数据 / ERR_EMPTY_RESPONSE`。
  开发态 `python scripts/main.py` 完全正常，CI 里的 `--smoke` 也是绿的。
- 根因：windowed 打包（PyInstaller `--windowed`）没有控制台，`sys.stderr` 是 `None`；
  而 `SimpleHTTPRequestHandler` 每处理一个请求都会调 `log_message()`，旧实现直接
  `sys.stderr.write(...)`，于是每个请求都在写日志这一步抛 `AttributeError`，
  连接被直接关掉 —— 浏览器看到的就是「服务器没返回任何数据」。
  CI 的 `--smoke` 跑在带控制台的 shell 里，`stderr` 有值，所以照样通过。
- 复现（不打包也能验）：
  ```python
  sys.stderr = None            # 模拟 windowed exe
  urllib.request.urlopen(url)  # 旧实现 -> RemoteDisconnected
  ```
- 修法：`docs/server.py` 的日志写入口做空值兜底（还支持 `AXON_DOCS_LOG=路径` 落文件），
  并且 `handle_one_request()` 兜住处理异常，改用 500 而不是静默断连。

## 客户端「窗口大得离谱」/「第一次启动很慢」

- 窗口：原来写死 `view.resize(1280, 840)`。1280×800 的虚拟机、1080p + 125%~150% 缩放的笔记本
  都比它小，结果窗口超出屏幕、标题栏被顶到屏幕外。修法：按 `screen.availableGeometry()`
  收缩到 94% 并居中（`scripts/main.py: fit_to_screen`）。
- 启动：PyInstaller `--onefile` 每次启动都要把 200+ MB 解压到 `%TEMP%\_MEIxxxx`，再等
  Defender 扫一遍，冷启动必然慢。修法：改成目录形态（`--onedir`，默认），exe 与依赖留在原地，
  秒开；确实需要单文件时再显式 `--onefile`。

## `axon://` 为什么不能拖视频进度条

- **症状**：`<video src="axon://asset/…">` 能播放，但拖动进度条没反应；大文件断点续传也不行。
- **根因**：分段响应需要读请求头里的 `Range`，而 `QWebEngineUrlRequestJob` 只暴露
  `requestUrl()/requestMethod()/requestHeaders()` 的外发侧，服务端拿不到请求头，无法返回 206。
- **修法**：需要 seek 的媒体别走 `axon://`，用应用自己的 HTTP 服务（`http.server` 或后端框架）
  提供文件；小图片、PDF、下载类附件继续用 `axon://`。
- 附带：`fetch()` 能从本机页面读 `axon://`，是因为 scheme 声明了 `CorsEnabled` 且响应带了
  `Access-Control-Allow-Origin: *`；少任一条就只剩 `<img>` 能用、`fetch` 报 `Failed to fetch`。

## 为什么 Python 的类型提示不用 pyright

试过 `pyright-langserver --stdio` + 手写 LSP 客户端（`initialize` / `didOpen` / `hover`，并应答 `workspace/configuration`）：

- 同一份文件用 `pyright` CLI 能解析 `from axon import AxonAsset`（`extraPaths` 指向 venv 的 site-packages），
  走 LSP 却一直返回 `(import) AxonAsset: Unknown`
- `pyrootconfig.json` 的 `venvPath`/`venv`、`initializationOptions.settings.python.analysis.extraPaths`、
  按 section 应答 `workspace/configuration` 都试过，无效

所以改成「静态分析 + 反射」：自己解析块里的 `ast`，再对 import 进来的符号反射真实安装的包。
好处是确定、快（200ms 出全站）、不依赖语言服务；代价是只能解析「块里定义的 + 从 axon 导入的」符号，
局部变量和复杂泛型不展开——这也正好符合「类型提示是为了展示」的目的。

## 自己渲染的代码块要补回 VitePress 的容器

twoslash / Python 悬停这两条路径是「自己用 shiki 渲染好 HTML 再塞回去」，绕过了 VitePress 的 `preWrapper`。
后果是代码块没有 `div.language-xx` 容器：没有背景色、没有圆角、没有语言标签和复制按钮，
看起来像「代码直接摊在页面正文里」。

修法：塞回去之前自己套一层，与 `preWrapper` 的输出保持一致：

```html
<div class="language-js" dir="ltr"><button title="Copy code" data-copied="Copied" class="copy"></button><span class="lang">js</span><pre class="shiki … twoslash">…</pre></div>
```

背景来自 `.vp-doc div[class*=language-]`，文件名栏的圆角来自 `.axon-file + div[class*="language-"]` —— 少了这层容器，两条样式都落空。

## 悬停框里的签名没有颜色 / JSDoc 的 Markdown 原样显示

两个症状，两个不同的原因，都是「内容有了、但没走渲染」：

1. **Python 悬停框的签名是纯文字。** `pythonHoverTransformer` 只把分析出来的签名当文本塞进
   `code.twoslash-popup-code`，从来没让 shiki 渲染它，所以没有语法颜色。
   修法：构建时先对每条悬停文本单独跑一次 `codeToHast({ structure: "inline" })`，把 token 节点塞进浮层；
   注意 `structure: "inline"` 时 `hast.children` 直接就是 token 列表（不是 `<pre><code>`），
   取 `children[0].children` 会拿到空。
2. **JS 悬停框里的 JSDoc 是 Markdown，但显示成 `**星号**` 和反引号。**
   `rendererRich()` 的 `renderMarkdown` 默认是「原样输出」的 pass-through，
   必须自己传一个把 Markdown 转 hast 的函数（我们用 `md.render` / `md.renderInline` + 一个小的 HTML→hast 转换）。
3. 顺带一个内容问题：类的 `__doc__` 会沿 MRO 继承，`AxonGUI` 因此拿到 `QWebEngineView` 的文档，
   悬停框里多出一行不相干的签名。只取 `cls.__dict__["__doc__"]`（自己写的）即可。

另外 `npm run pyhover` 要用**装了 axon-gui 的解释器**跑（`AXON_PYTHON=...`）。
用系统 python3 跑不会报错，只是解析不到从 `axon` 导入的符号，277 条会静默掉成 57 条——脚本现在会直接拒绝并提示。

## 悬停框里冒出一行 `<!--::markdown-it-async::…-->`

VitePress 2 用内置的 `markdown-it-async` 让 markdown 插件可以异步：异步高亮还没回来时先写
`<!--::markdown-it-async::<id>::-->` 占位注释，`renderAsync()` 末尾再逐个替换成高亮结果。
官方页面渲染永远走 `renderAsync`，所以正常不会看见它。

我们的悬停说明是在 **twoslash 的同步钩子**里渲染的（`rendererRich` 的 `renderMarkdown`
必须是同步函数，返回节点数组），只能调同步的 `md.render()` —— 拿到的就是带占位注释的
中间结果（库会打印 `Please use md.renderAsync instead`）。

修法不是"字符串替换注释"，而是让 HTML→hast 走官方解析器：`hast-util-from-html` 会把注释
解析成独立的 `comment` 节点，过滤掉 `type === "comment"` 即可，代码正文本来就在 `<code>`
里不受影响。附带的 `.lang` 语言标签与 `button.copy` 是 VitePress fence 包装自带，浮层里
`display:none`。

## 悬停浮层里的字特别小（10px 左右）

官方样式 `.twoslash .twoslash-popup-docs { font-size: 0.8em }` —— 浮层原本在代码块内部，`0.8em`
是相对**代码块字号**（VitePress 约 14px）算的，所以看着是「比代码小一圈」。

我们把浮层搬到 `body` 之后，`em` 改相对外层容器；外层当时又写了 `font-size: 0.8rem`，
于是 0.8 × 0.8rem ≈ 10.2px —— 两重缩小，比官方还小。

修法：浮层里用绝对字号（代码行 13px、说明 13.5px/1.7、内边距 8px 12px），不再依赖 `em` 链。

## 悬停 `Axon` 显示 `any`

`Axon` 是运行时 Proxy：控制器名、方法名只有跑起来才知道，所以包里 `AxonFacade` 的定义是
「有生成物就按签名表来，没有就是 `any`」（`axon-gui/dist/Axon.d.ts` 里 `AxonControllers`
是空接口）。静态 `any` 是设计，不是漏了类型。

想让文档里的悬停有真实签名，就用类型生成器补上那张表：

```bash
cd web && AXON_GUI=axon-gui npm run types   # 等价于 axon-gui types --only ts --ts-out web/axon.generated.d.ts
```

再在 twoslash 里把它塞进虚拟文件系统（`config.mts`）：

```ts
twoslashOptions: { extraFiles: { "axon.generated.d.ts": axonGeneratedDts } }
```

悬停 `Axon.DemoController.add` 就会显示 `function add(a: number, b: number): Promise<number>`。
注意只有**文档站真实控制器**里的名字才有类型（`DemoController`）；代码示例里虚构的
`Axon.Users`、`Axon.Calc` 仍然是 `any` —— 它们在真实应用里不存在，硬写一份签名表反而是假精确。

## PyPI 拒绝上传：`Framework :: PySide6` 不是合法 classifier

**症状**：tag 打好、artifact 也 build 成功，`pypa/gh-action-pypi-publish` 报
`400 Bad Request … 'Framework :: PySide6' is not a valid classifier.`，PyPI 上还是旧版本。

**根因**：classifier 是 PyPI 那边**白名单**里的字符串，拼错/自创一个就直接 400。PyPI 的 trove 列表里根本没有 PySide6 这一项（只有历史的 `Framework :: PySide` / `:: PySide2`）。

**修法**：从 `classifiers` 里删掉该项。以后加任何 classifier 前先查
`https://pypi.org/classifiers/`；`Typing :: Typed`、`Programming Language :: Python :: 3.13` 都是合法项。

## TypeScript 7 没有 JS Compiler API，打包插件起不来

**症状**：`npm run build` 在 `vite build` 阶段直接失败：
`The installed "typescript" package does not provide the JavaScript Compiler API (this happens with TypeScript 7+)`。

**根因**：TS 7 是原生（Go）重写版，只保留 `tsc` 命令行，不再导出供工具链调用的 JS API；`vite-plugin-dts`（底层 unplugin-dts）要靠这个 API 读 tsconfig / 生成声明。

**修法**：按报错提示装一份旧的 API 包当 tooling fallback——
`npm i -D @typescript/typescript6`。之后 `tsc` 仍走 TS 7，插件走 TS 6 的 API，两边都正常。

## Vite 8 换 rolldown 后不再带 esbuild

**症状**：验证台 `run_web_tests.py` 直接 `SystemExit`：`缺少 esbuild: 先执行 npm ci`——但 `npm ci` 刚跑过、依赖装得好好的。

**根因**：验证台脚本要 `core-js/node_modules/.bin/esbuild` 把前端打成浏览器包。以前这个二进制是 vite 5 的**传递依赖**；vite 8 改用 rolldown，不再安装 esbuild。

**修法**：把 `esbuild` 写成 `devDependencies` 里的显式依赖。教训是通用的——**验证台依赖的二进制，不能靠别的工具的传递依赖**，否则上游换个打包器就静默缺件。

## `astral-sh/setup-uv` 没有浮动的主版本标签

**症状**：把 workflow 升到 `astral-sh/setup-uv@v10`，job 在 "Set up job" 阶段就 failure，看不出原因。

**根因**：该仓库只对早期版本打了 `v5`/`v7` 这类浮动主标签；`v10` 这个 ref 不存在（REST 查 `git/ref/tags/v10` 返回 404），必须写完整版本 `v10.4.0`。

**修法**：钉完整版本号。升级 Actions 前先用 `GET /repos/{owner}/{repo}/git/ref/tags/{tag}` 确认该 ref 真的存在，别照抄 major 写法。

## 刚发布的版本，uv 会从缓存里说「没有这个版本」

**症状**：PyPI 上 `axon-gui 5.7.2` 已经能查到，`uv pip install "axon-gui==5.7.2"` 却报
`Because there is no version of axon-gui==5.7.2 … unsatisfiable`。

**根因**：uv 的索引缓存（以及本机配的镜像）还没刷新；解析时看到的是旧快照。

**修法**：加 `--refresh`（或 `--no-cache`）重试。验证"刚发的包能不能装"要用干净环境 + `--refresh`，否则会把缓存问题误判成发布失败。

## Angular 不能一次跨两个大版本升级

**症状**：`npx @angular/cli@22 update @angular/core@22 …` 报
`Updating multiple major versions of '@angular/core' at once is not supported`。

**根因**：Angular 的迁移脚本只按「相邻大版本」设计。

**修法**：一版一版升：先 `update @angular/core@21 @angular/cli@21 …`，跑通构建，再升 22。每步都要重新 `npm install` 让 peer 依赖（如 TypeScript 版本）跟着变。

## 关窗口时在飞调用不了结：等 `destroyed` 等不到

`deleteLater()` 排的销毁要等事件循环走到空闲才执行，而 `QCoreApplication.processEvents()`
**不处理 `DeferredDelete` 事件**（这是 Qt 的明确规定）。所以把「窗口没了 → 把发给它的在飞调用
了结掉」挂在 `destroyed` 信号上，在验证台里永远不触发、在真机上又太晚。

正确做法是在 `_forget_window()`（`closeEvent` 会调）里直接了结。

## CI 里写 `macos-13`：任务永远排队，不报错

GitHub 已经退役 macOS 13 的 Intel 镜像。把它写进 `runs-on` 的矩阵里不会失败——**任务就是一直
queued**，容易误判成「排队慢」而白等半小时。现役的 x86_64 标准镜像是 `macos-15-intel`，
arm64 是 `macos-latest`。

顺带一条：macOS 上跑 Qt WebEngine 用 `QT_QPA_PLATFORM=cocoa`，不要用 `offscreen`——
offscreen 平台的 `isExposed()` 也会返回 True，用它做「窗口是否真的出现」的判据会得到假绿。
