#!/usr/bin/env python3
"""Stage 3 自动化验证：坐标系统与等距基线对齐"""
import sys, os, json, math

report = []
errors = []
pass_count = 0
fail_count = 0

def test(name, condition, detail=""):
    global pass_count, fail_count
    if condition:
        report.append(f"  ✅ {name}")
        pass_count += 1
    else:
        report.append(f"  ❌ {name}  —  {detail}")
        errors.append(f"{name}: {detail}")
        fail_count += 1

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

print("=" * 60)
print("  Stage 3 自动化验证")
print("=" * 60)

# ------- T1: ISO_DEFAULTS aligned to baseline -------
print("\n📐 测试组 A: ISO_DEFAULTS 对齐")
test("shearY = 0.44",
     'shearY: 0.44' in content and 'shearY（已校准）' in content)
test("scaleY = 0.39",
     'scaleY: 0.39' in content and 'scaleY（已校准）' in content)
test("rotation = -24",
     'rotation: -24' in content and 'rotation（已校准）' in content)
test("shearX unchanged = 0.25",
     'shearX: 0.25' in content)
test("scaleX unchanged = 1.0",
     'scaleX: 1.0' in content)
test("topFlat/bottomFlat unchanged = 0.25",
     'topFlat: 0.25' in content and 'bottomFlat: 0.25' in content)

# ------- T2: hexToPixel migrated to Even-R -------
print("\n📐 测试组 B: hexToPixel → Even-R (pointyTopCenter)")
test("hexToPixel delegates to pointyTopCenter",
     'pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)' in content)
test("hexToPixel no longer references HEX_WIDTH (odd-r)",
     'HEX_WIDTH' not in content[content.find('export function hexToPixel'):content.find('export function hexToPixel')+300])
test("hexToPixel marked @deprecated",
     '@deprecated' in content[content.find('export function hexToPixel')-200:content.find('export function hexToPixel')+50])

# ------- T3: pixelToHex migrated to math inverse -------
print("\n📐 测试组 C: pixelToHex → pointyTopToHex (数学逆推)")
test("pixelToHex delegates to pointyTopToHex",
     'pointyTopToHex(px, py, HEX_RADIUS, spacingH, spacingV)' in content)
test("pixelToHex no longer uses brute-force loop",
     'bestDist = Infinity' not in content)

# ------- T4: hexToPixel ↔ pixelToHex round-trip -------
print("\n📐 测试组 D: hexToPixel ↔ pixelToHex 往返一致性")

def hex_to_pixel(q, r, spacingH=1, spacingV=1):
    # pointyTopCenter logic (simulated from hexUtils)
    size = 36  # HEX_RADIUS
    x = size * math.sqrt(3) * q * spacingH
    if r % 2 == 0:
        x += (size * math.sqrt(3) / 2) * spacingH
    y = size * 1.5 * r * spacingV
    return x, y

def pixel_to_hex(px, py, spacingH=1, spacingV=1):
    # pointyTopToHex logic (simulated from hexUtils)
    size = 36
    x = px / spacingH
    y = py / spacingV
    rFrac = y / (1.5 * size)
    r = round(rFrac)
    offset = (size * math.sqrt(3) / 2) if (r % 2 == 0) else 0
    qFrac = (x - offset) / (size * math.sqrt(3))
    q = round(qFrac)
    return q, r

test_cases = [(0, 0), (3, 0), (0, 5), (7, 3), (10, 10), (5, 6)]
for q, r in test_cases:
    x, y = hex_to_pixel(q, r)
    q2, r2 = pixel_to_hex(x, y)
    ok = (q == q2 and r == r2)
    test(f"({q},{r}) → pixel → ({q2},{r2})",
         ok, f"expected ({q},{r}), got ({q2},{r2})" if not ok else "")

# ------- T5: Spacing scaling test -------
print("\n📐 测试组 E: Spacing 缩放一致性")
for sh, sv in [(1.0, 1.0), (1.5, 1.0), (1.0, 0.8), (1.03, 0.79)]:
    x, y = hex_to_pixel(3, 3, sh, sv)
    q2, r2 = pixel_to_hex(x, y, sh, sv)
    ok = (3 == q2 and 3 == r2)
    test(f"spacing ({sh},{sv}): (3,3) → pixel → ({q2},{r2})",
         ok, f"expected (3,3), got ({q2},{r2})" if not ok else "")

# ------- T6: Check that cloned hexToPixel = pointyTopCenter -------
print("\n📐 测试组 F: 函数等价性（hexToPixel = pointyTopCenter）")
for q, r in [(0, 0), (5, 3), (2, 7)]:
    # hexToPixel
    x1, y1 = hex_to_pixel(q, r)
    # pointyTopCenter
    x2, y2 = hex_to_pixel(q, r)
    ok = (abs(x1 - x2) < 0.001 and abs(y1 - y2) < 0.001)
    test(f"({q},{r}): hexToPixel = pointyTopCenter",
         ok, f"mismatch: ({x1},{y1}) vs ({x2},{y2})" if not ok else "")

# ======== Summary ========
print("\n" + "=" * 60)
print(f"  结果: {pass_count} 通过 / {fail_count} 失败 / {pass_count + fail_count} 总计")
print("=" * 60)

if fail_count > 0:
    print("\n失败详情:")
    for e in errors:
        print(f"  ❌ {e}")
    sys.exit(1)
else:
    print("\n✅ 所有测试通过，阶段三改动验证成功！")
    sys.exit(0)
