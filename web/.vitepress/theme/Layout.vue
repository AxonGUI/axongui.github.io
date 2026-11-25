<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import AxonStatus from "./components/AxonStatus.vue";

const { Layout: DefaultLayout } = DefaultTheme;
</script>

<template>
  <DefaultLayout>
    <template #layout-top>
      <AxonStatus />
    </template>
  </DefaultLayout>
</template>
