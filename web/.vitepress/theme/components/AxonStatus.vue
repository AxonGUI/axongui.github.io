<script setup lang="ts">
import { onMounted } from "vue";
import { connected, ensureAxon, statusDetail } from "../axon";
import { useStrings } from "../i18n";

const strings = useStrings();

onMounted(() => {
  ensureAxon();
});
</script>

<template>
  <!-- 只有真的连上 Python 后端时才出现；纯网页访问时这一条完全不存在 -->
  <div v-if="connected" class="axon-status is-live">
    <span class="dot" />
    <strong class="label">{{ strings.connected }}</strong>
    <span class="detail">{{ statusDetail }}</span>
  </div>
</template>
