import { ref } from "vue";
import { currentLang, stringsFor } from "./i18n";

/**
 * 文档站的 Axon 运行时状态。
 *
 * 同一份页面既可以在普通浏览器里当纯说明书（AxonInit 返回 connected:false），
 * 也可以在 AxonGUI 窗口里当可交互示例（通道连通后按钮可直接调 Python）。
 */
export type LogKind = "js2py" | "py2js" | "event" | "info" | "error";

export interface LogEntry {
  kind: LogKind;
  title: string;
  detail?: string;
  payload?: unknown;
  result?: unknown;
  ms?: number;
}

export const connected = ref(false);
export const initializing = ref(true);
export const statusDetail = ref(stringsFor(currentLang()).probing);
export const logs = ref<LogEntry[]>([]);

let libModule: any = null;
let initPromise: Promise<boolean> | null = null;
let activeSink: ((entry: LogEntry) => void) | null = null;

export function setActiveSink(sink: ((entry: LogEntry) => void) | null) {
  activeSink = sink;
}

export function pushLog(entry: LogEntry) {
  logs.value = [...logs.value, entry].slice(-80);
  activeSink?.(entry);
}

export function clearLogs() {
  logs.value = [];
}

/** 页面里替 Python 端准备的一个 JS 控制器，用来演示 Python → JS 方向。 */
function createDocsJsController() {
  return {
    value: 7,
    mirror(payload: unknown) {
      pushLog({
        kind: "py2js",
        title: stringsFor(currentLang()).mirrorCalled,
        payload,
      });
      return { mirrored: payload, at: new Date().toISOString() };
    },
    async sleepEcho(payload: unknown, ms: number) {
      pushLog({
        kind: "py2js",
        title: stringsFor(currentLang()).sleepEchoCalled,
        payload: { payload, ms },
      });
      await new Promise((resolve) => setTimeout(resolve, Math.min(Number(ms) || 0, 5000)));
      return `slept ${ms}ms`;
    },
    note(text: unknown) {
      const strings = stringsFor(currentLang());
      pushLog({ kind: "py2js", title: strings.noteCalled, payload: text });
      return strings.noteReply(String(text));
    },
  };
}

export async function getAxonLib(): Promise<any> {
  if (!libModule) {
    libModule = await import("axon-gui");
    libModule.AxonController.register("DocsJS", createDocsJsController());
    // 跨窗口事件：别的窗口 AxonCross.emit("demo:cross", …) 打过来时记一条
    libModule.AxonEvent.addListener("demo:cross", (text: unknown) => {
      pushLog({
        kind: "event",
        title: "收到跨窗口事件 demo:cross",
        payload: text,
        detail: "由另一个窗口经 Python 转发过来",
      });
    });
  }
  return libModule;
}

/** 初始化（幂等）。返回是否处于「已连上 Python」模式。 */
export function ensureAxon(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const lib = await getAxonLib();
      const status = await lib.AxonInit();
      connected.value = !!status.ready;
      const strings = stringsFor(currentLang());
      if (status.ready) {
        const join = currentLang() === "en" ? ", " : "、";
        statusDetail.value = strings.objects((status.objects ?? []).join(join));
      } else if (status.reason === "no-qt-transport") {
        statusDetail.value = strings.plainMode;
      } else {
        statusDetail.value = strings.connectFailed(
          status.reason ?? "unknown",
          String(status.error ?? ""),
        );
      }
      // 给自动化验证脚本一个会合点（普通浏览器里同样存在，只是 connected=false）
      (globalThis as any).__axonDocs = {
        connected: connected.value,
        status: statusDetail.value,
      };
      return connected.value;
    } catch (err: any) {
      connected.value = false;
      statusDetail.value = stringsFor(currentLang()).initFailed(String(err?.message || err));
      return false;
    } finally {
      initializing.value = false;
    }
  })();
  return initPromise;
}
