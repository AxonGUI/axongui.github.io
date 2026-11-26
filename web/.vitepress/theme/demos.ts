import { pushLog } from "./axon";
import { currentLang, stringsFor } from "./i18n";

/**
 * 一个可运行示例。
 *
 * 展示用的代码不在这里 —— 代码写在 markdown 里（带语法高亮、给人读），
 * 这里只保存「点一下运行」时真正要做的那次调用。
 */
export interface Demo {
  title: string;
  run: (lib: any) => Promise<string | void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 把一次真实调用记进消息流：发出时记入参，回来时记结果/异常与耗时。
 * 页面上「消息流」里的每一行都来自这里，不是文案模拟。
 */
async function trace<T>(
  title: string,
  payload: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const started = performance.now();
  const strings = stringsFor(currentLang());
  pushLog({ kind: "js2py", title: strings.traceSent(title), payload });
  try {
    const result = await fn();
    pushLog({
      kind: "js2py",
      title: strings.traceBack,
      result,
      ms: Math.round(performance.now() - started),
    });
    return result;
  } catch (err: any) {
    pushLog({
      kind: "error",
      title: strings.traceFailed,
      detail: String(err?.message ?? err),
      ms: Math.round(performance.now() - started),
    });
    return undefined;
  }
}

export const demos: Record<string, Demo> = {
  call: {
    title: "调用 Python 方法",
    run: async (lib) => {
      const result = await trace(
        "Axon.DemoController.add(2, 3)",
        { controller_id: "DemoController", func: "add", args: [2, 3], kwargs: {}, type: "call" },
        () => lib.Axon.DemoController.add(2, 3),
      );
      return result === undefined ? "" : `Python 返回 ${JSON.stringify(result)}`;
    },
  },

  kwargs: {
    title: "带关键字参数调用",
    run: async (lib) => {
      const payload = { b: 2, label: "hi" };
      const result = await trace(
        "Axon.DemoController.with_kwargs([1], { b: 2, label: 'hi' })",
        { controller_id: "DemoController", func: "with_kwargs", args: [1], kwargs: payload },
        () => lib.Axon.DemoController.with_kwargs([1], payload),
      );
      return result === undefined ? "" : `Python 收到关键字参数并返回 ${JSON.stringify(result)}`;
    },
  },

  async: {
    title: "调用 async 方法",
    run: async (lib) => {
      const result = await trace(
        "Axon.DemoController.delayed('hi', 300)",
        { controller_id: "DemoController", func: "delayed", args: ["hi", 300], kwargs: {} },
        () => lib.Axon.DemoController.delayed("hi", 300),
      );
      return result === undefined ? "" : `async 方法返回 ${JSON.stringify(result)}`;
    },
  },

  timeout: {
    title: "超时",
    run: async (lib) => {
      await trace(
        "Axon.DemoController.slow([1500], {}, 300)   ← 只等 300ms",
        { controller_id: "DemoController", func: "slow", args: [1500], kwargs: {}, timeout: 300 },
        () => lib.Axon.DemoController.slow([1500], {}, 300),
      );
      return "Python 那次 1500ms 的调用还在跑，只是 JS 侧不再等它。";
    },
  },

  error: {
    title: "Python 抛异常",
    run: async (lib) => {
      await trace(
        "Axon.DemoController.fail('manual')",
        { controller_id: "DemoController", func: "fail", args: ["manual"], kwargs: {} },
        () => lib.Axon.DemoController.fail("manual"),
      );
      return "Python 抛的 ValueError 已经变成 JS 侧的 rejected promise（消息见上），try/catch 就能接住。";
    },
  },

  property: {
    title: "读写 Python 属性",
    run: async (lib) => {
      const before = await trace(
        "await Axon.DemoController.counter   ← 读属性",
        { controller_id: "DemoController", prop: "counter", type: "get" },
        () => lib.Axon.DemoController.counter,
      );
      pushLog({
        kind: "info",
        title: "Axon.DemoController.counter = 42   ← 写属性（不等待返回）",
        payload: { value: 42, type: "set" },
      });
      lib.Axon.DemoController.counter = 42;
      await sleep(200);
      const after = await trace(
        "Axon.DemoController.get_counter()",
        { controller_id: "DemoController", func: "get_counter", args: [], kwargs: {} },
        () => lib.Axon.DemoController.get_counter(),
      );
      return `读到的值：${JSON.stringify(before)} → 写入 42 后：${JSON.stringify(after)}`;
    },
  },

  pyToJs: {
    title: "Python 调用 JS 方法",
    run: async (lib) => {
      const result = await trace(
        "Axon.DemoController.call_js_mirror({ hello: 'from python' })",
        {
          controller_id: "DemoController",
          func: "call_js_mirror",
          args: [{ hello: "from python" }],
        },
        () => lib.Axon.DemoController.call_js_mirror({ hello: "from python" }),
      );
      return result === undefined ? "" : `往返一圈后 JS 收到 ${JSON.stringify(result)}`;
    },
  },

  pyToJsProperty: {
    title: "Python 读写 JS 属性",
    run: async (lib) => {
      const read = await trace(
        "Axon.DemoController.read_js_value()",
        { controller_id: "DemoController", func: "read_js_value", args: [] },
        () => lib.Axon.DemoController.read_js_value(),
      );
      await trace(
        "Axon.DemoController.write_js_value(99)",
        { controller_id: "DemoController", func: "write_js_value", args: [99] },
        () => lib.Axon.DemoController.write_js_value(99),
      );
      await sleep(150);
      const again = await trace(
        "再读一次 read_js_value()",
        { controller_id: "DemoController", func: "read_js_value", args: [] },
        () => lib.Axon.DemoController.read_js_value(),
      );
      return `DocsJS.value：${JSON.stringify(read)} → 写入 99 → ${JSON.stringify(again)}`;
    },
  },

  eventPyToJs: {
    title: "Python 派发事件 → JS",
    run: async (lib) => {
      const received: unknown[] = [];
      const listener = (text: unknown) => {
        received.push(text);
        pushLog({ kind: "event", title: 'JS 收到事件 "demo:event"', payload: text });
      };
      lib.AxonEvent.addListener("demo:event", listener);
      await trace(
        "Axon.DemoController.push_event('hello from python')",
        { controller_id: "DemoController", func: "push_event", args: ["hello from python"] },
        () => lib.Axon.DemoController.push_event("hello from python"),
      );
      await sleep(300);
      lib.AxonEvent.removeListener("demo:event", listener);
      return received.length ? `JS 侧收到 ${JSON.stringify(received)}` : "没有收到事件";
    },
  },

  eventJsToPy: {
    title: "JS 派发事件 → Python",
    run: async (lib) => {
      await trace(
        "AxonEvent.dispatchPYEvent({ type: 'demo:pong', args: [1, 2, 3] })",
        { type: "demo:pong", args: [1, 2, 3] },
        () => lib.AxonEvent.dispatchPYEvent({ type: "demo:pong", args: [1, 2, 3] }),
      );
      await sleep(200);
      const result = await trace(
        "Axon.DemoController.get_pong()   ← 回查 Python 收到什么",
        { controller_id: "DemoController", func: "get_pong", args: [] },
        () => lib.Axon.DemoController.get_pong(),
      );
      return `Python 记录到的事件参数：${JSON.stringify(result)}`;
    },
  },

  stream: {
    title: "长任务进度推送",
    run: async (lib) => {
      const steps: unknown[] = [];
      const listener = (data: unknown) => {
        steps.push(data);
        pushLog({ kind: "event", title: 'JS 收到进度事件 "demo:progress"', payload: data });
      };
      lib.AxonEvent.addListener("demo:progress", listener);
      const result = await trace(
        "Axon.DemoController.stream(4)",
        { controller_id: "DemoController", func: "stream", args: [4] },
        () => lib.Axon.DemoController.stream(4),
      );
      await sleep(300);
      lib.AxonEvent.removeListener("demo:progress", listener);
      return `收到 ${steps.length} 条进度事件；最终返回 ${JSON.stringify(result)}`;
    },
  },

  store: {
    title: "跨端 Store",
    run: async (lib) => {
      const store = new lib.AxonStore("docs-store");
      const written = "from-js-" + Math.random().toString(36).slice(2, 7);
      pushLog({
        kind: "js2py",
        title: "store.set('docs:key', ...)   ← Python 侧同步收到",
        payload: { value: written },
      });
      store.set("docs:key", written);
      await sleep(200);
      const seenByPy = await trace(
        "Axon.DemoController.store_read('docs:key')",
        { controller_id: "DemoController", func: "store_read", args: ["docs:key"] },
        () => lib.Axon.DemoController.store_read("docs:key"),
      );
      await trace(
        "Axon.DemoController.store_write('docs:key2', 'from-py')",
        { controller_id: "DemoController", func: "store_write", args: ["docs:key2", "from-py"] },
        () => lib.Axon.DemoController.store_write("docs:key2", "from-py"),
      );
      await sleep(250);
      const back = store.get("docs:key2").get();
      pushLog({
        kind: "py2js",
        title: "Python 写入后，JS 侧读到",
        payload: { "docs:key2": back },
      });
      return `JS 写入 ${JSON.stringify(written)}，Python 读到 ${JSON.stringify(
        seenByPy,
      )}；Python 写 docs:key2，JS 读到 ${JSON.stringify(back)}`;
    },
  },

  magicgui: {
    title: "回到 Qt 主线程执行",
    run: async (lib) => {
      const result = await trace(
        "Axon.DemoController.magic_gui()",
        { controller_id: "DemoController", func: "magic_gui", args: [] },
        () => lib.Axon.DemoController.magic_gui(),
      );
      return `是否在 Qt 主线程执行：${JSON.stringify(result)}`;
    },
  },

  asset: {
    title: "二进制走 URL",
    run: async (lib) => {
      const url = await trace(
        "Axon.DemoController.blob(2000000)",
        { controller_id: "DemoController", func: "blob", args: [2000000] },
        () => lib.Axon.DemoController.blob(2000000),
      );
      const t0 = performance.now();
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const ms = Math.round(performance.now() - t0);
      pushLog({
        kind: "info",
        title: `fetch(axon://) → ${buf.byteLength.toLocaleString()} 字节，${ms}ms`,
        detail: "这条 URL 由 Python 登记，数据没经过通道",
        result: { url, mime: res.headers.get("content-type"), ms },
      });
      return `${(buf.byteLength / 1e6).toFixed(1)} MB 从 axon:// 取回，耗时 ${ms}ms`;
    },
  },

  broadcast: {
    title: "广播到所有窗口",
    run: async (lib) => {
      const result = await trace(
        "Axon.DemoController.broadcast('hi from js')",
        { controller_id: "DemoController", func: "broadcast", args: ["hi from js"] },
        () => lib.Axon.DemoController.broadcast("hi from js"),
      );
      return `收到回执的窗口：${JSON.stringify(result)}`;
    },
  },

  crossOpen: {
    title: "打开第二个窗口",
    run: async (lib) => {
      const windows = await trace(
        "Axon.DemoController.cross_open()",
        { controller_id: "DemoController", func: "cross_open", args: [] },
        () => lib.Axon.DemoController.cross_open(),
      );
      const t0 = performance.now();
      let now: string[] = Array.isArray(windows) ? windows : [];
      while (performance.now() - t0 < 8000) {
        try {
          now = await lib.AxonCross.windows();
        } catch {
          /* 通道还没好，继续等 */
        }
        if (now.includes("charts")) break;
        await sleep(120);
      }
      const ms = Math.round(performance.now() - t0);
      pushLog({
        kind: "info",
        title: `AxonCross.windows() → ${JSON.stringify(now)}`,
        detail: "第二个窗口已连上，接下来可以点名调它",
        ms,
      });
      return `窗口：${now.join(" / ")}`;
    },
  },

  crossCall: {
    title: "点名调用另一个窗口",
    run: async (lib) => {
      const text = "来自 AxonDocs 的跨窗口调用";
      const result = await trace(
        'AxonCross.web("charts").Peer.ping(text)',
        { web: "charts", controller: "Peer", func: "ping", args: [text] },
        () => lib.AxonCross.web("charts").Peer.ping(text),
      );
      pushLog({
        kind: "info",
        title: "charts 窗口的回执",
        result,
        detail: "charts 是独立的演示页（/demo/cross-window.html），它那边的日志列表会多出一条",
      });
      return `charts 回：${JSON.stringify(result)}`;
    },
  },

  crossBroadcast: {
    title: "广播到所有窗口",
    run: async (lib) => {
      const text = "广播：所有窗口都该收到";
      const result = await trace(
        'AxonCross.broadcast({ controller: "DocsJS", func: "note" })',
        { controller: "DocsJS", func: "note", args: [text] },
        () => lib.Axon.DemoController.cross_broadcast(text),
      );
      return `每个窗口的回执：${JSON.stringify(result)}`;
    },
  },

  crossEmit: {
    title: "发事件给所有窗口",
    run: async (lib) => {
      const windows = await trace(
        'Axon.DemoController.cross_emit("事件：来自 AxonDocs")',
        { controller_id: "DemoController", func: "cross_emit", args: ["事件：来自 AxonDocs"] },
        () => lib.Axon.DemoController.cross_emit("事件：来自 AxonDocs"),
      );
      return `已发给：${JSON.stringify(windows)}（谁监听谁处理，不等回执）`;
    },
  },

  crossClose: {
    title: "关掉第二个窗口",
    run: async (lib) => {
      const windows = await trace(
        "Axon.DemoController.cross_close()",
        { controller_id: "DemoController", func: "cross_close", args: [] },
        () => lib.Axon.DemoController.cross_close(),
      );
      return `现在只剩：${JSON.stringify(windows)}`;
    },
  },
};
