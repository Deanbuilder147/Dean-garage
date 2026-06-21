#!/usr/bin/env python3
"""
Phase 9.7: 锁死 Even-R 拓扑步长，彻底清盘 Y 轴渲染与逆矩阵对账

六项手术:
1. canvasPosToHex — 原子化屏幕像素 → (Q,R), 刚性 Even-R 逆推
2. getHexAtEvent — 封装 event → (Q,R) 管线
3. 事件处理器 — click/contextmenu/mousemove 全部改用 getHexAtEvent
4. zoomReset — 锚点补偿 .x/.y → .wx/.wy
5. hexUtils.js — pointyTopCenter/pointyTopToHex 标注 1.5*size 刚性步长
6. canvasPosToWorld — 内部保留，添加 Phase 9.7 注释
"""

hexgrid_path = "/root/original-project/frontend/src/components/HexGridCanvas.vue"
hexutils_path = "/root/original-project/frontend/src/utils/hexUtils.js"

changes = []

with open(hexgrid_path) as f:
    hg = f.read()

with open(hexutils_path) as f:
    hu = f.read()


# ================================================================
# 手术 1: 在 canvasPosToWorld 之后插入 canvasPosToHex + getHexAtEvent
# ================================================================
old_1 = """  return { x: flatX, y: flatY, wx: worldX, wy: worldY }
}"""

new_1 = """  return { x: flatX, y: flatY, wx: worldX, wy: worldY }
}

/**
 * Phase 9.7: 原子化屏幕像素 → 六角格 (Q,R) 刚性逆变换
 *
 * 正向管道 (Even-R 拓扑步长):
 *   1) flatY = 1.5 * r * size * spacingV   ← 严格步长, 不可变
 *   2) worldY = scaleY * flatY               ← CTM
 *   3) screenY = offsetY + scale * worldY
 *
 * 正向管道 (X 轴):
 *   1) flatX = sqrt(3)*q*size*spacingH + evenOffset(r)*spacingH
 *   2) worldX = scaleX * flatX + shearX * flatY
 *   3) screenX = offsetX + scale * worldX
 *
 * 逆向 (本函数, 严格成对倒数):
 *   1) worldY  = (screenY - offsetY) / scale
 *   2) flatY   = worldY / scaleY
 *   3) r       = round(flatY / (1.5 * size * spacingV))   ← ① 刚性除法
 *   4) worldX  = (screenX - offsetX) / scale
 *   5) flatX   = (worldX - shearX * flatY) / scaleX       ← ② shearX 回代
 *   6) q       = round((flatX/spacingH - evenOffset(r)) / (sqrt(3)*size)) ← ③
 *
 * 锁定性质:
 *   - ①②③ 三连击 = 正向完整逆, 一次性原子求 Q,R
 *   - R=0 行: flatY=0 → r=round(0)=0 ✓
 *   - 1.5*size 双端对称, 乘除互消 (非两步走, 无累积偏差)
 *   - shearX 消去: flatX 推导基于刚性 r-backed flatY
 */
function canvasPosToHex(cx, cy) {
  const v = props.spacingV
  const h = props.spacingH
  // ① Y 轴: Even-R 步长 1.5*size 刚性逆推
  const worldY = (cy - offsetY.value) / scale.value
  const flatY = worldY / ISO.scaleY
  const r = Math.round(flatY / (1.5 * HEX_RADIUS * v))

  // ② X 轴: 消去 shearX 回代 → flatX
  const worldX = (cx - offsetX.value) / scale.value
  const flatX = (worldX - ISO.shearX * flatY) / ISO.scaleX

  // ③ Even-R 偏移 → Q
  const evenOffset = (r % 2 === 0) ? (HEX_RADIUS * Math.sqrt(3) / 2) : 0
  const q = Math.round((flatX / h - evenOffset) / (HEX_RADIUS * Math.sqrt(3)))

  return { q, r }
}

/** 鼠标事件 → 六角格 (Q,R): 封装 getBoundingClientRect 缩放补偿 → canvasPosToHex */
function getHexAtEvent(e) {
  const canvas = mapCanvas.value
  if (!canvas) return { q: -1, r: -1 }
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * sx
  const cy = (e.clientY - rect.top) * sy
  return canvasPosToHex(cx, cy)
}"""

if old_1 in hg:
    hg = hg.replace(old_1, new_1)
    changes.append("✅ 手术1: canvasPosToHex + getHexAtEvent 原子函数已插入")
else:
    changes.append("❌ 手术1: canvasPosToWorld 结尾标识未找到")


# ================================================================
# 手术 2: 事件处理器 — 全部改用 getHexAtEvent(e)
# ================================================================
def replace_handler(content, old_text, new_text, label):
    """尝试 old_text 不匹配时回退到含 getWorldPos 的版本"""
    if old_text in content:
        return content.replace(old_text, new_text)
    return None

# click handler
old_click = """    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      emit('hex-click', { q: hex.q, r: hex.r, event: e })"""
new_click = """    const hex = getHexAtEvent(e)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      emit('hex-click', { q: hex.q, r: hex.r, event: e })"""

result = replace_handler(hg, old_click, new_click, "2a")
if result:
    hg = result
    changes.append("✅ 手术2a: click handler → getHexAtEvent")
else:
    changes.append("❌ 手术2a: click handler 未匹配")

# contextmenu handler
old_ctxmenu = """    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      emit('hex-contextmenu', { q: hex.q, r: hex.r, event: e })"""
new_ctxmenu = """    const hex = getHexAtEvent(e)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      emit('hex-contextmenu', { q: hex.q, r: hex.r, event: e })"""

result = replace_handler(hg, old_ctxmenu, new_ctxmenu, "2b")
if result:
    hg = result
    changes.append("✅ 手术2b: contextmenu handler → getHexAtEvent")
else:
    changes.append("❌ 手术2b: contextmenu handler 未匹配")

# mousemove handler
old_mousemove = """    const wp = getWorldPos(e)
    const hex = pixelToHex(wp.x, wp.y)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      hlQ = hex.q
      hlR = hex.r"""
new_mousemove = """    const hex = getHexAtEvent(e)
    if (hex.q >= 0 && hex.q < props.gridWidth && hex.r >= 0 && hex.r < props.gridHeight) {
      hlQ = hex.q
      hlR = hex.r"""

result = replace_handler(hg, old_mousemove, new_mousemove, "2c")
if result:
    hg = result
    changes.append("✅ 手术2c: mousemove handler → getHexAtEvent")
else:
    changes.append("❌ 手术2c: mousemove handler 未匹配")


# ================================================================
# 手术 3: zoomReset 锚点补偿 — .x/.y → .wx/.wy
# ================================================================
old_zoom = "  offsetX.value += (scale.value - ns) * worldCenter.x\n  offsetY.value += (scale.value - ns) * worldCenter.y"
new_zoom = "  offsetX.value += (scale.value - ns) * worldCenter.wx\n  offsetY.value += (scale.value - ns) * worldCenter.wy"

result = replace_handler(hg, old_zoom, new_zoom, "3")
if result:
    hg = result
    changes.append("✅ 手术3: zoomReset 锚点 .x/.y → .wx/.wy")
else:
    changes.append("❌ 手术3: zoomReset 锚点未匹配")


# ================================================================
# 手术 4: canvasPosToWorld 注释 — 标注为内部/缩放锚点专用
# ================================================================
old_cptw_comment = """/**
 * canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)
 *
 * 正向 CTM: translate → scale → transform(scaleX, 0, shearX, scaleY, 0, 0)
 *   即: screenX = offsetX + scale * (scaleX * flatX + shearX * flatY)
 *       screenY = offsetY + scale * (scaleY * flatY)
 *
 * 性质:
 *   - R=0 行: flatY=0 → screenY=offsetY (绝对水平地平线)
 *   - shearX 驱动 X 轴倾斜 (flatY 越大, X 偏移越多 → 标准等距纵深感)
 *
 * 逆矩阵管线 (严格成对倒数):
 *   1) relX = cx - offsetX, relY = cy - offsetY
 *   2) worldX = relX / scale, worldY = relY / scale
 *   3) flatY = worldY / scaleY
 *   4) flatX = (worldX - shearX * flatY) / scaleX
 *         = (worldX - shearX * worldY / scaleY) / scaleX
 */"""

new_cptw_comment = """/**
 * Phase 9.7: canvas 像素坐标 → 2D 世界坐标 (含 ISO 逆矩阵)
 *
 * 用途: 缩放锚点 (zoomIn/zoomOut/wheel) 和 zoomReset 居中对齐
 * 注意: 拾取 Q,R 请使用 canvasPosToHex() 做原子化刚性逆推
 *
 * 正向 CTM: translate → scale → transform(scaleX, 0, shearX, scaleY, 0, 0)
 *   即: screenX = offsetX + scale * (scaleX * flatX + shearX * flatY)
 *       screenY = offsetY + scale * (scaleY * flatY)
 *
 * 逆矩阵管线 (严格成对倒数):
 *   1) worldX = (cx - offsetX) / scale, worldY = (cy - offsetY) / scale
 *   2) flatY = worldY / scaleY
 *   3) flatX = (worldX - shearX * flatY) / scaleX
 */"""

if old_cptw_comment in hg:
    hg = hg.replace(old_cptw_comment, new_cptw_comment)
    changes.append("✅ 手术4: canvasPosToWorld 注释更新为内部/锚点用途")
else:
    changes.append("⚠️ 手术4: canvasPosToWorld 注释未找到, 尝试备用匹配…")
    # Fallback: try shorter match
    if "canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)" in hg:
        # match from '/**' to '*/' of the comment
        idx_start = hg.find("/**\n * canvas 像素坐标 → 世界坐标 (含 ISO 逆矩阵)")
        if idx_start >= 0:
            idx_end = hg.find(" */", idx_start)
            if idx_end >= 0:
                hg = hg[:idx_start] + new_cptw_comment + hg[idx_end + 3:]
                changes.append("✅ 手术4(fallback): canvasPosToWorld 注释已更新")
            else:
                changes.append("❌ 手术4(fallback): 无法定位注释结束")
        else:
            changes.append("❌ 手术4(fallback): 无法定位注释开始")
    else:
        changes.append("❌ 手术4: canvasPosToWorld 注释完全未找到")


# ================================================================
# 手术 5: hexUtils.js — pointyTopCenter & pointyTopToHex 标注 1.5*size 刚性步长
# ================================================================
old_ptc = """ *   y = size * 1.5 * r"""
new_ptc = """ *   y = size * 1.5 * r                ← Even-R 刚性步长 (1.5*size 不可变)"""

if old_ptc in hu:
    hu = hu.replace(old_ptc, new_ptc)
    changes.append("✅ 手术5a: pointyTopCenter 标注 1.5*size 刚性步长")
else:
    changes.append("⚠️ 手术5a: pointyTopCenter 注释未精确匹配")

old_ptth = """ *   1) r = round( flatY / (spacingV * 1.5 * size) )"""
new_ptth = """ *   1) r = round( flatY / (spacingV * 1.5 * size) )  ← 1.5*size Even-R 刚性步长"""

if old_ptth in hu:
    hu = hu.replace(old_ptth, new_ptth)
    changes.append("✅ 手术5b: pointyTopToHex 标注 1.5*size 刚性步长")
else:
    changes.append("⚠️ 手术5b: pointyTopToHex 注释未精确匹配")


# ================================================================
# 写入文件
# ================================================================
with open(hexgrid_path, "w") as f:
    f.write(hg)

with open(hexutils_path, "w") as f:
    f.write(hu)

for c in changes:
    print(c)

print(f"\n--- 写入统计 ---")
print(f"HexGridCanvas.vue: {len(hg)} 字符, {hg.count(chr(10))} 行")
print(f"hexUtils.js:       {len(hu)} 字符, {hu.count(chr(10))} 行")
