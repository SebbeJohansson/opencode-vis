<template>
  <LegacyApp />
</template>

<script setup lang="ts">
// Temporary: the monolithic App.vue is rendered as-is until it is decomposed
// into shell components and composables (see plan, Phase 3).
import LegacyApp from '~/LegacyApp.vue';

definePageMeta({ key: 'home' });
</script>
