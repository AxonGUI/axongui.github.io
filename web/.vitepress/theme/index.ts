import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import LiveDemo from "./components/LiveDemo.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // 直接在 markdown 里用 <LiveDemo id="call" />
    app.component("LiveDemo", LiveDemo);
  },
} satisfies Theme;
