/**
 * useBattleDeploy — 战场部署过场动画（画在 HexGridCanvasEngine 的 Canvas 上）
 *
 * 设计要点（为什么画在引擎 Canvas 而非 DOM 覆盖层）：
 *   - 真实战场是 iso（等距）渲染，引擎在调用 drawFn 前已把
 *     「viewport scale + translate + ISO shear」完整 CTM 应用到 ctx。
 *   - 因此在 drawFn 里用【平面坐标】调 drawHexPath 画正六边形，
 *     最终会和被地形完全一致的 iso 六边形重合（地形用 drawIsoHexPath 在
 *     未带 ISO 的 ctx 上绘制，二者数学等价）。
 *   - 由此部署格与真实地形格【像素级重合】，揭幕零跳变；
 *     同时天然规避 dpr、画布在窗口中的偏移、初始 focusCentralGrid 镜头等问题。
 *
 * 颜色：直接读 TERRAIN_COLORS[id].color（运行时会被 glossary 动态覆盖），
 *       每格显示真实地形色，自动响应改色，零硬编码。
 *
 * 用法（在战斗视图的 <script setup> 中）：
 *   const { deploying, deployGhost, drawDeploy, startDeploy, finishDeploy, replayDeploy }
 *     = useBattleDeploy(gridData)
 *   // 在 drawFn（safeDrawBattleScene / drawBattleScene）最顶部：
 *   if (deploying.value) { drawDeploy(ctx); return }
 *   // 战局数据就绪后：
 *   startDeploy(hexGrid)   // hexGrid 为引擎 template ref
 *   // 模板：<div v-if="deploying" class="deploy-bar">…重新部署 / 透视 / 开始战斗</div>
 */
import { ref, computed, watch, nextTick } from 'vue'
import { pointyTopCenter, HEX_RADIUS, TERRAIN_COLORS } from '@/utils/hexUtils.js'
import { drawHexPath } from '@/utils/hexDraw.js'

const DEPLOY_DUR = 1000     // 单格飞入时长 (ms)
const DEPLOY_MAX_DELAY = 800 // 距中心最远格的额外延迟 (ms)
const DEPLOY_TAIL = 300     // 收尾缓冲

export function useBattleDeploy(gridData) {
  const deploying = ref(false)
  const deployGhost = ref(false)   // 透视：降低填充透明度，露出底下地形核对重合
  const deployStart = ref(0)
  let deployRAF = 0
  let deployInit = false

  // 由 gridData.cells 派生部署格布局：每格平面目标坐标 + 地形色 + 飞入延迟 + 整图中心
  const deployLayout = computed(() => {
    const g = gridData.value
    const cells = (g && g.cells) || []
    const sh = g?.topologyParam?.spacingH ?? 1
    const sv = g?.topologyParam?.spacingV ?? 1
    const of = g?.topologyParam?.offsetFactor ?? 0

    const list = cells
      .filter(c => c && c.terrain && c.terrain !== 'void')
      .map(c => {
        const p = pointyTopCenter(c.q, c.r, HEX_RADIUS, sh, sv)
        const x = p.flatX + c.r * of * HEX_RADIUS * Math.sqrt(3) / 2
        const y = p.flatY
        const color = (TERRAIN_COLORS[c.terrain] && TERRAIN_COLORS[c.terrain].color) || '#888888'
        return { x, y, color }
      })

    if (!list.length) return { cells: [], center: { x: 0, y: 0 } }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const m of list) {
      if (m.x < minX) minX = m.x
      if (m.x > maxX) maxX = m.x
      if (m.y < minY) minY = m.y
      if (m.y > maxY) maxY = m.y
    }
    const ccx = (minX + maxX) / 2
    const ccy = (minY + maxY) / 2
    for (const m of list) {
      m.delay = Math.min(Math.hypot(m.x - ccx, m.y - ccy) * 0.8, DEPLOY_MAX_DELAY)
    }
    return { cells: list, center: { x: ccx, y: ccy } }
  })

  // 在引擎 drawFn 的 ctx 上绘制组装中的 iso 六边形（ctx 已带完整 CTM）
  function drawDeploy(ctx) {
    const lay = deployLayout.value
    if (!lay.cells.length) return
    const now = performance.now()
    const TOTAL = DEPLOY_DUR + DEPLOY_MAX_DELAY
    const overall = Math.min((now - deployStart.value) / TOTAL, 1)
    // 暗幕：开局压暗地形，随部署推进淡出，营造"从黑暗中组装"并平滑揭幕
    const dim = Math.max(0, 1 - overall * 1.1) * 0.78
    ctx.save()
    ctx.lineJoin = 'round'
    if (dim > 0.002) {
      ctx.save()
      ctx.globalAlpha = dim
      ctx.fillStyle = '#050a12'
      ctx.fillRect(-1e5, -1e5, 2e5, 2e5) // 经 CTM 覆盖整个屏幕
      ctx.restore()
    }
    for (const c of lay.cells) {
      let p = (now - deployStart.value - c.delay) / DEPLOY_DUR
      p = p < 0 ? 0 : (p > 1 ? 1 : p)
      const e = p * p * (3 - 2 * p) // smoothstep 缓动
      const x = lay.center.x + (c.x - lay.center.x) * e
      const y = lay.center.y + (c.y - lay.center.y) * e
      drawHexPath(ctx, x, y)        // 平面六边形 → ctx 已带 ISO → 变为与地形一致的 iso 六边形
      ctx.globalAlpha = e
      ctx.fillStyle = c.color
      ctx.fill()
      ctx.globalAlpha = e * (deployGhost.value ? 0.35 : 1)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(54, 197, 240, 0.7)'
      ctx.stroke()
    }
    ctx.restore()
  }

  // 兼容两种调用：脚本里传 ref 对象，模板里 hexGrid 已被自动解包为引擎实例
  function resolveEngine(h) {
    return (h && h.value) ? h.value : h
  }

  function startDeploy(hexGridRef) {
    const eng = resolveEngine(hexGridRef)
    if (!eng) return
    deploying.value = true
    deployGhost.value = false
    deployStart.value = performance.now()
    cancelAnimationFrame(deployRAF)
    const tick = () => {
      if (!deploying.value) return
      eng?.redraw?.()
      if (performance.now() - deployStart.value > DEPLOY_DUR + DEPLOY_MAX_DELAY + DEPLOY_TAIL) {
        deploying.value = false
        eng?.redraw?.()
        return
      }
      deployRAF = requestAnimationFrame(tick)
    }
    deployRAF = requestAnimationFrame(tick)
  }

  function finishDeploy(hexGridRef) {
    deploying.value = false
    cancelAnimationFrame(deployRAF)
    resolveEngine(hexGridRef)?.redraw?.()
  }

  function replayDeploy(hexGridRef) {
    startDeploy(hexGridRef)
  }

  // 战局数据（cells）与引擎就绪后，自动播放一次部署动画
  function bindAutoStart(hexGridRef) {
    const tryStart = () => {
      const eng = resolveEngine(hexGridRef)
      const n = gridData.value?.cells?.length || 0
      if (n > 0 && eng && !deployInit && !deploying.value) {
        deployInit = true
        startDeploy(hexGridRef)
      }
    }
    // cells 立即可用时也能触发；engine 挂载后（ref 解包为实例）再补触发一次
    watch(() => (gridData.value?.cells?.length || 0), tryStart, { immediate: true })
    watch(() => resolveEngine(hexGridRef), tryStart)
  }

  return {
    deploying, deployGhost,
    drawDeploy, startDeploy, finishDeploy, replayDeploy, bindAutoStart,
  }
}
