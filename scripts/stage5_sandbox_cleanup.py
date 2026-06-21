#!/usr/bin/env python3
"""
Stage 5 强制闭环补丁：
  (a) 容器重构：canvas-wrapper → game-canvas-sandbox
  (b) 全面触控隔离：pointer-events 保护
  (c) 旧文件物理清理 + main.js 路由摘除
"""
import os, sys, shutil, re

SRC = '/root/original-project/frontend/src'
VIEWS = f'{SRC}/views'
UTILS = f'{SRC}/utils'
MAIN_JS = f'{SRC}/main.js'

changes_log = []


def patch_file(filepath, label, old_str, new_str):
    """Apply a single replace; log success/failure."""
    with open(filepath, 'r') as f:
        content = f.read()
    if old_str not in content:
        changes_log.append(f'  ❌ {label}: old string NOT FOUND in {os.path.basename(filepath)}')
        # try to show context
        for pat in old_str.split('\n')[:2]:
            if pat.strip() and pat.strip() in content:
                changes_log.append(f'     (partial match found for "{pat.strip()[:60]}...")')
                break
        return False
    content = content.replace(old_str, new_str, 1)  # replace first occurrence only
    with open(filepath, 'w') as f:
        f.write(content)
    changes_log.append(f'  ✅ {label}')
    return True


def delete_file(filepath, label):
    if os.path.exists(filepath):
        os.remove(filepath)
        changes_log.append(f'  🗑️  Deleted: {label}')
    else:
        changes_log.append(f'  ⚠️  Not found (skip): {label}')


# =========================================================================
# (a) NewBattleView.vue — 容器重构 + 触控隔离
# =========================================================================
NBV = f'{VIEWS}/NewBattleView.vue'

patch_file(NBV, 'NBV: canvas-wrapper → game-canvas-sandbox (template)',
    '      <div class="canvas-wrapper" ref="canvasWrapper">\n        <div class="canvas-container" ref="canvasContainer">\n          <canvas ref="mapCanvas"></canvas>\n        </div>\n        <!-- Legend -->\n        <div class="map-legend">',
    '      <div class="game-canvas-sandbox" ref="canvasWrapper">\n        <div class="canvas-container" ref="canvasContainer">\n          <canvas ref="mapCanvas"></canvas>\n        </div>\n        <!-- Legend -->\n        <div class="map-legend">')

patch_file(NBV, 'NBV: .canvas-wrapper CSS → .game-canvas-sandbox',
    '/* Canvas */\n.canvas-wrapper {\n  background: #061218;\n  border: 1px solid rgba(255,176,0,0.08);\n  overflow: auto;\n  position: relative;\n  flex: 1;\n  min-height: 0;\n}',
    '/* Canvas — 沙盒隔离容器（脱离流式布局，独立滚动）*/\n.game-canvas-sandbox {\n  position: relative;\n  overflow: auto;\n  flex: 1;\n  min-height: 0;\n  background: #061218;\n  border: 1px solid rgba(255,176,0,0.08);\n  contain: layout size;\n}')

# Add pointer-events: none to floating UI wrapper (battle-header + toolbar) for safety
# These are above the canvas but pointer-events isolation is belt-and-suspenders
patch_file(NBV, 'NBV: pointer-events isolation on .battle-header',
    '.battle-header {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 8px 16px;\n  background: rgba(5,20,30,0.9);\n  border-bottom: 1px solid rgba(255,176,0,0.12);\n  flex-shrink: 0;\n}',
    '.battle-header {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 8px 16px;\n  background: rgba(5,20,30,0.9);\n  border-bottom: 1px solid rgba(255,176,0,0.12);\n  flex-shrink: 0;\n  pointer-events: auto;\n}')

patch_file(NBV, 'NBV: pointer-events isolation on .battle-toolbar',
    '.battle-toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 16px;\n  background: rgba(2,9,17,0.88);\n  border-bottom: 1px solid rgba(0,255,65,0.08);\n  flex-shrink: 0;\n}',
    '.battle-toolbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 16px;\n  background: rgba(2,9,17,0.88);\n  border-bottom: 1px solid rgba(0,255,65,0.08);\n  flex-shrink: 0;\n  pointer-events: auto;\n}')

# Ensure .map-legend has explicit pointer-events: none (already does, verify)
patch_file(NBV, 'NBV: .map-legend pointer-events reinforce',
    '.map-legend {\n  position: absolute;\n  bottom: 6px;\n  left: 6px;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  background: rgba(0,0,0,0.78);\n  padding: 5px 10px;\n  font-size: 9px;\n  color: rgba(255,255,255,0.5);\n  font-family: \'Fira Code\', monospace;\n  z-index: 6;\n  max-width: calc(100% - 12px);\n  pointer-events: none;\n}',
    '.map-legend {\n  position: absolute;\n  bottom: 6px;\n  left: 6px;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  background: rgba(0,0,0,0.78);\n  padding: 5px 10px;\n  font-size: 9px;\n  color: rgba(255,255,255,0.5);\n  font-family: \'Fira Code\', monospace;\n  z-index: 6;\n  max-width: calc(100% - 12px);\n  pointer-events: none;\n  user-select: none;\n}')


# =========================================================================
# (b) NewBattlefieldView.vue — 容器重构 + 触控隔离
# =========================================================================
NBF = f'{VIEWS}/NewBattlefieldView.vue'

patch_file(NBF, 'NBFV: canvas-wrapper → game-canvas-sandbox (template)',
    '      <!-- Canvas Hex Grid -->\n      <div class="canvas-wrapper" ref="canvasWrapper">\n        <div class="canvas-container" ref="canvasContainer"></div>\n        <div class="cursor-hint" v-if="hoverCoord">悬停: {{ hoverCoord }}</div>\n      </div>',
    '      <!-- Canvas Hex Grid -->\n      <div class="game-canvas-sandbox" ref="canvasWrapper">\n        <div class="canvas-container" ref="canvasContainer"></div>\n        <div class="cursor-hint" v-if="hoverCoord">悬停: {{ hoverCoord }}</div>\n      </div>')

patch_file(NBF, 'NBFV: .canvas-wrapper CSS → .game-canvas-sandbox',
    '.canvas-wrapper { flex: 1; background: #080c10; border: 1px solid rgba(255,176,0,0.15); position: relative; overflow: hidden; min-height: 300px; }',
    '/* Canvas — 沙盒隔离容器 */\n.game-canvas-sandbox { flex: 1; background: #080c10; border: 1px solid rgba(255,176,0,0.15); position: relative; overflow: hidden; min-height: 300px; contain: layout size; }')

# Add pointer-events protection: the cursor-hint already has it, but also protect
# the map-info-bar, terrain-palette, spacing-bar from bleeding into canvas
patch_file(NBF, 'NBFV: pointer-events auto on .map-info-bar',
    '.map-info-bar { display: flex; align-items: center; gap: 24px; background: #001e2b; border: 1px solid rgba(255,176,0,0.15); padding: 12px 20px; margin-bottom: 16px; flex-wrap: wrap; flex-shrink: 0; }',
    '.map-info-bar { display: flex; align-items: center; gap: 24px; background: #001e2b; border: 1px solid rgba(255,176,0,0.15); padding: 12px 20px; margin-bottom: 16px; flex-wrap: wrap; flex-shrink: 0; pointer-events: auto; }')

patch_file(NBF, 'NBFV: pointer-events auto on .terrain-palette',
    '.terrain-palette { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 12px 0; flex-shrink: 0; }',
    '.terrain-palette { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 12px 0; flex-shrink: 0; pointer-events: auto; }')

patch_file(NBF, 'NBFV: pointer-events auto on .spacing-bar',
    '.spacing-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 0; flex-shrink: 0; border-top: 1px solid rgba(159,142,120,0.1); }',
    '.spacing-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 0; flex-shrink: 0; border-top: 1px solid rgba(159,142,120,0.1); pointer-events: auto; }')

# Add cursor-hint pointer-events reinforce
patch_file(NBF, 'NBFV: .cursor-hint pointer-events reinforce',
    '.cursor-hint { position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.8); color: #ffb000; padding: 4px 12px; font-size: 11px; font-family: \'Fira Code\', monospace; border: 1px solid rgba(255,176,0,0.3); pointer-events: none; z-index: 10; }',
    '.cursor-hint { position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.8); color: #ffb000; padding: 4px 12px; font-size: 11px; font-family: \'Fira Code\', monospace; border: 1px solid rgba(255,176,0,0.3); pointer-events: none; user-select: none; z-index: 10; }')

# Sidebar — ensure pointer-events isolation (it's position:fixed, already has z-index:50)
patch_file(NBF, 'NBFV: sidebar pointer-events auto',
    '.sidebar { position: fixed; left: 0; top: 0; width: 256px; height: 100vh; background: #083344; border-right: 2px solid rgba(0,150,180,0.4); z-index: 50; display: flex; flex-direction: column; padding: 80px 24px 24px; }',
    '.sidebar { position: fixed; left: 0; top: 0; width: 256px; height: 100vh; background: #083344; border-right: 2px solid rgba(0,150,180,0.4); z-index: 50; display: flex; flex-direction: column; padding: 80px 24px 24px; pointer-events: auto; }')

# Footer — same
patch_file(NBF, 'NBFV: footer pointer-events auto',
    '.footer { position: fixed; bottom: 0; left: 256px; right: 0; background: rgba(2,9,17,0.92); border-top: 1px solid rgba(0,255,65,0.18); padding: 6px 24px; display: flex; justify-content: space-between; align-items: center; font-family: \'Fira Code\', monospace; font-size: 10px; z-index: 50; }',
    '.footer { position: fixed; bottom: 0; left: 256px; right: 0; background: rgba(2,9,17,0.92); border-top: 1px solid rgba(0,255,65,0.18); padding: 6px 24px; display: flex; justify-content: space-between; align-items: center; font-family: \'Fira Code\', monospace; font-size: 10px; z-index: 50; pointer-events: auto; }')


# =========================================================================
# (c) main.js — 摘除 BattlefieldView import + 路由
# =========================================================================
patch_file(MAIN_JS, 'main.js: remove BattlefieldView import',
    "import NewPreparationRoom from './views/NewPreparationRoom.vue';\nimport BattlefieldView from './views/BattlefieldView.vue';\nimport TerminalView from './views/TerminalView.vue';",
    "import NewPreparationRoom from './views/NewPreparationRoom.vue';\nimport TerminalView from './views/TerminalView.vue';")

patch_file(MAIN_JS, 'main.js: remove /battlefield-edit route',
    "  { path: '/battlefield-edit', component: BattlefieldView, meta: { requiresAuth: true } },\n",
    '')


# =========================================================================
# (d) 旧文件物理清理
# =========================================================================
delete_file(f'{VIEWS}/BattlefieldView.vue', 'BattlefieldView.vue')

# .bak-* files in views/
bak_files = []
for d in [VIEWS, UTILS]:
    for f in os.listdir(d):
        fp = os.path.join(d, f)
        if os.path.isfile(fp) and ('.bak-' in f or f.endswith('.s4bak') or f.endswith('.bak-scale') or f.endswith('.bak-iso') or f.endswith('.bak-restore2d')):
            bak_files.append(fp)

for fp in sorted(bak_files):
    delete_file(fp, os.path.relpath(fp, SRC))


# =========================================================================
# Final report
# =========================================================================
print('\n' + '=' * 60)
print(' STAGE 5 — 沙盒隔离与清理 闭环报告')
print('=' * 60)
for line in changes_log:
    print(line)
print('=' * 60)

# Count successes and failures
successes = sum(1 for l in changes_log if '✅' in l or '🗑️' in l)
failures = sum(1 for l in changes_log if '❌' in l)
skips = sum(1 for l in changes_log if '⚠️' in l)
print(f'\nResult: {successes} success | {failures} failed | {skips} skipped')
