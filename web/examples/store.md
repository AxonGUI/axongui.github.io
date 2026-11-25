# 跨端键值：Store

<span class="channel-tag">双向</span>

两端共享的一份键值表。JS 写进去，Python 读得到；Python 改一下，JS 那边也会跟着变。

它适合放「两边都要用的状态」：当前用户、选中项、配置项。**读是本地缓存，写才会发消息**，所以读取是同步的 `get()`，不产生往返。

## Python 侧

```python [controller.py]
from axon import AxonStore

WEB = "MainView"

# 拿一个 store（同名就是同一个；重复创建是幂等的）
store = AxonStore("docs-store", WEB)

store.set("user", "travis")          # 写：会同步给持有同名 store 的网页  # [!code highlight]
print(store.get("user"))             # 读：本地缓存，直接返回

# 也可以按属性写
store.prop("theme").set("dark")
print(store.prop("theme").value)
```

## JS 侧

```js [app.js]
import { AxonStore } from "axon-gui";

const store = new AxonStore("docs-store");   // 名字要和 Python 侧一致

store.set("user", "travis");                 // 写：同步给 Python  // [!code highlight]
store.get("user").get();                     // 读：本地缓存

// 等 Python 写完再读，能看到它的值
const theme = store.get("theme").get();
```

<LiveDemo id="store" />

## 谁负责通知谁

| 动作 | 发生了什么 |
| --- | --- |
| `store.set("k", v)` | 更新本地值 → 给同名的对端发 `setFromPeer("k", v)` |
| 对端写入 | 收到 `setFromPeer` 后只更新本地值，**不再回推**（否则两端会一直来回弹） |

所以「两端保持一致」靠的是每端各自的 `set`，而不是自动双向同步：一个键的值是谁最后写的，就以谁为准。

## 要点

- **名字要对上**：`AxonStore("docs-store", ...)` 与 `new AxonStore("docs-store")` 是同一份；名字不同就是两份独立数据。
- **读不需要 await**（JS 里 `store.get("k").get()` 是同步的），因为读的是本地副本。
- **不要拿它当消息队列**：它不保证事件顺序语义，需要「通知」请用[事件](/examples/event)。
- **值要能 JSON 序列化**：`dict` / `list` / 基本类型。
