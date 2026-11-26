// 把 axon-gui 的 UMD 产物拷进 public/vendor/，给独立演示页（非 VitePress 页面）用。
// 构建时执行：node scripts/copy-vendor.mjs
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const src = resolve(root, "node_modules/axon-gui/dist/axon.umd.cjs");
const dest = resolve(root, "public/vendor/axon.umd.cjs");

if (!existsSync(src)) {
  console.error(`[vendor] 找不到 ${src}，先 npm install`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[vendor] axon.umd.cjs -> ${dest.replace(root + "/", "")}`);
