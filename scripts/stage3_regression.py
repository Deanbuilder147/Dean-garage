#!/usr/bin/env python3
"""Stage 3 回归验证 + 完整检查"""
import re, os

files = {
    'hexUtils': '/root/original-project/frontend/src/utils/hexUtils.js',
    'battlefield': '/root/original-project/frontend/src/views/NewBattlefieldView.vue',
    'battle': '/root/original-project/frontend/src/views/NewBattleView.vue',
}

def load(path):
    with open(path) as f:
        return f.read()

c = load(files['hexUtils'])
bf = load(files['battlefield'])
bv = load(files['battle'])

checks = []

def check(name, ok, detail=""):
    status = "OK" if ok else "FAIL"
    checks.append((name, status, detail if not ok else ""))

# === Stage 1-2 Regression ===
print("=" * 60)
print("  Stage 1-2 回归验证")
print("=" * 60)

for const_name in ['HEX_WIDTH', 'HEX_HEIGHT', 'HEX_APOTHEM', 'HEX_RADIUS',
                    'DEFAULT_SPACING_H', 'DEFAULT_SPACING_V', 'DEFAULT_OFFSET_FACTOR']:
    check(const_name, f'export const {const_name}' in c)

for fn in ['pointyTopCenter', 'pointyTopToHex', 'flatTopCenter', 'flatTopToHex',
           'flatToIso', 'isoToFlat', 'drawHexPath', 'drawHexPathDeformed',
           'getHexNeighbors', 'cellToScreen', 'screenToWorld',
           'colToLetter', 'letterToCol', 'formatCoord', 'parseCoord',
           'convertMapFormat']:
    check(f'fn:{fn}', f'function {fn}' in c or f'export function {fn}' in c)

check('TERRAIN_COLORS', 'TERRAIN_COLORS' in c)
check('UNIVERSAL_TERRAIN_MAP', 'UNIVERSAL_TERRAIN_MAP' in c)
check('terrain count=16', c.count("cost:") >= 16, f"found {c.count('cost:')}")

# === Stage 3 New Checks ===
print()
print("=" * 60)
print("  Stage 3 变更验证")
print("=" * 60)

# ISO_DEFAULTS
m = re.search(r'export const ISO_DEFAULTS = \{([^}]+)\}', c, re.DOTALL)
if m:
    iso = m.group(1)
    check('ISO shearY=0.44', 'shearY: 0.44' in iso)
    check('ISO scaleY=0.39', 'scaleY: 0.39' in iso)
    check('ISO rotation=-24', 'rotation: -24' in iso)
    check('ISO shearX=0.25', 'shearX: 0.25' in iso)
    check('ISO scaleX=1.0', 'scaleX: 1.0' in iso)

# hexToPixel migrated
idx = c.find('export function hexToPixel')
section = c[idx:idx+400]
check('h2p uses pointyTopCenter', 'pointyTopCenter(q, r, HEX_RADIUS' in section)
check('h2p no HEX_WIDTH ref', 'HEX_WIDTH' not in section)

# pixelToHex migrated
idx = c.find('export function pixelToHex')
section2 = c[idx:idx+400]
check('p2h uses pointyTopToHex', 'pointyTopToHex(px, py, HEX_RADIUS' in section2)

# NewBattlefieldView.vue unified drawHexPath
check('BF no local drawHexPath', 'function drawHexPath(cx, cy)' not in bf)
check('BF uses drawHexPath(ctx,...)', 'drawHexPath(ctx, cx, cy)' in bf)

# NewBattleView.vue imports clean
check('BV no dead hexToPixelCore', 'hexToPixel as hexToPixelCore' not in bv)
check('BV no dead pixelToHexCore', 'pixelToHex as pixelToHexCore' not in bv)

# Braces
opens = c.count('{')
closes = c.count('}')
check('braces balanced', opens == closes, f'{{={opens}, }}={closes}')

# Summary
print()
print("=" * 60)
passed = sum(1 for _, s, _ in checks if s == "OK")
failed = sum(1 for _, s, _ in checks if s == "FAIL")
for name, status, detail in checks:
    mark = "+" if status == "OK" else "X"
    print(f"  [{mark}] {name} {detail}")
print(f"\n  Total: {passed} passed, {failed} failed")
print("=" * 60)
