# 本说明书：一个示例工程

你现在读的这个站点，本身就是用 Axon 做出来的一个完整工程：**同一份构建产物，既是普通静态网站，又能装进窗口变成一个可交互的桌面程序。**

它比任何玩具例子都更接近「真实项目」——有构建、有文档结构、有中英双语、有自己的 Python 后端。所以把它放在示例工程第一位，想抄结构的话照着它抄就行。

## 它由四部分组成

| 部分 | 位置 | 干什么 |
| --- | --- | --- |
| 站点内容 | `web/` | VitePress 写的说明文档，纯静态：`npm run docs:build` 出 HTML |
| 站点主题 | `web/.vitepress/theme/` | 判断有没有后端、渲染示例卡片、显示消息流 |
| Python 侧 | `controller/DemoController.py` | 页面能调的示例方法（加法、异步、超时、事件、Store…） |
| 窗口/打包 | `scripts/main.py`、`scripts/build_client.py` | 把同一个 `dist` 装进 `AxonGUI`，可选打成一个 exe |

四者的关系：主题里的 `ensureAxon()` 决定「现在有没有 Python 后端」，`demos.ts` 描述每个示例怎么跑，`DemoController` 提供 Python 那一半，最后 `scripts/main.py` 只是给这份网页套一个窗口。

## 三种打开方式

| 怎么打开 | 看到什么 |
| --- | --- |
| 直接访问 [GitHub Pages 版](https://axongui.github.io/) | 纯文档：代码、说明、目录都正常，没有任何「需要后端」的提示 |
| 下载 [AxonDocs 客户端](https://github.com/AxonGUI/axongui.github.io/releases/latest) | 每段示例下面多一个「▶ 运行这段示例」，点了真的调 Python，并逐条列出两端传了什么 |
| 本地 `python scripts/main.py` | 和客户端一样，只是窗口从你自己的环境起 |

前两种用的是**同一份** `dist`，没有两份代码。

## 关键代码：怎么判断有没有后端

```ts [theme/axon.ts]
import { ref } from "vue";

export const connected = ref(false);
export const statusDetail = ref("");
let booted: Promise<void> | null = null;

/** 整个页面只跑一次：连不上后端时保持 connected=false，不抛错、不重试循环 */
export function ensureAxon(): Promise<void> {
  if (booted) return booted;
  booted = (async () => {
    const lib = await import("axon-gui");        // 动态 import，静态托管时也只是多一个 js 文件
    const status = await lib.AxonInit();
    connected.value = status.ready;
    statusDetail.value = status.ready
      ? `通道对象：${status.objects.join(", ")}`
      : "纯文档模式：没有检测到 Python 后端";
  })();
  return booted;
}
```

`status.ready` 为假时**什么都不用做**：依赖后端的按钮压根不渲染（不是灰掉、不是提示「需要后端」）。

## 关键代码：示例卡片怎么只在连上时出现

```vue [theme/components/LiveDemo.vue]
<template>
  <section v-if="demo && connected" class="try-it" :data-demo-id="id">
    <button class="try-it__run" @click="run">▶ 运行这段示例</button>
    <ol class="live-demo__flow">
      <li v-for="entry in logs" :class="`entry entry--${entry.kind}`">…</li>
    </ol>
  </section>
</template>
```

- `v-if="connected"`：纯网页形态下整块不存在，DOM 里查不到按钮；
- `demos.ts` 里只有「怎么跑」，示例代码本身写在 markdown 里，读者看到的就是真跑的那段；
- 点一次按钮，`trace()` 会把「发出去什么 / 回来什么 / 花了多久」记成消息流。

## 照着自己做一个

1. 建一个 VitePress 站点（或者任何静态站），正常写文档；
2. 加一个 `ensureAxon()`：动态 `import("axon-gui")` 后 `await AxonInit()`，把 `connected` 存到全局；
3. 需要演示的地方写一个组件，`v-if="connected"` 才渲染按钮，点了调 `Axon.Xxx.yyy()`；
4. Python 侧写一个控制器（`@AxonController("AxonDocs")`），把示例方法放进去；
5. 想变成桌面程序时，`python scripts/main.py` 或 `scripts/build_client.py` 给它套个窗口——网页本身不用改。

前四步不需要 Axon 也能跑；**只有第五步才用到框架**。这也是为什么「双模式」被放在示例工程里，而不是当成框架能力来讲。

## 要点

- 静态站与桌面端共用一份 `dist`，不要为两边各写一套；
- 后端探测只做一次（`ensureAxon()` 幂等），别在每个组件里各调一遍 `AxonInit()`；
- 依赖后端的 UI 用 `v-if="connected"` 而不是「禁用 + 提示」，纯网页读者看到的就是一篇正常文档。
