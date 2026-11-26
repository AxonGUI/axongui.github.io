# 类型补全：让 `Axon.Xxx` 有参数提示

`Axon` 是运行时才知道控制器名和方法名的（页面里注册什么，它就有什么）。所以默认情况下它被声明成 `any`：
写 `Axon.Greeter.greet(` 不会有任何提示，写错也不会报错。

`axon-gui types` 把**运行时注册表**读出来，生成一份类型文件，把这个洞补上：

```bash
axon-gui types
```

它会做两件事：

| 方向 | 输入 | 产物 | 编辑器里得到什么 |
| --- | --- | --- | --- |
| Python → TS | `@AxonController` 注册的类 + 类型注解 | `web/src/axon.generated.ts` | 写前端时 `Axon.Greeter.greet(` 有参数名与类型 |
| JS → Python | `AxonController.register("DocsJS", { … })` | `controller/js_controllers.pyi` | 写 Python 时 `api.DocsJS.note(` 有补全 |

第一个方向默认就生成；第二个方向要显式加 `--js`（它需要用 TypeScript 编译器解析前端源码）。

## 生成到哪

不带参数，一条命令两个方向都生成（相对项目根；在 `web/` 里跑也能认出来）：

| 产物 | 默认路径 | 改路径 | 说明 |
| --- | --- | --- | --- |
| Python → TS | `web/src/axon.generated.ts` | `--out <文件>` | 目录会自动创建；提交进仓库 |
| JS → Python | `controller/js_controllers.py` | `--py-out <文件>` | 是**能 import 的 .py**，不是 `.pyi` |

```bash
axon-gui types                      # 两个都生成（默认）
axon-gui types --check              # CI：两个都校验
axon-gui types --only ts            # 只要 TS
axon-gui types --out app/types/axon.ts --py-out app/js_api.py   # 换位置
```

两条硬性要求：

- **TS 产物必须在 tsconfig 的编译范围里**（放 `src/` 下最省事）。它靠 `declare module "axon-gui"` 生效，没被 include 就等于没生成。
- **Python 产物所在目录必须能 import**（`controller/` 有 `__init__.py` 就行），因为 `connect()` 是运行时真实代码。

## 生成的东西长什么样

Python 侧这样写：

```python
from axon import AxonController

@AxonController("MainView")
class Greeter:
    counter: int = 0

    def greet(self, name: str, times: int = 1) -> str:
        return "、".join([f"你好，{name}！"] * times)
```

跑一次 `axon-gui types`，得到：

```ts
// web/src/axon.generated.ts —— 自动生成，勿手改
export interface AxonRegistry {
  /** 窗口: MainView */
  Greeter: {
    greet(name: string, times?: number): Promise<string>;
    counter: number;
  };
}

declare module "axon-gui" {
  interface AxonControllers extends AxonRegistry {}
}
```

`AxonControllers` 是 `axon-gui` 预留的类型增强点。**没有生成物时它是空接口，`Axon` 仍然是 `any`**——
所以这是一个纯增量能力，老项目不受影响。

## 效果

```ts
// 以前：全是 any，写错也不报
const text = await Axon.Greeter.greet("Axon", 2);

// 现在：参数名、类型、返回值都有；写错会直接报编译错误
const text: string = await Axon.Greeter.greet("Axon", 2);
await Axon.Greeter.greet(42);        // ✗ 类型错误：number 不能赋给 string
await Axon.Greeter.grete("Axon");    // ✗ 类型错误：不存在的方法
```

异步那一层也照顾到了：Python 的 `def` 和 `async def` 到 JS 都是 `Promise`，所以生成物里统一是 `Promise<返回类型>`，
`await` 之后就是返回值本身。

## 什么时候要重跑

只要**控制器的签名变了**就要重跑：

- 加了新方法 / 删了方法
- 改了参数名、参数类型、默认值（默认值 → `可选`）
- 加了新控制器
- 改了返回值类型

三种触发方式，按你的项目选：

```bash
# 1. 手动（最直接）
axon-gui types

# 2. Vite 插件：dev 启动时、保存文件时自动重生成（约 150ms）
#    vite.config.ts
import { axonTypes } from "axon-gui/vite-plugin";
export default defineConfig({
  plugins: [vue(), axonTypes({ args: ["--controllers", "controller"] })],
});

# 3. CI 里只校验不写文件（生成物过期就让流水线红）
axon-gui types --check
```

官方三套模板（Vue / React / Angular）都已经带好：

```bash
npm run types        # 重新生成
npm run types:check  # 校验（CI 用）
```

::: tip `vite build` 不跑生成器
生成器要 Python 环境，构建不该依赖它。插件只挂在 `serve` 上；构建走已提交的生成物，CI 用 `--check` 兜住漂移。
:::

## 反向：从 Python 调前端

前端注册的控制器对 Python 来说也是「运行时才知道」，所以只能在重点部分给一点类型。
生成器用 TypeScript 编译器读这些写法：

```ts
AxonController.register("DocsJS", {
  value: 7,
  mirror(payload: { hello: string }, label: string) {
    return { mirrored: payload, label };
  },
});
```

```bash
axon-gui types --js web/src        # 解析 web/src 下所有 ts/tsx/js/jsx
```

产物是一个 `Protocol` + 一个入口：

```python
# controller/js_controllers.py —— 自动生成
class DocsJS(Protocol):
    value: float
    def mirror(self, payload: dict[str, Any], label: str) -> dict[str, Any]: ...
    def note(self, text: str) -> None: ...

def connect(web_name: str = "*") -> AxonJsApi: ...
```

用的时候一行：

```python
from controller.js_controllers import connect

api = connect("MainView")
api.DocsJS.note("hello")            # 有补全
mirrored = api.DocsJS.mirror({"hello": "world"}, "tag").result(5)
```

Python 没有 TypeScript 那样的「模块增强」，所以拿补全的方式是 `connect()` 这个入口——
`Axon(...)` 本身还是 `any`，你随时可以继续用它。

## 它不做什么

- **不是运行时校验**：类型只在编辑器/编译期生效，传错参数不会在运行时报错（那是你 Python 方法自己的事）。
- **不会替你写注解**：Python 控制器没有类型注解的成员会生成成 `any` / `Any`（不报错，但也没有补全）。想要补全就写注解。
- **纯 JS 项目只能拿方法名**：`.js` 没有类型信息，生成物里参数一律 `any`。
- **跨窗口是并集**：`AxonCross.web("charts").DocsJS` 只能拿到所有窗口注册的 JS 控制器并集，拿不到「这台窗口特有」的那些。
- **不支持动态拼接出来的控制器**：`AxonController.register(name, obj)` 里 `name` 是变量时跳过（生成器只认字面量）。

## 注解怎么写才划算

| Python 写法 | 生成的 TS |
| --- | --- |
| `def f(a: int, b: str = "x") -> bool` | `f(a: number, b?: string): Promise<boolean>` |
| `def f(items: list[str]) -> dict[str, int]` | `f(items: Array<string>): Promise<Record<string, number>>` |
| `def f(x: int \| None = None) -> None` | `f(x?: number \| null): Promise<null>` |
| `def f(*args: int, **kwargs: Any) -> Any` | `f(...args: Array<number>): Promise<any>` |
| `counter: int = 0`（属性） | `counter: number` |
| `TypedDict` / `dataclass` / pydantic 模型 | 内联对象 `{ … }` |

写全注解的控制器，前端几乎是「有文档的 SDK」；不写注解的，就退回 `any`——两种都能跑，只是体验不同。
