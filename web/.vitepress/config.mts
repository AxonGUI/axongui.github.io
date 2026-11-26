import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitepress";
import { createHighlighter } from "shiki";
import { transformerTwoslash, rendererRich } from "@shikijs/twoslash";

// twoslash：给带 `// ^?` 查询的代码块生成「悬停看类型」的标记。
// VitePress 的 markdown.codeTransformers 在这条构建链上没有传进 highlight，
// 所以这里自己起一个 highlighter，只处理被标记了 `twoslash` 的块。
let twoslashHighlighter: Promise<any> | undefined;
function getTwoslashHighlighter() {
  twoslashHighlighter ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: ["ts", "typescript", "js", "javascript"],
  });
  return twoslashHighlighter;
}

// GitHub Pages 的项目站点挂在 /<repo>/ 下, 本地/自托管又应该在根路径。
// 用 DOCS_BASE 环境变量切换, 免得为部署单独维护一份配置。
const base = process.env.DOCS_BASE || "/";

// 两种语言: 根路径中文, /en/ 英文。页面文件分别在 docs/web/ 与 docs/web/en/。
const sidebarZh = [
  {
    text: "开始",
    items: [
      { text: "什么是 Axon", link: "/guide/what-is-axon" },
      { text: "快速开始", link: "/guide/quickstart" },
      { text: "架构与消息流", link: "/guide/architecture" },
      { text: "类型补全", link: "/guide/type-generation" },
      { text: "无边框窗口与自绘标题栏", link: "/guide/window-chrome" },
    ],
  },
  {
    text: "可交互示例",
    items: [
      {
        text: "基础",
        collapsed: false,
        items: [
          { text: "调用 Python 方法", link: "/examples/call" },
          { text: "读写 Python 属性", link: "/examples/property" },
          { text: "从 Python 调 JS", link: "/examples/py-to-js" },
          { text: "事件（两个方向）", link: "/examples/event" },
        ],
      },
      {
        text: "进阶",
        collapsed: false,
        items: [
          { text: "跨端键值（Store）", link: "/examples/store" },
          { text: "魔法窗口（调 Qt UI）", link: "/examples/magicgui" },
          { text: "广播（发往所有窗口）", link: "/examples/broadcast" },
          { text: "跨窗口交互", link: "/examples/multi-window" },
          { text: "大块数据（文件 / 二进制）", link: "/examples/assets" },
        ],
      },
    ],
  },
  {
    text: "示例工程",
    items: [
      { text: "本说明书（第一个示例工程）", link: "/projects/docs-site" },
      { text: "双模式（有后端 / 没后端）", link: "/projects/dual-mode" },
    ],
  },
  {
    text: "API",
    items: [
      { text: "JavaScript 端", link: "/api/javascript" },
      { text: "Python 端", link: "/api/python" },
    ],
  },
  {
    text: "附录",
    items: [
      { text: "接口验证记录", link: "/notes/verified" },
      { text: "已知坑与修复", link: "/notes/pitfalls" },
    ],
  },

];

const sidebarEn = [
  {
    text: "Getting started",
    items: [
      { text: "What is Axon", link: "/en/guide/what-is-axon" },
      { text: "Quickstart", link: "/en/guide/quickstart" },
      { text: "Architecture & message flow", link: "/en/guide/architecture" },
      { text: "Type generation", link: "/en/guide/type-generation" },
      { text: "Frameless window & custom title bar", link: "/en/guide/window-chrome" },
    ],
  },
  {
    text: "Live examples",
    items: [
      { text: "Calling Python", link: "/en/examples/call" },
      { text: "Reading & writing properties", link: "/en/examples/property" },
      { text: "Calling JS from Python", link: "/en/examples/py-to-js" },
      { text: "Events", link: "/en/examples/event" },
      { text: "Cross-side store", link: "/en/examples/store" },
      { text: "Magic window (Qt UI)", link: "/en/examples/magicgui" },
      { text: "Broadcast (all windows)", link: "/en/examples/broadcast" },
      { text: "Cross-window interaction", link: "/en/examples/multi-window" },
      { text: "Big data (files / binary)", link: "/en/examples/assets" },
    ],
  },
  {
    text: "API",
    items: [
      { text: "JavaScript side", link: "/en/api/javascript" },
      { text: "Python side", link: "/en/api/python" },
    ],
  },
  {
    text: "Appendix",
    items: [
      { text: "Verification records", link: "/en/notes/verified" },
      { text: "Known pitfalls", link: "/en/notes/pitfalls" },
    ],
  },
  {
    text: "Example projects",
    items: [
      { text: "This documentation site", link: "/en/projects/docs-site" },
      { text: "Dual mode (with / without backend)", link: "/en/projects/dual-mode" },
    ],
  },
];

export default defineConfig({
  base,
  title: "Axon",
  cleanUrls: true,
  // 每页底部显示「最后更新」：取 git 提交时间, CI 里 checkout 需要 fetch-depth: 0
  lastUpdated: true,
  head: [["link", { rel: "icon", href: `${base}favicon.svg` }]],
  locales: {
    root: {
      label: "简体中文",
      lang: "zh-CN",
      description: "用 Python 写后端、用 Web 写界面的混合桌面框架",
      themeConfig: {
        // 统一的项目标记: 与 exe/窗口图标、模板页 favicon 同一个母版 assets/axon-mark.svg
        logo: "/favicon.svg",
        siteTitle: "Axon",
        nav: [
          { text: "首页", link: "/" },
          { text: "指南", link: "/guide/quickstart" },
          { text: "可交互示例", link: "/examples/call" },
          { text: "API", link: "/api/javascript" },
        ],
        socialLinks: [
          { icon: "github", link: "https://github.com/AxonGUI/Axon", ariaLabel: "GitHub 仓库" },
        ],
        sidebar: sidebarZh,
        outline: { label: "本页目录", level: [2, 3] },
        docFooter: { prev: "上一页", next: "下一页" },
        darkModeSwitchLabel: "主题",
        sidebarMenuLabel: "目录",
        returnToTopLabel: "回到顶部",
        lastUpdated: { text: "最后更新" },
        editLink: {
          pattern: "https://github.com/AxonGUI/Axon/edit/main/docs/web/:path",
          text: "在 GitHub 上编辑此页",
        },
        search: { provider: "local" },
      },
    },
    en: {
      label: "English",
      lang: "en-US",
      link: "/en/",
      description: "Write the backend in Python, the interface in HTML/CSS/JS.",
      themeConfig: {
        logo: "/favicon.svg",
        siteTitle: "Axon",
        nav: [
          { text: "Home", link: "/en/" },
          { text: "Guide", link: "/en/guide/quickstart" },
          { text: "Live examples", link: "/en/examples/call" },
          { text: "API", link: "/en/api/javascript" },
        ],
        socialLinks: [
          { icon: "github", link: "https://github.com/AxonGUI/Axon", ariaLabel: "GitHub repository" },
        ],
        sidebar: sidebarEn,
        outline: { label: "On this page", level: [2, 3] },
        docFooter: { prev: "Previous", next: "Next" },
        darkModeSwitchLabel: "Appearance",
        sidebarMenuLabel: "Menu",
        returnToTopLabel: "Return to top",
        lastUpdated: { text: "Last updated" },
        editLink: {
          pattern: "https://github.com/AxonGUI/Axon/edit/main/docs/web/:path",
          text: "Edit this page on GitHub",
        },
        search: { provider: "local" },
      },
    },
  },
  markdown: {
    // 这里做两件 VitePress 2.0.0-alpha.21 下走不通的事：
    //   1. 代码块文件名栏（```` ```ts [app.ts] ````）—— alpha.21 的 preWrapper 会先把方括号删掉，
    //      挂在 md.renderer.rules.fence 上的钩子拿不到；改成渲染前改源码、渲染后拼回来。
    //   2. twoslash 类型悬停（带 `twoslash` 标记 + `// ^?` 查询）—— markdown.codeTransformers
    //      在这条链上没有生效，自己在渲染前用 shiki + twoslash 生成好 HTML 再塞回去。
    async config(md: any) {
      const esc = (v: string) =>
        v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

      const FENCE = /^(`{3,})\s*(.*)$/;
      const SLOT = (i: number) => `<div data-axon-slot="${i}"></div>`;

      async function prepare(src: string) {
        const lines = src.split("\n");
        const out: string[] = [];
        const slots: string[] = [];
        let inGroup = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          if (/^:::\s*code-group\s*$/.test(line.trim())) inGroup = true;
          else if (inGroup && /^:::\s*$/.test(line.trim())) inGroup = false;

          const m = FENCE.exec(line);
          if (!m) {
            out.push(line);
            continue;
          }
          const fence = m[1]!;
          const info = m[2]!.trim();
          const body: string[] = [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            const l = lines[j]!;
            if (l.trim().startsWith(fence) && l.trim().replace(/`+$/, "") === "") break;
            body.push(l);
          }
          const code = body.join("\n");
          i = j;

          if (!inGroup) {
            const bracket = /\[([^\]]+)\]\s*$/.exec(info);
            if (bracket) {
              // 前后留空行：CommonMark 的 HTML block 在空行处结束，
              // 否则下一行的 ``` 会被吞进 HTML block 里（Vue 会当作真标签解析）。
              out.push("", `<div class="axon-file">${esc(bracket[1]!)}</div>`, "");
              out.push(fence + " " + info.replace(/\s*\[[^\]]+\]\s*$/, ""));
              out.push(...body, fence);
              continue;
            }
          }
          if (/\btwoslash\b/.test(info)) {
            const html = await renderTwoslashBlock(code);
            slots.push(html);
            out.push("", SLOT(slots.length - 1), "");
            continue;
          }
          out.push(line, ...body, fence);
        }
        return { src: out.join("\n"), slots };
      }

      async function renderTwoslashBlock(code: string) {
        const hl = await getTwoslashHighlighter();
        return hl.codeToHtml(code, {
          lang: "ts",
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
          transformers: [
            transformerTwoslash({
              explicitTrigger: false,
              throws: false,
              // 用富文本渲染器：浮层内容直接内联进 HTML，不依赖 floating-vue 的运行时插槽
              renderer: rendererRich(),
            }),
          ],
        });
      }

      const render = md.render.bind(md);
      const renderAsync = md.renderAsync?.bind(md);

      if (renderAsync) {
        md.renderAsync = async (src: string, env: any) => {
          const { src: next, slots } = await prepare(src);
          let html = await renderAsync(next, env);
          slots.forEach((slot, idx) => {
            html = html.replace(SLOT(idx), slot);
          });
          return html;
        };
      }
      md.render = (src: string, env: any) => {
        // 同步渲染（摘要、SSR 里的个别入口）不支持 twoslash，只处理文件名栏
        const { src: next, slots } = { src, slots: [] as string[] };
        return render(next, env);
      };
    },
  },
  vite: {
    // 文档站消费的 axon-gui 就是 npm 上的发布版 —— 跟用户装到的完全一致。
    optimizeDeps: {
      include: ["qwebchannel/qwebchannel.js", "promise-retry", "uuid"],
    },
  },
});
