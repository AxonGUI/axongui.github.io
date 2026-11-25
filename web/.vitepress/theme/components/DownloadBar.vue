<script setup lang="ts">
/**
 * 客户端下载引导条。
 *
 * 只在「纯网页」形态出现：连上 Python 后端（也就是已经跑在客户端里）时整条不存在，
 * 这也是判断「网站 / 客户端」的唯一依据 —— 不需要额外传参或 UA 判断。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { connected, ensureAxon, initializing } from "../axon";
import { useStrings } from "../i18n";

const strings = useStrings();
const DISMISS_KEY = "axon-download-dismissed";
const dismissed = ref(false);

const show = computed(
  () => !connected.value && !initializing.value && !dismissed.value,
);

const RELEASES = "https://github.com/AxonGUI/axongui.github.io/releases/latest/download";
const WIN_URL = `${RELEASES}/AxonDocs-windows-x64.zip`;
const LINUX_URL = `${RELEASES}/AxonDocs-linux-x64.tar.gz`;

// 固定底栏会覆盖正文底部，显示时给 body 加一点下边距
watch(
  show,
  (on) => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("has-axon-download", on);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof document !== "undefined") {
    document.body.classList.remove("has-axon-download");
  }
});

onMounted(() => {
  try {
    dismissed.value = localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    dismissed.value = false;
  }
  ensureAxon();
});

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* 隐私模式下写不进去也无所谓 */
  }
}
</script>

<template>
  <aside v-if="show" class="axon-download" aria-label="download">
    <div class="text">
      <strong>{{ strings.downloadTitle }}</strong>
      <span class="body">{{ strings.downloadBody }}</span>
    </div>
    <div class="actions">
      <a class="btn" :href="WIN_URL" rel="noopener">{{ strings.downloadWin }}</a>
      <a class="btn btn--ghost" :href="LINUX_URL" rel="noopener">{{ strings.downloadLinux }}</a>
      <button class="dismiss" type="button" @click="dismiss">
        {{ strings.downloadDismiss }}
      </button>
    </div>
  </aside>
</template>
