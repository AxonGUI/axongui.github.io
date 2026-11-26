import { createHighlighter } from "shiki";
import { transformerTwoslash } from "@shikijs/twoslash";

const samples = {
  local: `const n = 1;
//    ^?`,
  pkgType: `import type { IAxonInitResult } from "axon-gui";
const s = null as unknown as IAxonInitResult;
//    ^?`,
};

const h = await createHighlighter({ themes: ["github-dark"], langs: ["ts"] });
for (const [name, code] of Object.entries(samples)) {
  try {
    const html = h.codeToHtml(code, { lang: "ts", theme: "github-dark", transformers: [transformerTwoslash()] });
    console.log(`[${name}] ok  data-lsp=${html.includes("data-lsp")} len=${html.length}`);
    const m = html.match(/aria-label="([^"]{0,120})"/);
    if (m) console.log(`   popup: ${m[1]}`);
  } catch (e) {
    console.log(`[${name}] FAIL ${e.message.split("\n").slice(0,3).join(" ")}`);
  }
}
