import fs from "node:fs";
import path from "node:path";
import { createHighlighter } from "shiki";
import { transformerTwoslash, rendererRich } from "@shikijs/twoslash";

const ROOT = path.resolve(".");
const hl = await createHighlighter({ themes: ["github-light","github-dark"], langs: ["ts","js"] });
const FENCE = /^(`{3,})\s*(.*)$/;

function blocks(src) {
  const lines = src.split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i]);
    if (!m) continue;
    const fence = m[1], info = m[2].trim(), body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim().startsWith(fence) && l.trim().replace(/`+$/, "") === "") break;
      body.push(l);
    }
    out.push({ line: i + 1, info, code: body.join("\n") });
    i = j;
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".vitepress" || e.name === "public") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

let okCount = 0, tried = 0;
for (const file of walk(ROOT).sort()) {
  const src = fs.readFileSync(file, "utf8");
  for (const b of blocks(src)) {
    if (!/^(ts|js|typescript|javascript)\b/.test(b.info)) continue;
    if (/\btwoslash\b/.test(b.info)) continue;
    tried++;
    try {
      const html = hl.codeToHtml(b.code, {
        lang: b.info.startsWith("ts") || b.info.startsWith("typescript") ? "ts" : "js",
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: false,
        transformers: [transformerTwoslash({ explicitTrigger: false, throws: true, renderer: rendererRich() })],
      });
      const spanCount = (html.match(/twoslash-hover/g) || []).length;
      // 太短的片段（<2 个可悬停 token）意义不大
      if (spanCount >= 2) {
        okCount++;
        console.log(`OK  ${path.relative(ROOT, file)}:${b.line}  tokens=${spanCount}  info="${b.info}"`);
      }
    } catch {
      /* 片段不完整，跳过 */
    }
  }
}
console.log(`\n可标注 ${okCount} / 尝试 ${tried}`);
