#!/usr/bin/env python3
import subprocess, re

PASS = 0; FAIL = 0

def ck(label, cmd, pattern):
    global PASS, FAIL
    out = subprocess.check_output(cmd, shell=True).decode()
    ok = bool(re.search(pattern, out, re.MULTILINE))
    print(f'  {"✅" if ok else "❌"} {label}')
    if ok: PASS += 1
    else: FAIL += 1; print(f'     missing: {pattern[:80]}')

f1 = '/root/original-project/frontend/src/views/NewBattleView.vue'
f2 = '/root/original-project/frontend/src/views/NewBattlefieldView.vue'
f3 = '/root/original-project/frontend/src/utils/hexUtils.js'

print('=== Stage 1: Constants ===')
ck('f1: HEX_WIDTH import',   f'grep "HEX_WIDTH" {f1} | head -1', r'HEX_WIDTH')
ck('f1: HEX_HEIGHT import',  f'grep "HEX_HEIGHT" {f1} | head -1', r'HEX_HEIGHT')
ck('f2: hexUtils import',    f'grep "hexUtils" {f2} | head -1', r'hexUtils')
# no local const HEX check (grep -c returns 0 if not found)
r = subprocess.run(f'grep -c "const HEX_WIDTH" {f2} || true', shell=True, capture_output=True, text=True)
v = r.stdout.strip()
ok = v == '0' or v == ''
if ok: PASS += 1; print(f'  ✅ f2: no local HEX hardcoding')
else: FAIL += 1; print(f'  ❌ f2: no local HEX hardcoding (count={v})')

print('\n=== Stage 2: Terrain ===')
ck('f1: UNIVERSAL_TERRAIN_MAP', f'grep "UNIVERSAL_TERRAIN_MAP" {f1}', r'UNIVERSAL_TERRAIN_MAP')
ck('f1: convertMapFormat',      f'grep "convertMapFormat" {f1}', r'convertMapFormat')

print('\n=== Stage 3: Coordinates ===')
ck('f1: pointyTopCenter',   f'grep "pointyTopCenter" {f1} | head -1', r'pointyTopCenter')
ck('f2: pointyTopCenter',   f'grep "pointyTopCenter" {f2} | head -1', r'pointyTopCenter')
ck('f2: pointyTopToHex',    f'grep "pointyTopToHex" {f2} | head -1', r'pointyTopToHex')
ck('f1: drawHexPath',       f'grep "drawHexPath" {f1} | head -1', r'drawHexPath')
ck('f2: drawHexPath',       f'grep "drawHexPath" {f2} | head -1', r'drawHexPath')
ck('f3: ISO_DEFAULTS ok',   f'grep -A8 "ISO_DEFAULTS" {f3}', r'scaleX: 1\.00')

print('\n=== Stage 4: UI & Events ===')
ck('f1: pointer-events:none', f'grep "pointer-events: none" {f1}', r'pointer-events')
ck('f1: dragStartOX',         f'grep "dragStartOX" {f1}', r'dragStartOX')

print('\n=== Stage 5: Isometric Matrix ===')
ck('f1: ISO_DEFAULTS import',   f'grep "ISO_DEFAULTS" {f1} | head -1', r'ISO_DEFAULTS')
ck('f1: ISO constant',          f'grep "const ISO = ISO_DEFAULTS" {f1}', r'ISO_DEFAULTS')
ck('f1: iso CTM',               f'grep "ctx.transform" {f1}', r'ISO\.scaleX')
ck('f1: inverse det',           f'grep -A5 "canvasPosToWorld" {f1}', r'det = ISO\.scaleX')
ck('f1: canvas iso sizing',     f'grep "cw = worldW" {f1}', r'ISO\.scaleX')
ck('f1: centerGrid iso',        f'grep "isoCenterX" {f1}', r'isoCenterX')
ck('f1: zoomReset iso',         f'grep "mapW = ww" {f1}', r'ISO\.scaleX')
ck('f2: ISO_DEFAULTS import',   f'grep "ISO_DEFAULTS" {f2} | head -1', r'ISO_DEFAULTS')
ck('f2: ISO constant',          f'grep "const ISO = ISO_DEFAULTS" {f2}', r'ISO_DEFAULTS')
ck('f2: iso CTM',               f'grep "ctx.transform" {f2}', r'ISO\.scaleX')
ck('f2: inverse det',           f'grep -A5 "getWorldPos" {f2}', r'det = ISO\.scaleX')
ck('f2: centerGrid iso',        f'grep "isoX = flatX" {f2}', r'isoX = flatX')
ck('f2: canvas iso sizing',     f'grep "totalW = worldW" {f2}', r'ISO\.scaleX')

print(f'\n{"="*50}')
print(f'Results: {PASS} passed, {FAIL} failed out of {PASS+FAIL}')
