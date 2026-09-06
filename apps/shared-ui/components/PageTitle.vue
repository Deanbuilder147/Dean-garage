<template>
  <!-- 页面标题：严格复刻桌面 title.svg 样式 -->
  <div class="page-title">
    <svg
      class="pt-svg"
      viewBox="0 0 662.16 171.7"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <!-- 青绿内核径向渐变（取自首页 title.svg 渐变_37） -->
        <radialGradient id="pt-core" cx="400.8" cy="122.55" r="45.78" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#006c5d"/>
          <stop offset="0.51" stop-color="#006e5f"/>
          <stop offset="0.77" stop-color="#007666"/>
          <stop offset="0.97" stop-color="#008373"/>
          <stop offset="1" stop-color="#008675"/>
        </radialGradient>
        <!-- 青白外晕径向渐变（取自首页 title.svg 渐变_8） -->
        <radialGradient id="pt-halo" cx="400.8" cy="122.55" r="46.07" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#88f7df"/>
          <stop offset="1" stop-color="#005045"/>
        </radialGradient>
      </defs>

      <!-- 六边形蜂窝组合：6 个平顶六边形，坐标/双渐变严格取自 title.svg，整体 opacity 0.69 -->
      <g opacity="0.69">
        <!-- 1 · x≈314 -->
        <g>
          <polygon points="314.02 74.16 357.04 98.36 357.04 146.75 314.02 170.95 271 146.75 271 98.36" fill="url(#pt-core)"/>
          <polygon points="314.02 74.16 357.04 98.36 357.04 146.75 314.02 170.95 271 146.75 271 98.36" fill="url(#pt-halo)" opacity="0.55"/>
        </g>
        <!-- 2 · x≈400.8 -->
        <g>
          <polygon points="400.8 74.16 443.81 98.36 443.81 146.75 400.8 170.95 357.78 146.75 357.78 98.36" fill="url(#pt-core)"/>
          <polygon points="400.8 74.16 443.81 98.36 443.81 146.75 400.8 170.95 357.78 146.75 357.78 98.36" fill="url(#pt-halo)" opacity="0.55"/>
        </g>
        <!-- 3 · x≈488.12 -->
        <g>
          <polygon points="488.12 74.16 531.13 98.36 531.13 146.75 488.12 170.95 445.1 146.75 445.1 98.36" fill="url(#pt-core)"/>
          <polygon points="488.12 74.16 531.13 98.36 531.13 146.75 488.12 170.95 445.1 146.75 445.1 98.36" fill="url(#pt-halo)" opacity="0.55"/>
        </g>
        <!-- 4 · x≈575（上扬行） -->
        <g>
          <polygon points="531.68 0.65 574.7 24.85 574.7 73.24 531.68 97.44 488.67 73.24 488.67 24.85" fill="url(#pt-core)"/>
          <polygon points="531.68 0.65 574.7 24.85 574.7 73.24 531.68 97.44 488.67 73.24 488.67 24.85" fill="url(#pt-halo)" opacity="0.55"/>
        </g>
        <!-- 5 · x≈575.01 -->
        <g>
          <polygon points="575.01 74.26 618.03 98.46 618.03 146.85 575.01 171.05 532 146.85 532 98.46" fill="url(#pt-core)"/>
          <polygon points="575.01 74.26 618.03 98.46 618.03 146.85 575.01 171.05 532 146.85 532 98.46" fill="url(#pt-halo)" opacity="0.55"/>
        </g>
        <!-- 6 · x≈618.58（收尾） -->
        <g>
          <polygon points="618.58 0.76 661.6 24.95 661.6 73.35 618.58 97.55 575.56 73.35 575.56 24.95" fill="url(#pt-core)"/>
          <polygon points="618.58 0.76 661.6 24.95 661.6 73.35 618.58 97.55 575.56 73.35 575.56 24.95" fill="url(#pt-halo)" opacity="0.55"/>
        </g>
      </g>

      <!-- 橙色切割线（stroke #f90 width 3px，坐标严格取自 title.svg） -->
      <g stroke="#f90" stroke-width="3" stroke-miterlimit="10" fill="none">
        <line x1="0.52" y1="104.16" x2="638.18" y2="103.96"/>
        <line x1="0" y1="114.75" x2="349.71" y2="114.75"/>
        <line x1="382.35" y1="95.69" x2="638.26" y2="96.12"/>
      </g>

      <!-- 主标题：73px 橙 #f90 Source Han Sans 粗体（坐标取自 title.svg） -->
      <text
        :x="titleX" y="86.71"
        font-size="73" font-weight="700" fill="#f90"
        font-family="'Source Han Sans HW K','Source Han Sans',sans-serif"
      >{{ title }}</text>

      <!-- 副标题：26.73px 橙 #f90（坐标取自 title.svg） -->
      <text
        x="368.07" y="135.9"
        font-size="26.73" font-weight="700" fill="#f90"
        font-family="'Source Han Sans HW K','Source Han Sans',sans-serif"
      >{{ subtitle }}</text>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title:    { type: String, default: '标题' },
  subtitle: { type: String, default: '' },
  // 主标题起始 x，默认 2.24（与 title.svg 一致）；英文/长标题可左移避免压到蜂窝
  titleX:   { type: Number, default: 2.24 }
})
</script>

<style scoped>
.page-title{ width:100%; }
.pt-svg{ width:100%; height:auto; display:block; overflow:visible; }
</style>
