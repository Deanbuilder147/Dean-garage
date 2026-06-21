#!/usr/bin/env python3
"""
Stage 3: NewBattlefieldView.vue — unify drawHexPath with hexUtils version
- Remove local drawHexPath, use imported drawHexPath from hexUtils
- Change import from 'drawHexPath as drawHexPathCore' to 'drawHexPath'
- Change all drawHexPath(cx, cy) calls to drawHexPath(ctx, cx, cy)
"""
import sys

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

# ====== Fix 1: Remove local drawHexPath function ======
old_local_draw = '''/** 绘制六边形路径（包装函数，使用模块级 ctx） */
function drawHexPath(cx, cy) {
  // hexUtils 的 drawHexPathCore 需要 ctx，我们传入模块级 ctx
  // 注意：这暂时保留了模块级 ctx 的隐式依赖，后续 Phase 3 应改为显式传参
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    const hx = cx + HEX_RADIUS * Math.cos(a)
    const hy = cy + HEX_RADIUS * Math.sin(a)
    if (i === 0) ctx.moveTo(hx, hy)
    else ctx.lineTo(hx, hy)
  }
  ctx.closePath()
}'''

if old_local_draw in content:
    content = content.replace(old_local_draw, '')
    print("[OK] Removed local drawHexPath function")
else:
    print("[WARN] Local drawHexPath not found, check format")

# ====== Fix 2: Change import from drawHexPathCore to drawHexPath ======
old_import = '  drawHexPath as drawHexPathCore, colToLetter, formatCoord,'
new_import = '  drawHexPath, colToLetter, formatCoord,'

if old_import in content:
    content = content.replace(old_import, new_import)
    print("[OK] Import changed: drawHexPathCore → drawHexPath")
else:
    print("[WARN] Import line not found, check format")

# ====== Fix 3: Change all drawHexPath(cx, cy) to drawHexPath(ctx, cx, cy) ======
# Note: ctx is module-level in this file, accessible in the draw function

# We need to be careful about the context. Let's replace:
# drawHexPath(cx, cy) → drawHexPath(ctx, cx, cy)
# But only where cx, cy are local variables in the draw function

count = 0
lines = content.split('\n')
new_lines = []
for line in lines:
    # Match drawHexPath(cx, cy) patterns (possible whitespace variations)
    stripped = line.strip()
    if stripped.startswith('drawHexPath(cx, cy)') and stripped.endswith(')'):
        # Replace with ctx as first arg
        indent = line[:len(line) - len(line.lstrip())]
        # Replace the call
        new_line = line.replace('drawHexPath(cx, cy)', 'drawHexPath(ctx, cx, cy)')
        new_lines.append(new_line)
        count += 1
    else:
        new_lines.append(line)

content = '\n'.join(new_lines)

if count > 0:
    print(f"[OK] Updated {count} drawHexPath(cx, cy) → drawHexPath(ctx, cx, cy) calls")
else:
    print("[WARN] No drawHexPath(cx, cy) calls found")

with open(filepath, 'w') as f:
    f.write(content)

print("[DONE] NewBattlefieldView.vue patched")
