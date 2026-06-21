#!/usr/bin/env python3
"""
Phase 13 独立UI扩展: HexGridCanvas.vue 注入双轴平移滑槽

插入点:
  1. Template: </div> 之后, cursor-hint 之前 (line 5→6)
  2. Script state: offsetY ref 之后 (line 65→66)
  3. Helper functions: centerGrid() 之后 (line 241→243)
  4. draw() sync: ctx.restore() 之后 (line 311→312)
  5. Styles: </style> 之前 (line 621)
"""

import sys

TARGET = '/root/original-project/frontend/src/components/HexGridCanvas.vue'
BACKUP = TARGET + '.slider-backup'

def main():
    with open(TARGET, 'r') as f:
        lines = f.readlines()

    # ---- step 1: Template insertion (between line 5 </div> and line 6 cursor-hint) ----
    # Find exact position: "    </div>" (canvas-container close) then next line is cursor-hint
    slider_html = '''    <!-- Phase13: 双轴平移滑槽 (防飞图) -->
    <div class="slider-panel" @mousedown.stop @click.stop>
      <input type="range" class="slider-track slider-h" min="0" max="100" :value="hSlider" @input="onHSlider" title="水平平移 X">
      <span class="slider-divider">|</span>
      <input type="range" class="slider-track slider-v" min="0" max="100" :value="vSlider" @input="onVSlider" title="垂直平移 Y">
    </div>
'''

    # Insert after "    </div>" (end of canvas-container) and before cursor-hint
    for i, line in enumerate(lines):
        if line.rstrip() == '    </div>' and i + 1 < len(lines) and 'cursor-hint' in lines[i + 1]:
            lines.insert(i + 1, slider_html)
            print(f'[OK] Template: 滑槽 DOM 注入到 line {i+2}')
            break
    else:
        print('[FAIL] Template: 未找到插入点')
        return 1

    # ---- step 2: Script state (after offsetY ref) ----
    slider_state = '''const hSlider = ref(50)       // 水平滑槽 0-100
const vSlider = ref(50)       // 垂直滑槽 0-100
let _sliderSyncing = false    // 防止滑槽→offset→滑槽 死循环

'''
    for i, line in enumerate(lines):
        if line.rstrip().startswith('const offsetY = ref(60)') and i + 1 < len(lines) and 'hoverCoord' in lines[i + 1]:
            lines.insert(i + 1, slider_state)
            print(f'[OK] Script: 滑槽状态 ref 注入到 line {i+2}')
            break
    else:
        print('[FAIL] Script: 未找到 offsetY ref 插入点')
        return 1

    # ---- step 3: Helper functions (after centerGrid() closing brace) ----
    helper_funcs = '''
// ================================================================
//  Phase13: 滑槽边界算力对账 & 双向同步
// ================================================================

/** 计算等距变换后的棋盘世界尺寸 */
function getGridDims() {
  const lastCol = hexToPixel(props.gridWidth - 1, 0)
  const lastRow = hexToPixel(0, props.gridHeight - 1)
  const worldW = lastCol.x + HEX_RADIUS * 2
  const worldH = lastRow.y + HEX_RADIUS * 2
  const gridW = worldW * ISO.scaleX + worldH * Math.abs(ISO.shearX)
  const gridH = worldH * ISO.scaleY
  return { gridW, gridH }
}

/** 计算滑槽动态 min/max 范围 */
function getSliderRange() {
  const canvas = mapCanvas.value
  if (!canvas) return { minX: -500, maxX: 500, minY: -500, maxY: 500 }
  const { gridW, gridH } = getGridDims()
  const scaledW = gridW * scale.value
  const scaledH = gridH * scale.value
  const cw = canvas.width
  const ch = canvas.height
  return {
    minX: -scaledW + cw * 0.2,
    maxX: cw * 0.8,
    minY: -scaledH + ch * 0.2,
    maxY: ch * 0.8,
  }
}

/** offset → 滑槽 % 逆向同步 (鼠标拖拽/缩放/重置后调用) */
function syncSlidersFromOffset() {
  if (_sliderSyncing) return
  const { minX, maxX, minY, maxY } = getSliderRange()
  if (maxX > minX) hSlider.value = Math.round(((offsetX.value - minX) / (maxX - minX)) * 100)
  if (maxY > minY) vSlider.value = Math.round(((offsetY.value - minY) / (maxY - minY)) * 100)
}

/** 水平滑槽 → offsetX */
function onHSlider(e) {
  const val = parseFloat(e.target.value)
  const { minX, maxX } = getSliderRange()
  _sliderSyncing = true
  offsetX.value = minX + (maxX - minX) * (val / 100)
  draw()
  _sliderSyncing = false
}

/** 垂直滑槽 → offsetY */
function onVSlider(e) {
  const val = parseFloat(e.target.value)
  const { minY, maxY } = getSliderRange()
  _sliderSyncing = true
  offsetY.value = minY + (maxY - minY) * (val / 100)
  draw()
  _sliderSyncing = false
}
'''

    # Insert after centerGrid closing brace "}" before "// === Canvas 初始化 ==="
    # centerGrid `}` → separator line → "//  Canvas 初始化" → "function initCanvas()"
    inserted = False
    for i, line in enumerate(lines):
        if line.strip() != '}':
            continue
        # Look backward up to 25 lines for "function centerGrid"
        found = False
        for j in range(max(0, i - 25), i):
            if 'function centerGrid' in lines[j]:
                found = True
                break
        if not found:
            continue
        # Find the blank line(s) before initCanvas/Canvas comment, insert there
        j = i + 1
        while j < len(lines):
            stripped = lines[j].strip()
            if 'initCanvas' in stripped:
                # Go back to the empty line before initCanvas's comment
                k = j
                while k > i and lines[k].strip() != '':
                    k -= 1
                while k > i and lines[k].strip() == '':
                    k -= 1
                lines.insert(k + 1, helper_funcs)
                print(f'[OK] Script: 辅助函数注入到 line {k+2} (centerGrid 结束于 line {i+1})')
                inserted = True
                break
            j += 1
        if inserted:
            break

    if not inserted:
        print('[FAIL] Script: 未找到 centerGrid→initCanvas 区间')
        return 1

    # ---- step 4: draw() sync (after ctx.restore()) ----
    slider_sync_call = '  syncSlidersFromOffset()   // Phase13: 同步滑槽游标\n'
    for i, line in enumerate(lines):
        if line.strip() == 'ctx.restore()':
            # Insert after ctx.restore()
            lines.insert(i + 1, slider_sync_call)
            print(f'[OK] Script: syncSlidersFromOffset 注入到 draw() 末尾 line {i+2}')
            break
    else:
        print('[FAIL] Script: 未找到 ctx.restore()')
        return 1

    # ---- step 5: CSS styles (before </style>) ----
    slider_css = '''
/* ===== Phase13: 双轴平移滑槽 ===== */
.slider-panel {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(6, 18, 24, 0.82);
  border: 1px solid rgba(255, 176, 0, 0.18);
  border-radius: 6px;
  padding: 3px 10px;
  backdrop-filter: blur(4px);
}

.slider-panel:hover {
  border-color: rgba(255, 176, 0, 0.35);
}

.slider-track {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  background: rgba(255, 176, 0, 0.12);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  transition: background 0.15s;
}

.slider-h { width: 140px; }
.slider-v { width: 100px; }

.slider-track:hover {
  background: rgba(255, 176, 0, 0.22);
}

.slider-track::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #ffb000;
  border: 1.5px solid #0d1f2d;
  cursor: grab;
  box-shadow: 0 0 5px rgba(255, 176, 0, 0.35);
  transition: box-shadow 0.15s;
}

.slider-track::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #ffb000;
  border: 1.5px solid #0d1f2d;
  cursor: grab;
  box-shadow: 0 0 5px rgba(255, 176, 0, 0.35);
}

.slider-track::-webkit-slider-thumb:active {
  cursor: grabbing;
  box-shadow: 0 0 10px rgba(255, 176, 0, 0.65);
}

.slider-divider {
  color: rgba(255, 176, 0, 0.25);
  font-size: 10px;
  margin: 0 4px;
  user-select: none;
}
'''

    # Insert before </style>
    for i, line in enumerate(lines):
        if line.strip() == '</style>':
            lines.insert(i, slider_css)
            print(f'[OK] Style: CSS 注入到 line {i+1}')
            break
    else:
        print('[FAIL] Style: 未找到 </style>')
        return 1

    # ---- Write back ----
    with open(TARGET, 'w') as f:
        f.writelines(lines)

    print(f'\n[SUCCESS] 所有 5 项注入完成 ({len(lines)} 行)')
    return 0


if __name__ == '__main__':
    # Backup first
    import shutil
    shutil.copy2(TARGET, BACKUP)
    print(f'[Backup] {BACKUP}')
    sys.exit(main())
