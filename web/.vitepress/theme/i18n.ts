import { computed, toValue } from "vue";
import { useData } from "vitepress";

/** 文档站只有两种语言：根路径中文，/en/ 英文。 */
export type Lang = "zh" | "en";

export function useLang(): Lang {
  // VitePress 的 useData() 里 lang 可能是 ref（不同版本不一样），统一用 toValue 解开
  const lang = String(toValue((useData() as { lang?: unknown }).lang) ?? "");
  return lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

/** 不在组件里的模块（axon.ts）用这个：按当前 URL 判断语言。 */
export function currentLang(): Lang {
  if (typeof window === "undefined") return "zh";
  return /\/en(\/|$)/.test(window.location.pathname) ? "en" : "zh";
}

interface Strings {
  run: string;
  running: string;
  again: string;
  clear: string;
  hint: string;
  unknownDemo: string;
  demoFailed: string;
  connected: string;
  probing: string;
  objects: (list: string) => string;
  plainMode: string;
  downloadTitle: string;
  downloadBody: string;
  downloadWin: string;
  downloadLinux: string;
  downloadDismiss: string;
  connectFailed: (reason: string, error: string) => string;
  initFailed: (error: string) => string;
  dir: Record<string, string>;
  traceSent: (title: string) => string;
  traceBack: string;
  traceFailed: string;
  mirrorCalled: string;
  sleepEchoCalled: string;
  noteCalled: string;
  noteReply: (text: string) => string;
}

const zh: Strings = {
  run: "▶ 运行这段示例",
  running: "执行中…",
  again: "再跑一次",
  clear: "清空",
  hint: "真实调用 Python，下面逐条列出两端传了什么",
  unknownDemo: "未知示例",
  demoFailed: "示例本身出错",
  connected: "已连接 Python 后端",
  probing: "正在探测 Python 后端…",
  objects: (list) => `通道对象：${list}`,
  plainMode: "纯文档模式：没有检测到 Python 后端，示例按钮不可用",
  downloadTitle: "想点一下试试？",
  downloadBody: "下载桌面客户端，同一个页面就能真调 Python：",
  downloadWin: "Windows（免安装）",
  downloadLinux: "Linux（tar.gz）",
  downloadDismiss: "在网页看就行",
  connectFailed: (reason, error) => `连接失败（${reason}）：${error}`,
  initFailed: (error) => `初始化异常：${error}`,
  dir: { js2py: "JS → PY", py2js: "PY → JS", event: "事件", info: "本地", error: "异常" },
  traceSent: (title) => title,
  traceBack: "结果回到 JS",
  traceFailed: "调用失败：异常从 Python 传回 JS",
  mirrorCalled: "DocsJS.mirror() 被 Python 调用",
  sleepEchoCalled: "DocsJS.sleepEcho() 被 Python 调用",
  noteCalled: "DocsJS.note() 被广播调用",
  noteReply: (text) => `窗口收到: ${text}`,
};

const en: Strings = {
  run: "▶ Run this example",
  running: "Running…",
  again: "Run again",
  clear: "Clear",
  hint: "This really calls Python — every step below is what went over the wire",
  unknownDemo: "Unknown example",
  demoFailed: "The example itself failed",
  connected: "Python backend connected",
  probing: "Looking for the Python backend…",
  objects: (list) => `Channel objects: ${list}`,
  plainMode: "Documentation-only mode: no Python backend detected, live buttons stay hidden",
  downloadTitle: "Want to click through the examples?",
  downloadBody: "Grab the desktop client and the same pages call Python for real:",
  downloadWin: "Windows (no install)",
  downloadLinux: "Linux (tar.gz)",
  downloadDismiss: "Stay in the browser",
  connectFailed: (reason, error) => `Connection failed (${reason}): ${error}`,
  initFailed: (error) => `Initialisation failed: ${error}`,
  dir: { js2py: "JS → PY", py2js: "PY → JS", event: "event", info: "local", error: "error" },
  traceSent: (title) => title,
  traceBack: "Result came back to JS",
  traceFailed: "Call failed: the exception travelled from Python back to JS",
  mirrorCalled: "DocsJS.mirror() called from Python",
  sleepEchoCalled: "DocsJS.sleepEcho() called from Python",
  noteCalled: "DocsJS.note() called by broadcast",
  noteReply: (text) => `Window received: ${text}`,
};

const dict: Record<Lang, Strings> = { zh, en };

/** 组件里用：语言变了（切换语言会换一套组件树，但布局层可能留着）也能跟着更新。 */
export function useStrings() {
  return computed(() => dict[useLang()]);
}

export function stringsFor(lang: Lang): Strings {
  return dict[lang];
}
