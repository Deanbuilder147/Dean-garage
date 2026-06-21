#!/usr/bin/env python3
"""
Phase 3: 生成默认降级切图 DEFAULT_0_idle.png
48×56 像素，机甲正面站立，像素风格
"""
from PIL import Image, ImageDraw
import os

W, H = 48, 56
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# === 机甲轮廓 (深灰蓝底色) ===
# 头部
head_x, head_y, head_w, head_h = 16, 0, 16, 14
draw.rectangle([head_x, head_y, head_x + head_w, head_y + head_h], fill=(40, 50, 70, 255))
# 头部高光
draw.rectangle([head_x + 2, head_y + 2, head_x + head_w - 2, head_y + 4], fill=(80, 90, 110, 255))

# 驾驶舱 (亮橙色)
draw.rectangle([head_x + 2, head_y + 4, head_x + head_w - 2, head_y + 8], fill=(255, 140, 30, 255))
draw.point((head_x + 7, head_y + 6), fill=(255, 200, 100, 255))

# 躯干
body_x, body_y, body_w, body_h = 12, 12, 24, 20
draw.rectangle([body_x, body_y, body_x + body_w, body_y + body_h], fill=(45, 55, 75, 255))
# 躯干中心装甲板
draw.rectangle([body_x + 4, body_y + 2, body_x + body_w - 4, body_y + body_h - 4], fill=(60, 70, 90, 255))
# 胸部细节
draw.rectangle([body_x + 6, body_y + 6, body_x + body_w - 6, body_y + 8], fill=(80, 180, 220, 230))  # 蓝光核心

# 左臂
arm_lx, arm_ly, arm_lw, arm_lh = 4, 14, 10, 22
draw.rectangle([arm_lx, arm_ly, arm_lx + arm_lw, arm_ly + arm_lh], fill=(50, 60, 80, 255))
# 左肩甲
draw.rectangle([arm_lx - 1, arm_ly - 2, arm_lx + arm_lw + 1, arm_ly + 4], fill=(70, 80, 100, 255))
# 左手武器
draw.rectangle([arm_lx + 2, arm_ly + arm_lh - 2, arm_lx + arm_lw - 2, arm_ly + arm_lh + 4], fill=(90, 90, 100, 255))

# 右臂
arm_rx, arm_ry, arm_rw, arm_rh = 34, 14, 10, 22
draw.rectangle([arm_rx, arm_ry, arm_rx + arm_rw, arm_ry + arm_rh], fill=(50, 60, 80, 255))
# 右肩甲
draw.rectangle([arm_rx - 1, arm_ry - 2, arm_rx + arm_rw + 1, arm_ry + 4], fill=(70, 80, 100, 255))
# 右手武器
draw.rectangle([arm_rx + 2, arm_ry + arm_rh - 2, arm_rx + arm_rw - 2, arm_ry + arm_rh + 4], fill=(90, 90, 100, 255))

# 腰部
draw.rectangle([body_x + 2, body_y + body_h - 2, body_x + body_w - 2, body_y + body_h + 4], fill=(55, 65, 85, 255))

# 左腿
leg_lx, leg_ly, leg_lw, leg_lh = 12, 34, 10, 18
draw.rectangle([leg_lx, leg_ly, leg_lx + leg_lw, leg_ly + leg_lh], fill=(35, 45, 65, 255))
# 左膝装甲
draw.rectangle([leg_lx - 1, leg_ly + 4, leg_lx + leg_lw + 1, leg_ly + 8], fill=(60, 70, 90, 255))
# 左脚
draw.rectangle([leg_lx - 1, leg_ly + leg_lh - 2, leg_lx + leg_lw + 1, leg_ly + leg_lh + 2], fill=(50, 55, 70, 255))

# 右腿
leg_rx, leg_ry, leg_rw, leg_rh = 26, 34, 10, 18
draw.rectangle([leg_rx, leg_ry, leg_rx + leg_rw, leg_ry + leg_rh], fill=(35, 45, 65, 255))
# 右膝装甲
draw.rectangle([leg_rx - 1, leg_ry + 4, leg_rx + leg_rw + 1, leg_ry + 8], fill=(60, 70, 90, 255))
# 右脚
draw.rectangle([leg_rx - 1, leg_ry + leg_rh - 2, leg_rx + leg_rw + 1, leg_ry + leg_rh + 2], fill=(50, 55, 70, 255))

# === 半透明外发光 ===
glow = Image.new('RGBA', (W + 12, H + 12), (0, 0, 0, 0))
for dy in range(-6, 7):
    for dx in range(-6, 7):
        dist = (dx * dx + dy * dy) ** 0.5
        if 4 < dist <= 6:
            alpha = int(max(0, (6 - dist) / 2 * 60))
            if img.getpixel((max(0, min(W-1, W//2 + dx)), max(0, min(H-1, H//2 + dy))))[3] == 0:
                glow.putpixel((W//2 + dx + 6, H//2 + dy + 6), (100, 180, 255, alpha))

glow = glow.crop((6, 6, 6 + W, 6 + H))
img = Image.alpha_composite(img, glow)

out_path = os.path.join(os.path.dirname(__file__), '..', 'DEFAULT_0_idle.png')
img.save(out_path, 'PNG')
print(f'Generated: {out_path} ({W}x{H})')
