<template>
  <div class="app-container">
    <!-- CRT 扫描线叠加层 -->
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

/* CRT 扫描线动画 */
@keyframes flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.95; }
  75% { opacity: 0.9; }
}

@keyframes jitter {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(1px, -1px); }
  50% { transform: translate(-1px, 1px); }
  75% { transform: translate(1px, 1px); }
}
</style>
