#!/usr/bin/env python3
"""Stage 5 final verification checklist"""
import subprocess, os

PASS = 0; FAIL = 0; WARN = 0
def check(label: str, cmd: str, pattern: str):
    global PASS, FAIL, WARN
    try:
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode()
    except subprocess.CalledProcessError:
        out = ''
    if pattern.startswith('!'):
        ok = pattern[1:] not in out
    else:
        ok = pattern in out
    if ok:
        print(f'  ✅ {label}')
        PASS += 1
    else:
        if pattern.startswith('!'):
            print(f'  ❌ {label} — found banned content: {pattern[1:]}')
        else:
            print(f'  ❌ {label} — pattern not found')
        FAIL += 1

SRC = '/root/original-project/frontend/src'
NBV = f'{SRC}/views/NewBattleView.vue'
NBF = f'{SRC}/views/NewBattlefieldView.vue'
MJ  = f'{SRC}/main.js'

print('=' * 60)
print(' STAGE 5 最终验证 — 沙盒隔离与清理')
print('=' * 60)

print('\n[5a] 容器重构')
check('NBV: game-canvas-sandbox in template', f'grep -c "game-canvas-sandbox" {NBV}', '2')
check('NBV: NO canvas-wrapper left (replaced)', f'grep -c "class=\\"canvas-wrapper\\"" {NBV} || echo 0', '0')
check('NBV: .game-canvas-sandbox CSS rule', f'grep "\.game-canvas-sandbox" {NBV}', 'game-canvas-sandbox')
check('NBV: contain: layout size', f'grep -c "contain:" {NBV} || echo 0', '1')
check('NBF: game-canvas-sandbox in template', f'grep -c "game-canvas-sandbox" {NBF}', '2')
check('NBF: NO canvas-wrapper left', f'grep -c "class=\\"canvas-wrapper\\"" {NBF} || echo 0', '0')
check('NBF: .game-canvas-sandbox CSS rule', f'grep "\.game-canvas-sandbox" {NBF}', 'game-canvas-sandbox')

print('\n[5b] 触控隔离')
check('NBV: battle-header pointer-events: auto', f'grep -A7 "\.battle-header" {NBV} | grep "pointer-events"', 'pointer-events: auto')
check('NBV: battle-toolbar pointer-events: auto', f'grep -A8 "\.battle-toolbar" {NBV} | grep "pointer-events"', 'pointer-events: auto')
check('NBV: map-legend pointer-events: none', f'grep -A11 "\.map-legend" {NBV} | grep "pointer-events"', 'pointer-events: none')
check('NBV: map-legend user-select: none', f'grep -A11 "\.map-legend" {NBV} | grep "user-select"', 'user-select: none')
check('NBF: map-info-bar pointer-events', f'grep -A2 "\.map-info-bar" {NBF} | grep "pointer-events"', 'pointer-events: auto')
check('NBF: terrain-palette pointer-events', f'grep -A2 "\.terrain-palette" {NBF} | grep "pointer-events"', 'pointer-events: auto')
check('NBF: spacing-bar pointer-events', f'grep -A2 "\.spacing-bar" {NBF} | grep "pointer-events"', 'pointer-events: auto')
check('NBF: cursor-hint pointer-events: none', f'grep "\.cursor-hint" {NBF} | grep "pointer-events"', 'pointer-events: none')
check('NBF: sidebar pointer-events: auto', f'grep "\.sidebar" {NBF} | grep "pointer-events"', 'pointer-events: auto')
check('NBF: footer pointer-events: auto', f'grep "\.footer" {NBF} | grep "pointer-events"', 'pointer-events: auto')

print('\n[5c] 物理清理')
check('main.js: NO BattlefieldView import', f'grep "BattlefieldView" {MJ} || echo CLEAN', 'CLEAN')
check('main.js: NO /battlefield-edit route', f'grep "battlefield-edit" {MJ} || echo CLEAN', 'CLEAN')
check('BattlefieldView.vue deleted', f'test -f {SRC}/views/BattlefieldView.vue && echo EXISTS || echo GONE', 'GONE')
check('NO .s4bak files in views/', f'find {SRC}/views -name "*.s4bak" 2>/dev/null | wc -l', '0')
check('NO .bak-* files in views/', f'find {SRC}/views -name "*.bak-*" 2>/dev/null | wc -l', '0')
check('NO .bak-* files in utils/', f'find {SRC}/utils -name "*.bak-*" 2>/dev/null | wc -l', '0')

print(f'\n{"="*60}')
print(f' TOTAL: {PASS} ✅ | {FAIL} ❌ | out of {PASS+FAIL}')
