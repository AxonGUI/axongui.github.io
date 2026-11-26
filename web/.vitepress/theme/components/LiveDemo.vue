<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  connected,
  ensureAxon,
  getAxonLib,
  pushLog,
  setActiveSink,
  type LogEntry,
} from "../axon";
import { demos } from "../demos";
import { useStrings } from "../i18n";

/**
 * 页面上的一段示例代码旁边挂一个「运行」入口。
 *
 * 只在通道连上的时候渲染 —— 纯网页访问时这里什么都不出现，
 * 页面就是一份普通文档；用桌面客户端打开时才多出一个按钮。
 */
const props = defineProps<{ id: string }>();
const demo = computed(() => demos[props.id]);
const strings = useStrings();

const entries = ref<LogEntry[]>([]);
const running = ref(false);
const summary = ref("");
const expanded = ref(false);

onMounted(() => {
  ensureAxon();
});

async function run() {
  if (running.value || !demo.value) return;
  entries.value = [];
  summary.value = "";
  expanded.value = true;
  running.value = true;
  setActiveSink((entry) => entries.value.push(entry));
  try {
    const lib = await getAxonLib();
    const text = await demo.value.run(lib);
    if (text) summary.value = text;
  } catch (err: any) {
    console.error("[demo]", props.id, err);
    pushLog({
      kind: "error",
      title: strings.value.demoFailed,
      detail: String(err?.message ?? err),
    });
  } finally {
    setActiveSink(null);
    running.value = false;
  }
}

function reset() {
  entries.value = [];
  summary.value = "";
  expanded.value = false;
}

const directionLabel = computed<Record<string, string>>(() => strings.value.dir);
</script>

<template>
  <div v-if="demo && connected" class="try-it" :data-demo-id="id">
    <div class="try-it__bar">
      <!-- 始终是同一个按钮: 运行中只改文案, 不要替换节点（外部脚本要能等它恢复） -->
      <button class="try-it__run" :class="{ 'try-it__run--ghost': expanded }" :disabled="running" @click="run">
        {{ running ? strings.running : expanded ? strings.again : `▶ ${demo.title}` }}
      </button>
      <button v-if="expanded" class="try-it__reset" :disabled="running" @click="reset">
        {{ strings.clear }}
      </button>
      <span class="try-it__hint">{{ demo.hint || strings.hint }}</span>
    </div>

    <ol v-if="entries.length" class="live-demo__flow">
      <li v-for="(entry, index) in entries" :key="index" :class="`entry entry--${entry.kind}`">
        <div class="entry__head">
          <span class="entry__dir">{{ directionLabel[entry.kind] ?? entry.kind }}</span>
          <span class="entry__title">{{ entry.title }}</span>
          <span v-if="entry.ms !== undefined" class="entry__ms">{{ entry.ms }} ms</span>
        </div>
        <pre v-if="entry.payload !== undefined" class="entry__json">{{
          JSON.stringify(entry.payload, null, 2)
        }}</pre>
        <pre v-if="entry.result !== undefined" class="entry__json entry__json--result">{{
          JSON.stringify(entry.result, null, 2)
        }}</pre>
        <p v-if="entry.detail" class="entry__detail">{{ entry.detail }}</p>
      </li>
    </ol>

    <p v-if="summary" class="live-demo__summary-out">✓ {{ summary }}</p>
  </div>
  <p v-else-if="demo === undefined" class="live-demo__offline">
    {{ strings.value.unknownDemo }}: {{ id }}
  </p>
</template>
