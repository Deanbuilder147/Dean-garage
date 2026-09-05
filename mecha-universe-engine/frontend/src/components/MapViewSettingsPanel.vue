<template>
  <div class="mvsp" :class="{ collapsed }" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <div class="mvsp-head" @mousedown="onHeadDown">
      <span class="mvsp-title">⚙ 地图视图设置</span>
      <span class="mvsp-badge">DOMINATOR</span>
      <span class="mvsp-toggle" @click.stop="collapsed = !collapsed">{{ collapsed ? '▸' : '▾' }}</span>
    </div>

    <div class="mvsp-body" v-show="!collapsed">
      <!-- 地形格子透明度 -->
      <div class="row">
        <label>地形格子透明度 <b>{{ Math.round(settings.terrainOpacity * 100) }}%</b></label>
        <input type="range" min="0" max="100" step="1"
               :value="Math.round(settings.terrainOpacity * 100)"
               @input="set('terrainOpacity', $event.target.value / 100)" />
      </div>

      <!-- 地形颜色覆盖 -->
      <div class="row">
        <label>地形颜色覆盖</label>
        <div class="color-row">
          <input type="color" :value="settings.terrainOverrideColor || '#39c0ff'"
                 @input="set('terrainOverrideColor', $event.target.value)" />
          <button class="mini" @click="set('terrainOverrideColor', '')">清除(原色)</button>
        </div>
      </div>

      <!-- 网格线透明度 -->
      <div class="row">
        <label>网格线透明度 <b>{{ Math.round(settings.gridLineOpacity * 100) }}%</b></label>
        <input type="range" min="0" max="100" step="1"
               :value="Math.round(settings.gridLineOpacity * 100)"
               @input="set('gridLineOpacity', $event.target.value / 100)" />
      </div>

      <!-- 横向格子间距 -->
      <div class="row">
        <label>横向格子间距 <b>{{ settings.spacingHScale.toFixed(2) }}×</b></label>
        <input type="range" min="0.5" max="2" step="0.05"
               :value="settings.spacingHScale"
               @input="set('spacingHScale', parseFloat($event.target.value))" />
      </div>

      <!-- 纵向格子间距 -->
      <div class="row">
        <label>纵向格子间距 <b>{{ settings.spacingVScale.toFixed(2) }}×</b></label>
        <input type="range" min="0.5" max="2" step="0.05"
               :value="settings.spacingVScale"
               @input="set('spacingVScale', parseFloat($event.target.value))" />
      </div>

      <!-- 地形外框：4 条轴边长度实时调整（顶/底边=水平长度，左/右边=垂直长度） -->
      <div class="row frame-shape">
        <label>地形外框（4 边长度）</label>
      </div>
      <div class="row">
        <label>顶边长度 <b>{{ Math.round(settings.frameTopLen) }}px</b></label>
        <input type="range" min="100" :max="MAX_H" step="1"
               :value="settings.frameTopLen"
               @input="set('frameTopLen', parseInt($event.target.value))" />
      </div>
      <div class="row">
        <label>底边长度 <b>{{ Math.round(settings.frameBottomLen) }}px</b></label>
        <input type="range" min="100" :max="MAX_H" step="1"
               :value="settings.frameBottomLen"
               @input="set('frameBottomLen', parseInt($event.target.value))" />
      </div>
      <div class="row">
        <label>左边长度 <b>{{ Math.round(settings.frameLeftLen) }}px</b></label>
        <input type="range" min="100" :max="MAX_V" step="1"
               :value="settings.frameLeftLen"
               @input="set('frameLeftLen', parseInt($event.target.value))" />
      </div>
      <div class="row">
        <label>右边长度 <b>{{ Math.round(settings.frameRightLen) }}px</b></label>
        <input type="range" min="50" :max="MAX_V" step="1"
               :value="settings.frameRightLen"
               @input="set('frameRightLen', parseInt($event.target.value))" />
      </div>

      <!-- 外框 SVG 自定义上传 -->
      <div class="row frame-shape">
        <label>外框 SVG 自定义</label>
      </div>
      <div class="row svg-info">
        <label>外框画布最大尺寸（请按此作 SVG viewBox）</label>
        <div class="dim">宽 {{ Math.round(HEX_FRAME_VIEWBOX.w) }} × 高 {{ Math.round(HEX_FRAME_VIEWBOX.h) }}（逻辑像素）</div>
      </div>
      <div class="row">
        <div class="color-row">
          <button class="mini" @click="downloadTemplate">下载模板</button>
          <button class="mini" @click="pickSvg">上传 SVG</button>
          <button class="mini" :disabled="!settings.frameSvgPoints" @click="clearFrameSvg">清除</button>
        </div>
        <input ref="svgFile" type="file" accept=".svg,image/svg+xml" hidden @change="onSvg" />
      </div>
      <div class="row" v-if="settings.frameSvgPoints">
        <div class="note ok">✓ 已使用自定义外框（{{ Math.round(settings.frameSvgW) }}×{{ Math.round(settings.frameSvgH) }}）。上方 4 条边长滑块不再生效。</div>
      </div>
      <div class="row" v-if="svgError">
        <div class="note err">✗ {{ svgError }}</div>
      </div>

      <!-- 单位层透明度 -->
      <div class="row">
        <label>单位层透明度 <b>{{ Math.round(settings.unitOpacity * 100) }}%</b></label>
        <input type="range" min="0" max="100" step="1"
               :value="Math.round(settings.unitOpacity * 100)"
               @input="set('unitOpacity', $event.target.value / 100)" />
      </div>

      <!-- 坐标标签 -->
      <div class="row">
        <label>坐标标签</label>
        <button class="toggle" :class="{ on: settings.showCoords }"
                @click="set('showCoords', !settings.showCoords)">
          {{ settings.showCoords ? '开' : '关' }}
        </button>
      </div>

      <!-- 战斗画布背景 -->
      <div class="row bg-section">
        <label>战斗画布背景</label>
        <div class="color-row">
          <input type="color" :value="bg.color" @input="onColor" />
          <button class="mini" @click="pickImage">上传图片</button>
          <button class="mini" :disabled="!bg.image" @click="bg.image = ''">清除</button>
          <button class="mini" @click="$emit('bg-reset')">默认</button>
        </div>
        <input ref="bgFile" type="file" accept="image/*" hidden @change="onImage" />
      </div>

      <button class="reset" @click="$emit('reset')">重置默认</button>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { HEX_FRAME_VIEWBOX, parseSvgFrame, buildFrameTemplateSvg } from '../utils/shapeFrames.js'

const props = defineProps({
  settings: { type: Object, required: true },
  bg: { type: Object, required: true },
})

// 滑块上限 = 画面支持的最大值（viewBox 尺寸）：横向边(顶/底)取画面宽，纵向边(左/右)取画面高
const MAX_H = Math.round(HEX_FRAME_VIEWBOX.w)
const MAX_V = Math.round(HEX_FRAME_VIEWBOX.h)
const emit = defineEmits(['update', 'reset', 'bg-reset'])

const collapsed = ref(false)
const pos = reactive({ x: 0, y: 0 })

function set(key, value) {
  emit('update', { key, value })
}

// 战斗画布背景（颜色 + 图片，复用 useBattleCanvasBg 单例，改 bg 即持久化）
const bgFile = ref(null)
function pickImage() { bgFile.value && bgFile.value.click() }
function onColor(e) { props.bg.color = e.target.value }
function onImage(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { props.bg.image = reader.result }
  reader.readAsDataURL(file)
  e.target.value = ''
}

// 外框 SVG 自定义：上传解析后写入 frameSvgPoints/W/H，直接作为 canvas 外框
const svgFile = ref(null)
const svgError = ref('')
function pickSvg() { svgError.value = ''; svgFile.value && svgFile.value.click() }
function onSvg(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const parsed = parseSvgFrame(reader.result)
    if (!parsed) { svgError.value = '未在 SVG 中找到 polygon/path，请检查文件'; return }
    set('frameSvgPoints', parsed.points)
    set('frameSvgW', parsed.viewBoxW)
    set('frameSvgH', parsed.viewBoxH)
    svgError.value = ''
  }
  reader.readAsText(file)
  e.target.value = ''
}
function clearFrameSvg() {
  set('frameSvgPoints', '')
  set('frameSvgW', 0)
  set('frameSvgH', 0)
  svgError.value = ''
}
function downloadTemplate() {
  const svg = buildFrameTemplateSvg()
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'frame-template.svg'
  a.click()
  URL.revokeObjectURL(url)
}

// ===== 拖拽移动 =====
let dragging = false
let startMouse = { x: 0, y: 0 }
let startPos = { x: 0, y: 0 }

function onHeadDown(e) {
  if (e.button !== 0) return
  dragging = true
  startMouse = { x: e.clientX, y: e.clientY }
  startPos = { x: pos.x, y: pos.y }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  e.preventDefault()
}
function onMove(e) {
  if (!dragging) return
  pos.x = Math.max(0, Math.min(window.innerWidth - 60, startPos.x + (e.clientX - startMouse.x)))
  pos.y = Math.max(0, Math.min(window.innerHeight - 40, startPos.y + (e.clientY - startMouse.y)))
}
function onUp() {
  dragging = false
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
}

onMounted(() => {
  // 初始位置：右上角（窗宽 - 面板宽 - 边距，top 76）
  pos.x = window.innerWidth - 248 - 14
  pos.y = 76
})
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
})
</script>

<style scoped>
.mvsp {
  position: fixed;
  z-index: 200;
  width: 248px;
  max-height: calc(100vh - 90px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(14, 22, 34, 0.92);
  border: 1px solid rgba(90, 200, 255, 0.35);
  border-radius: 10px;
  color: #cfe6ff;
  font-size: 12px;
  font-family: 'Fira Code', monospace;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  user-select: none;
}
.mvsp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: move;
  border-bottom: 1px solid rgba(90, 200, 255, 0.2);
}
.mvsp-title { font-weight: 600; flex: 1; }
.mvsp-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 4px;
  background: linear-gradient(135deg, #b14aff, #6a2bff);
  color: #fff;
  letter-spacing: 0.5px;
}
.mvsp-toggle { opacity: 0.7; cursor: pointer; padding: 0 2px; }
.mvsp-toggle:hover { opacity: 1; }
.mvsp-body { padding: 10px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1 1 auto; min-height: 0; scrollbar-width: thin; scrollbar-color: rgba(90, 200, 255, 0.5) transparent; }
.mvsp-body::-webkit-scrollbar { width: 8px; }
.mvsp-body::-webkit-scrollbar-thumb { background: rgba(90, 200, 255, 0.45); border-radius: 4px; }
.mvsp-body::-webkit-scrollbar-track { background: transparent; }
.row { display: flex; flex-direction: column; gap: 5px; }
.bg-section { border-top: 1px solid rgba(90, 200, 255, 0.18); padding-top: 10px; }
.row.frame-shape { border-top: 1px solid rgba(90, 200, 255, 0.18); padding-top: 10px; margin-top: 2px; }
.row.frame-shape label { opacity: 1; color: #5ad0ff; font-weight: 600; }
.row label { display: flex; justify-content: space-between; opacity: 0.85; }
.row b { color: #5ad0ff; }
.svg-info .dim {
  font-size: 12px; color: #ffd597; background: rgba(255,176,0,0.10);
  border: 1px solid rgba(255,176,0,0.3); border-radius: 5px; padding: 4px 7px;
}
.note { font-size: 11px; line-height: 1.4; padding: 4px 7px; border-radius: 5px; }
.note.ok { color: #13ff43; background: rgba(19,255,67,0.10); border: 1px solid rgba(19,255,67,0.3); }
.note.err { color: #ff7a7a; background: rgba(255,80,80,0.10); border: 1px solid rgba(255,80,80,0.3); }
input[type='range'] { width: 100%; accent-color: #5ad0ff; }
.color-row { display: flex; align-items: center; gap: 8px; }
input[type='color'] {
  width: 38px; height: 26px; padding: 0; border: none; background: none; cursor: pointer;
}
.mini, .toggle, .reset {
  background: rgba(90, 200, 255, 0.12);
  border: 1px solid rgba(90, 200, 255, 0.35);
  color: #cfe6ff;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 11px;
}
.mini:hover, .toggle:hover, .reset:hover { background: rgba(90, 200, 255, 0.25); }
.toggle.on { background: rgba(0, 200, 120, 0.3); border-color: rgba(0, 200, 120, 0.5); }
.reset { margin-top: 2px; align-self: stretch; }
</style>
