<template>
  <div class="app-container">
    <div class="scanline-overlay flicker" style="opacity: 0.4;"></div>
    <router-view />
  </div>
</template>

<script setup>
</script>

<style>
@import '../shared-ui/styles.css';

.app-container {
  min-height: 100vh;
  background: var(--surface);
  color: var(--on-surface);
  font-family: 'Space Grotesk', 'Courier New', monospace, sans-serif;
  image-rendering: pixelated;
  overflow-x: hidden;
}

@keyframes flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.95; }
  75% { opacity: 0.9; }
}
</style>
