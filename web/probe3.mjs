import { createHighlighter } from "shiki";
import { transformerTwoslash, rendererRich } from "@shikijs/twoslash";
const code = `const n = 1;
//    ^?`;
const h = await createHighlighter({ themes: ["github-dark"], langs: ["ts"] });
const html = h.codeToHtml(code, { lang: "ts", theme: "github-dark", transformers: [transformerTwoslash({ renderer: rendererRich() })] });
console.log(html);
