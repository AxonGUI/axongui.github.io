<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import AxonStatus from "./components/AxonStatus.vue";
import DownloadBar from "./components/DownloadBar.vue";

const { Layout: DefaultLayout } = DefaultTheme;
</script>

<template>
  <DefaultLayout>
    <template #layout-top>
      <AxonStatus />
      <DownloadBar />
    </template>
  </DefaultLayout>
</template>
