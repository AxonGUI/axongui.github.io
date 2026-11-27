<script setup lang="ts">
import { onMounted } from "vue";
import { installHoverPopup } from "./hover-popup";
import DefaultTheme from "vitepress/theme";
import AxonStatus from "./components/AxonStatus.vue";
import DownloadBar from "./components/DownloadBar.vue";

const { Layout: DefaultLayout } = DefaultTheme;

onMounted(() => installHoverPopup());
</script>

<template>
  <DefaultLayout>
    <template #layout-top>
      <AxonStatus />
      <DownloadBar />
    </template>
  </DefaultLayout>
</template>
