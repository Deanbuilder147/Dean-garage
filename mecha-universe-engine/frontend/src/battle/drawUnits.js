// ================================================================
// battle/drawUnits.js
// 移动端战场叠加层绘制（棋子 + HP 条 + 选中/高亮），供 HexGridCanvasEngine 的 drawFn 调用。
// 约定：调用时 ctx 已应用完整 CTM（translate→scale→ISO shear），故本函数使用「标准 2D 坐标」，
// 与 PC 版 drawBattleScene 坐标系一致（由 pointyTopCenter 产出）。
// ================================================================
import { pointyTopCenter, HEX_RADIUS } from '../utils/hexUtils.js'
import { isUnitDead } from './normalizeBattle.js'

const FACTION_COLOR = {
  earth: '#4a9eff',
  maxion: '#ff5a5a',
  balon: '#ffb74a',
}
function factionColor(f) { return FACTION_COLOR[f] || '#9aa7b5' }

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} p
 * @param {Array} p.units 规范化后的单位数组（含 q,r,hp,maxHp,faction,name）
 * @param {string|number} [p.selectedId] 当前选中单位 id
 * @param {Set<string>} [p.highlightCells] "q,r" 高亮集合（移动范围/可攻击格）
 * @param {object} [p.gridData] 用于读取 spacingH/spacingV
 */
export function drawBattleUnits(ctx, p = {}) {
  const { units = [], selectedId, highlightCells, gridData } = p
  const spacingH = gridData?.topologyParam?.spacingH ?? 1.0
  const spacingV = gridData?.topologyParam?.spacingV ?? 1.0
  const R = HEX_RADIUS

  // 1) 先画高亮格（移动范围/可攻击）
  if (highlightCells && highlightCells.size) {
    ctx.save()
    for (const key of highlightCells) {
      const [q, r] = key.split(',').map(Number)
      const { flatX, flatY } = pointyTopCenter(q, r, R, spacingH, spacingV)
      ctx.beginPath()
      ctx.fillStyle = 'rgba(74,158,255,0.18)'
      // 简易圆点标记高亮中心
      ctx.arc(flatX, flatY, R * 0.55, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // 2) 画单位
  for (const u of units) {
    if (u.q === undefined || u.r === undefined) continue
    if (isUnitDead(u)) continue
    const { flatX, flatY } = pointyTopCenter(u.q, u.r, R, spacingH, spacingV)
    const color = factionColor(u.faction)

    // 选中圈
    if (String(u.id) === String(selectedId)) {
      ctx.beginPath()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.arc(flatX, flatY, R * 0.95, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 底盘（阵营色圆）
    ctx.beginPath()
    ctx.fillStyle = color
    ctx.arc(flatX, flatY, R * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.stroke()

    // 名称（缩写）
    const label = (u.name || u.id || '?').slice(0, 4)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${Math.round(R * 0.5)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, flatX, flatY)

    // HP 条（底部）
    const hpRatio = (typeof u.hp === 'number' && u.maxHp) ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 1
    const barW = R * 1.2
    const barY = flatY + R * 0.78
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(flatX - barW / 2, barY, barW, 5)
    ctx.fillStyle = hpRatio > 0.4 ? '#5be35b' : '#ff5a5a'
    ctx.fillRect(flatX - barW / 2, barY, barW * hpRatio, 5)
  }
}
