import { createHighlighter } from "shiki";
import { transformerTwoslash, rendererRich } from "@shikijs/twoslash";
const code = `import type { IAxonInitResult } from "axon-gui";
const status = { mode: "web", connected: false, ready: false, objects: [] } as IAxonInitResult;
//                                                ^?`;
const h = await createHighlighter({ themes: ["github-dark"], langs: ["ts"] });
try {
  const html = h.codeToHtml(code, { lang: "ts", theme: "github-dark", transformers: [transformerTwoslash({ renderer: rendererRich() })] });
  const pops = [...html.matchAll(/twoslash-popup-code">([\s\S]*?)<\/code>/g)].map(m => m[1].replace(/<[^>]+>/g, ""));
  console.log("popups:", pops);
} catch (e) { console.log("FAIL", e.message.split("\n").slice(0,4).join(" | ")); }
