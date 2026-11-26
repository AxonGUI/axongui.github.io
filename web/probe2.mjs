import { createHighlighter } from "shiki";
import { transformerTwoslash, rendererRich } from "@shikijs/twoslash";

const code = `import type { IAxonInitResult } from "axon-gui";
const status = null as unknown as IAxonInitResult;
//    ^?`;
const h = await createHighlighter({ themes: ["github-dark"], langs: ["ts"] });
const html = h.codeToHtml(code, {
  lang: "ts", theme: "github-dark",
  transformers: [transformerTwoslash({ renderer: rendererRich() })],
});
console.log("data-lsp:", html.includes("data-lsp"));
const m = html.match(/data-lsp[^>]*>([^<]+)</);
console.log("token:", m && m[1]);
const lsp = html.match(/lsp="([^"]+)"/g);
console.log("lsp attrs:", lsp && lsp.slice(0,2));
