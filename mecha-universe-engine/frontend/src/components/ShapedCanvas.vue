<template>
  <!--
    ShapedCanvas — 异形 Canvas 容器（骨架版）
    用途：把任意 canvas 组件（如 HexGridCanvasEngine）裁切为不规则形状显示框。
    实现：
      1. 内层 slot 内容用 clip-path: polygon(...) 裁切为异形（canvas 仍按自身尺寸绘制，超出部分被裁）
      2. SVG overlay 用同一份 points 描边，作为装饰边框（vector-effect 防止拉伸变形）
      3. 阴影用 CSS filter: drop-shadow 程序二次添加（符合「阴影程序化」约定）
    注意：canvas 渲染内核的尺寸由自身逻辑控制，本组件只裁切、不拉伸。
  -->
  <div
    class="shaped-canvas"
    :class="{ 'sc-glow': glow }"
    :style="rootStyle"
  >
    <div class="sc-clip" :style="{ clipPath: clipPoly, WebkitClipPath: clipPoly }">
      <div class="sc-hit" :style="{ clipPath: clipPoly, WebkitClipPath: clipPoly }">
        <slot />
      </div>
    </div>

    <svg
      class="sc-border"
      :viewBox="`0 0 ${viewBoxW} ${viewBoxH}`"
      preserveAspectRatio="none"
      :style="{ stroke: strokeColor }"
    >
      <polygon
        :points="rawPoints"
        fill="none"
        :stroke-width="strokeWidth"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 原始 polygon points（"x y x y ..."，与 viewBox 同坐标系）
  rawPoints: { type: String, required: true },
  viewBoxW: { type: Number, required: true },
  viewBoxH: { type: Number, required: true },
  // 描边
  strokeColor: { type: String, default: 'rgba(255,255,255,0.85)' },
  strokeWidth: { type: Number, default: 1 },
  // 是否程序化加阴影
  glow: { type: Boolean, default: true },
  glowColor: { type: String, default: 'rgba(255,176,0,0.45)' },
  // 宽高比（保持形状比例，避免畸变）
  aspectRatio: { type: String, default: '' },
  // fill=true 时占满父容器（真实页面全屏战斗画布）；false 时居中限宽（预览用）
  fill: { type: Boolean, default: false },
})

// 将原始 points 归一化为 clip-path: polygon( 百分比 )
const clipPoly = computed(() => {
  const nums = props.rawPoints.trim().split(/\s+/).map(Number)
  const pairs = []
  for (let i = 0; i < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]])
  const pct = pairs.map(
    ([x, y]) => `${(x / props.viewBoxW) * 100}% ${(y / props.viewBoxH) * 100}%`
  )
  return `polygon(${pct.join(', ')})`
})

const rootStyle = computed(() => {
  const s = {}
  if (props.glow) s.filter = `drop-shadow(0 0 14px ${props.glowColor})`
  // fill=true：首屏固定高度 750px，按 viewBox 比例 contain（不拉伸、不随窗口变形），水平居中。
  // 内部 canvas 引擎尺寸由 container.clientWidth/Height 决定（此处 height 确定为 750px 保证撑开）。
  if (props.fill) {
    s.height = '750px'
    s.width = 'auto'
    s.maxWidth = '100%'
    s.aspectRatio = `${props.viewBoxW} / ${props.viewBoxH}`
  }
  if (props.aspectRatio) s.aspectRatio = props.aspectRatio
  return s
})
</script>

<style scoped>
.shaped-canvas {
  position: relative;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}
.sc-clip {
  position: relative;
  width: 100%;
  height: 100%;
  /* 纯视觉裁切层：不接收任何事件，事件交给 sc-hit */
  pointer-events: none;
}
.sc-hit {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 交互层：显式启用命中（覆盖父层 none），clip-path 同时限制命中区域，异形外不触发事件 */
  pointer-events: auto;
}
.sc-border {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
</style>
