// 异形边框形状常量（来自资源 6.svg，圆角六边形，viewBox 1219.52 x 782.5）
// 美术交付仅形状，阴影由 ShapedCanvas 程序化叠加。
export const HEX_FRAME_POINTS =
  '986.10 0.87 750.49 0.87 348.27 0.87 347.74 0.57 1.05 195.58 0.50 195.89 0.50 586.68 347.21 781.70 347.74 782.00 763.50 780.21 1218.47 522.70 1219.02 522.39 1219.02 131.61'

export const HEX_FRAME_VIEWBOX = { w: 1219.52, h: 782.5 }

// 多边形骨架：4 个角点（被两条相邻轴边共享）+ 4 条轴边的内部顶点。
// 控制模型（各边独立长度，不再整体内缩）：
//   - 顶边/底边 控制「水平长度」：角点的 x 由顶/底边决定（MID.topX / MID.bottomX 为锚）
//   - 左边/右边 控制「垂直长度」：角点的 y 由左/右边决定（MID.leftY / MID.rightY 为锚）
// 因顶/底只动 x、左右只动 y，四角坐标正交、互不冲突 → 改任一条边只变该边跨度，四角自动跟随连接。
const CORNERS = {
  topLeft:     [347.74, 0.57],
  bottomLeft:  [347.21, 781.70],
  bottomRight: [1218.47, 522.70],
  rightTop:    [1219.02, 131.61],
}
const EDGE_PTS = {
  // 顶边（水平，y≈0.87），从左到右
  top:    [[986.10, 0.87], [750.49, 0.87], [348.27, 0.87]],
  // 左边（垂直，x≈0.5），从上到下
  left:   [[1.05, 195.58], [0.50, 195.89], [0.50, 586.68]],
  // 底边（水平，y≈782），从左到右
  bottom: [[347.74, 782.00], [763.50, 780.21]],
  // 右边（垂直，x≈1219），从上到下
  right:  [[1219.02, 522.39]],
}

// 各轴边的中点（缩放锚点，保持该边居中，只变长度不变位置）
const MID = {
  topX:    (CORNERS.topLeft[0] + CORNERS.rightTop[0]) / 2,
  bottomX: (CORNERS.bottomLeft[0] + CORNERS.bottomRight[0]) / 2,
  leftY:   (CORNERS.topLeft[1] + CORNERS.bottomLeft[1]) / 2,
  rightY:  (CORNERS.bottomRight[1] + CORNERS.rightTop[1]) / 2,
}

// 各边默认长度（= 原美术形状跨度；lengths 全取默认时等价原 HEX_FRAME_POINTS）
export const DEFAULT_FRAME_LENGTHS = {
  top:    CORNERS.rightTop[0] - CORNERS.topLeft[0],
  bottom: CORNERS.bottomRight[0] - CORNERS.bottomLeft[0],
  left:   CORNERS.bottomLeft[1] - CORNERS.topLeft[1],
  right:  CORNERS.bottomRight[1] - CORNERS.rightTop[1],
}

// 预计算每条轴边内部顶点在其跨度上的归一化比例（0=起点角, 1=终点角），用于按新长度插值
function withFrac(list, axis, c0, c1) {
  const span = axis === 'x' ? c1[0] - c0[0] : c1[1] - c0[1]
  return list.map(([x, y]) => ({
    x, y,
    f: axis === 'x' ? (x - c0[0]) / span : (y - c0[1]) / span,
  }))
}
const TOP_PTS    = withFrac(EDGE_PTS.top,    'x', CORNERS.topLeft,   CORNERS.rightTop)
const LEFT_PTS   = withFrac(EDGE_PTS.left,   'y', CORNERS.topLeft,   CORNERS.bottomLeft)
const BOTTOM_PTS = withFrac(EDGE_PTS.bottom, 'x', CORNERS.bottomLeft, CORNERS.bottomRight)
const RIGHT_PTS  = withFrac(EDGE_PTS.right,  'y', CORNERS.rightTop,   CORNERS.bottomRight)

// 按 4 条轴边长度实时生成外框顶点串（lengths 单位=viewBox 像素）
//   top    : 顶边水平长度
//   bottom : 底边水平长度
//   left   : 左边垂直长度
//   right  : 右边垂直长度
export function buildFramePoints(lengths = {}) {
  const top = lengths.top ?? DEFAULT_FRAME_LENGTHS.top
  const bottom = lengths.bottom ?? DEFAULT_FRAME_LENGTHS.bottom
  const left = lengths.left ?? DEFAULT_FRAME_LENGTHS.left
  const right = lengths.right ?? DEFAULT_FRAME_LENGTHS.right

  // 角点：x 由 顶/底边 控制，y 由 左/右边 控制（各自独立，无冲突 → 四角自动跟随）
  const tl = [MID.topX - top / 2,    MID.leftY - left / 2]
  const rt = [MID.topX + top / 2,    MID.rightY - right / 2]
  const bl = [MID.bottomX - bottom / 2, MID.leftY + left / 2]
  const br = [MID.bottomX + bottom / 2, MID.rightY + right / 2]

  // 闭合多边形顶点顺序（与原 HEX_FRAME_POINTS 一致）：顶边内部 → topLeft → 左边内部 → bottomLeft → 底边内部 → bottomRight → 右边内部 → rightTop → (自动闭合回到首点)
  const pts = []
  for (const p of TOP_PTS)    pts.push([tl[0] + p.f * top, p.y])
  pts.push(tl)
  for (const p of LEFT_PTS)   pts.push([p.x, tl[1] + p.f * left])
  pts.push(bl)
  for (const p of BOTTOM_PTS) pts.push([bl[0] + p.f * bottom, p.y])
  pts.push(br)
  for (const p of RIGHT_PTS)  pts.push([p.x, rt[1] + p.f * right])
  pts.push(rt)

  return pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
}

// ===== 自定义外框 SVG 支持 =====
// 解析上传的 SVG，提取首个 <polygon> 或 <path> 作为外框轮廓。
// 返回 { points: "x y x y ...", viewBoxW, viewBoxH } 或 null（解析失败）。
// points 采用与 HEX_FRAME_POINTS 一致的「空格分隔坐标对」格式，可直接喂给 ShapedCanvas。
export function parseSvgFrame(svgText) {
  if (!svgText || typeof svgText !== 'string') return null
  let vbW = HEX_FRAME_VIEWBOX.w
  let vbH = HEX_FRAME_VIEWBOX.h
  const vb = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i)
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p[2] > 0 && p[3] > 0) { vbW = p[2]; vbH = p[3] }
  }
  // 优先 polygon
  const poly = svgText.match(/<polygon\b[^>]*\bpoints\s*=\s*["']([^"']+)["']/i)
  if (poly) {
    const pts = polyPointsToSpaced(poly[1])
    if (pts) return { points: pts, viewBoxW: vbW, viewBoxH: vbH }
  }
  // 退而求其次 path（仅直线 M/L/H/V 与 Z 精确；曲线 C/Q/A 取末端点近似）
  const path = svgText.match(/<path\b[^>]*\bd\s*=\s*["']([^"']+)["']/i)
  if (path) {
    const pts = pathToSpacedPoints(path[1])
    if (pts) return { points: pts, viewBoxW: vbW, viewBoxH: vbH }
  }
  return null
}

function round2(n) { return Math.round(n * 100) / 100 }

function polyPointsToSpaced(s) {
  const nums = (s || '').trim().split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n))
  if (nums.length < 4 || nums.length % 2 !== 0) return null
  const out = []
  for (let i = 0; i < nums.length; i += 2) out.push(`${round2(nums[i])} ${round2(nums[i + 1])}`)
  return out.join(' ')
}

// 最小 path 扁平化：支持 M/L/H/V/Z 及相对命令；曲线 C/Q/A 仅取末端点（近似直线）
function pathToSpacedPoints(d) {
  const re = /([MmLlHhVvZz])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g
  let m, cmd = '', coords = []
  const pts = []
  let cx = 0, cy = 0
  const push = (x, y) => pts.push(`${round2(x)} ${round2(y)}`)
  const consume = () => {
    switch (cmd) {
      case 'M': case 'm': {
        while (coords.length >= 2) {
          const x = coords.shift(), y = coords.shift()
          if (cmd === 'm') { cx += x; cy += y } else { cx = x; cy = y }
          push(cx, cy)
          cmd = (cmd === 'm') ? 'l' : 'L' // 首个点后隐式转为 L
        }
        break
      }
      case 'L': case 'l': {
        while (coords.length >= 2) {
          const x = coords.shift(), y = coords.shift()
          if (cmd === 'l') { cx += x; cy += y } else { cx = x; cy = y }
          push(cx, cy)
        }
        break
      }
      case 'H': case 'h': {
        while (coords.length >= 1) {
          const x = coords.shift()
          if (cmd === 'h') cx += x; else cx = x
          push(cx, cy)
        }
        break
      }
      case 'V': case 'v': {
        while (coords.length >= 1) {
          const y = coords.shift()
          if (cmd === 'v') cy += y; else cy = y
          push(cx, cy)
        }
        break
      }
      case 'C': case 'c': {
        while (coords.length >= 6) {
          coords.shift(); coords.shift(); coords.shift(); coords.shift(); coords.shift()
          const y = coords.shift(), x = coords.shift()
          if (cmd === 'c') { cx += x; cy += y } else { cx = x; cy = y }
          push(cx, cy)
        }
        break
      }
      case 'Q': case 'q': {
        while (coords.length >= 4) {
          coords.shift(); coords.shift()
          const y = coords.shift(), x = coords.shift()
          if (cmd === 'q') { cx += x; cy += y } else { cx = x; cy = y }
          push(cx, cy)
        }
        break
      }
      case 'A': case 'a': {
        while (coords.length >= 7) {
          for (let k = 0; k < 5; k++) coords.shift()
          const y = coords.shift(), x = coords.shift()
          if (cmd === 'a') { cx += x; cy += y } else { cx = x; cy = y }
          push(cx, cy)
        }
        break
      }
      default: break
    }
  }
  while ((m = re.exec(d)) !== null) {
    if (m[1]) { consume(); cmd = m[1]; coords = [] }
    else { coords.push(parseFloat(m[2])); consume() }
  }
  consume()
  return pts.length >= 3 ? pts.join(' ') : null
}

// 生成外框 SVG 模板：含正确 viewBox 与当前默认六边形轮廓，供用户在其上修改后回传
export function buildFrameTemplateSvg() {
  const pts = HEX_FRAME_POINTS
    .trim().split(/\s+/).map(Number)
    .reduce((acc, n, i) => {
      if (i % 2 === 0) acc.push([n]); else acc[acc.length - 1].push(n)
      return acc
    }, [])
    .map(([x, y]) => `${round2(x)},${round2(y)}`).join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HEX_FRAME_VIEWBOX.w} ${HEX_FRAME_VIEWBOX.h}" width="${HEX_FRAME_VIEWBOX.w}" height="${HEX_FRAME_VIEWBOX.h}">\n` +
    `  <!-- 修改此 polygon 的 points 即可改变外框形状；坐标系 = viewBox(0 0 ${HEX_FRAME_VIEWBOX.w} ${HEX_FRAME_VIEWBOX.h}) -->\n` +
    `  <polygon points="${pts}" fill="none" stroke="#ffb000" stroke-width="2"/>\n` +
    `</svg>\n`
}
