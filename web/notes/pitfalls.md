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
- 根因：`SharedAxonStore.web_names` 是只读 property（返回 `AxonGUI.get_web_names()`），
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
