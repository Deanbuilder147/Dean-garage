<template>
  <div class="bg-hexpat" aria-hidden="true"></div>
</template>

<script>
export default {
  name: 'HexPatternBackground'
}
</script>

<style scoped>
/* 六边形花纹背景层：取自桌面「资源 2.svg」六角形集合花纹
   铺在 #app 底色之上、所有页面内容之下（fixed + z-index:0，DOM 顺序早于内容） */
.bg-hexpat {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  background: url('/hex-pattern.svg') center / cover no-repeat;
  opacity: var(--hexpat-opacity, 0.85);
  /* 原图六边形为 0.24 透明度的渐变，深底上需提亮才可见 */
  filter: brightness(2.4) contrast(1.4);
}
</style>
