<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { connected, ensureAxon, getAxonLib, inbound } from "../axon";
import { useStrings, currentLang } from "../i18n";

/**
 * 跨窗口的「另一边」：列出当前开着哪些窗口，以及别的窗口调到这里的记录。
 * 只有客户端形态（连上 Python）才出现。
 */
const windows = ref<string[]>([]);
const strings = useStrings();
const isZh = currentLang() !== "en";
let timer: number | undefined;

async function poll() {
  try {
    const lib = await getAxonLib();
    windows.value = await lib.AxonCross.windows();
  } catch {
    /* 通道还没好 */
  }
}

onMounted(async () => {
  await ensureAxon();
  poll();
  timer = window.setInterval(poll, 1500);
});
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <div v-if="connected" class="cross-inbox" data-cross-inbox>
    <div class="cross-inbox__head">
      <span class="cross-inbox__label">{{ isZh ? "当前的窗口" : "Open windows" }}</span>
      <code v-for="name in windows" :key="name" class="cross-inbox__win" :class="{ 'is-charts': name === 'charts' }">{{ name }}</code>
      <span v-if="!windows.length" class="cross-inbox__empty">{{ isZh ? "（还没有）" : "(none)" }}</span>
    </div>
    <div class="cross-inbox__head">
      <span class="cross-inbox__label">{{ isZh ? "别的窗口调到我这里" : "Calls from other windows" }}</span>
      <span v-if="!inbound.length" class="cross-inbox__empty">
        {{ isZh ? "还没有 —— 点开 charts 窗口，在里面点「回调主窗口」" : "Nothing yet — open the charts window and hit \"call main\"" }}
      </span>
    </div>
    <ul v-if="inbound.length" class="cross-inbox__list">
      <li v-for="(entry, index) in inbound" :key="index" :class="`cross-inbox__item is-${entry.kind}`">
        <span class="cross-inbox__kind">{{ entry.kind === "call" ? (isZh ? "调用" : "call") : (isZh ? "事件" : "event") }}</span>
        <span class="cross-inbox__text">{{ entry.text }}</span>
        <span class="cross-inbox__at">{{ entry.at }}</span>
      </li>
    </ul>
  </div>
</template>
