<template>
  <div class="crt-scanlines"></div>
</template>

<script>
export default {
  name: 'CRTScanlines'
}
</script>

<style scoped>
.crt-scanlines {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-scanlines);
  background: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.03) 0px,
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px,
    transparent 3px
  );
}
</style>
