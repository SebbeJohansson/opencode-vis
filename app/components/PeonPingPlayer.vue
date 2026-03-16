<template>
  <audio ref="audioEl" preload="none" style="display: none" />
</template>

<script setup lang="ts">
import { ref, watchEffect, onUnmounted } from 'vue';
import { useSettings } from '../composables/useSettings';

const { peonPingEnabled, peonPingUrl } = useSettings();
const audioEl = ref<HTMLAudioElement | null>(null);

watchEffect(() => {
  const el = audioEl.value;
  if (!el) return;

  const enabled = peonPingEnabled.value;
  const url = peonPingUrl.value.trim();

  if (enabled && url) {
    if (el.src !== url) {
      el.src = url;
    }
    el.play().catch(() => {
      // Autoplay was blocked by the browser — user interaction required.
      // Silently ignore; the audio will begin once the user interacts with the page.
    });
  } else {
    el.pause();
    el.src = '';
  }
});

onUnmounted(() => {
  const el = audioEl.value;
  if (el) {
    el.pause();
    el.src = '';
  }
});
</script>
