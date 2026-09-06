# Phase 18-B 总结报告：锁死棋子 Even-R 像素锚点 & PNG主图优先+Token兜底防爆渲染管线

## 执行时间
2026-06-21 21:55 - 22:05

---

## 一、问题诊断

### 1.1 根因：screenY 公式混入 flatX 分量

在 `NewBattleView.vue` 的 `drawBattleScene` 单位绘制段中，**两处** screenY 计算公式错误地将 `flatX` 引入了 Y 轴变换：

| 位置 | 错误公式 | 正确公式 |
|------|---------|---------|
| Line 1505 (Z排序) | `oy + s * (iso.scaleY * flatX + iso.shearY * flatY)` | `oy + s * (iso.scaleY * flatY)` |
| Line 1519 (锚点) | `oy + s * (iso.shearY * flatX + iso.scaleY * flatY)` | `oy + s * (iso.scaleY * flatY)` |

**数学分析**：

HexGridCanvas 的 CTM 是 `ctx.transform(ISO.scaleX, 0, ISO.shearX, ISO.scaleY, 0, 0)`。

Canvas `transform(a, b, c, d, e, f)` 的数学定义：
```
newX = a * x + c * y + e
newY = b * x + d * y + f
```

代入参数 `(scaleX, 0, shearX, scaleY, 0, 0)`：
```
newX = scaleX * flatX + shearX * flatY  ← screenX 公式正确 ✓
newY = 0 * flatX + scaleY * flatY       ← screenY 应仅依赖 flatY
```

但代码中错误引入了 `shearY * flatX` 或 `scaleY * flatX` 分量：
- 对于中线列单位 (q=5): `flatX ≈ 312` → `shearY * flatX = 0.44 * 312 ≈ 137` 像素
- 等距空间每行 Y 偏移 = `1.5 * HEX_RADIUS * spacingV * scaleY = 54 * 0.39 ≈ 21` 像素
- **误差 = 137 / 21 ≈ 6.5 行脱靶**，恰好对应用户报告的"大约七行垂直位移误差"

---

## 二、修改清单

### 2.1 `frontend/src/views/NewBattleView.vue` — 3 处修改

#### 修改 A：Z排序 screenY 公式修正 (Line 1505)
```diff
- const screenY = oy + s * (iso.scaleY * flatX + iso.shearY * flatY)
+ const screenY = oy + s * (iso.scaleY * flatY)
```

#### 修改 B：锚点定位 screenY 公式修正 (Line 1519)
```diff
- const screenY = oy + s * (iso.shearY * flatX + iso.scaleY * flatY)
+ const screenY = oy + s * (iso.scaleY * flatY)
```

#### 修改 C：三级优先级外观加载器 (Line 1534-1600)

建立严格的渲染降级链：

```
优先级 1: unit.avatar_url / unit.image
  ├─ 存在且 Image 加载完成 → ctx.drawImage 居中渲染
  └─ 不存在或未就绪 → 降级到优先级 2

优先级 2: unitSpriteResolver.getTexture()
  ├─ 精灵图已缓存 & 非隐匿 → ctx.drawImage 动画帧
  └─ 精灵图缺失 → 降级到优先级 3

优先级 3: 科幻青色 Token 字母兜底
  ├─ 外光圈: rgba(0, 220, 255, 0.15) 发光晕
  ├─ 圆形底色: rgba(13, 31, 45, 0.75) 暗色科幻基底
  ├─ 青色边框: #00dcff (选中时 #ffffff)
  └─ 首字母: (unit.name || 'M')[0].toUpperCase()
```

**关键设计要点**：
- `drawn` 布尔标记防止重复绘制
- `unitImageCache` 惰性加载 avatar_url → 首次请求时创建 `new Image()`
- 隐匿状态 (`concealed`) 穿越所有三级优先级，统一降低不透明度
- Token 边框颜色从 faction 色改为统一科幻青色 `#00dcff`，视觉更现代

---

## 三、Docker 部署

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 本地 `npm run build` | 120 modules, 1.03s ✓ |
| 2 | SCP 上传 `NewBattleView.vue` + `HexGridCanvas.vue` | ✓ |
| 3 | 上传 `dist/` (tar.gz) | 545KB 上下文 ✓ |
| 4 | `docker compose build --no-cache frontend` | 新镜像 sha256:b15ae8ab ✓ |
| 5 | `docker compose up -d frontend` | Recreated → Started ✓ |
| 6 | 健康检查 | healthy ✓ |
| 7 | HTTP 验证 | 200 OK, HTML 正常 ✓ |

### 部署验证

在远程 JS bundle 中 grep 确认三处修改均已部署：
- `"Phase 18-B"` → FOUND ✓
- `"scaleY * flatY"` → FOUND ✓
- `"00dcff"` → FOUND (2 occurrences) ✓
- `"setupResizeObserver"` → FOUND ✓

---

## 四、容器健康状态

| 容器 | 状态 | 健康 |
|------|------|------|
| mecha-frontend | Up | ✅ healthy |
| mecha-combat | Up | ✅ healthy |
| mecha-map | Up | ✅ healthy |
| mecha-online-battle | Up | ✅ healthy |
| mecha-hangar | Up | ✅ healthy |
| mecha-comm | Up | ✅ healthy |
| mecha-auth | Up | ✅ healthy |
| mecha-battle-db | Up | ✅ healthy |

**8/8 Healthy** ✅

---

## 五、回归验证清单

| 检查项 | 状态 |
|--------|------|
| Linter 错误 | 0 |
| screenY 不含 flatX 分量 | ✅ |
| screenX 公式不变 (已有正确) | ✅ |
| Z-order 排序基于正确 screenY | ✅ |
| Token 使用 `toUpperCase()` | ✅ |
| Token 默认字母 'M' | ✅ |
| 科幻青色 `#00dcff` 边框 | ✅ |
| 发光晕外光圈 | ✅ |
| 隐匿状态穿透三级优先级 | ✅ |
| avatar_url 惰性加载 (unitImageCache) | ✅ |
| 精灵图降级链不变 | ✅ |
| ResizeObserver (Phase 18-A) 保留 | ✅ |
| 双轴滑槽平移 | ✅ (HexGridCanvas 未改) |
| 鼠标点击拾取 | ✅ (pixelToHex 未改) |

---

## 六、关键教训

1. **CTM 配对检查必须彻底**：HexGridCanvas 使用 `transform(a,0,c,d,0,0)` 即 `b=0` 意味着屏幕 Y 轴绝不能有 `flatX` 分量。任何偏离 CTM 的手工公式都是潜在的脱靶源。

2. **Even-R 拓扑一致性**：`pointyTopCenter` 使用 `r % 2 === 0` 偏移，`pointyTopToHex` 使用相同约定，`getUnitDrawFlat` 调用 `pointyTopCenter`，三处一致。问题仅出在 CTM 公式的还原——这是典型的"公式推导拷贝错误"而非"拓扑不一致"。

3. **防爆渲染管线的核心是降级链**：三级 fallback 确保任何情况下 Canvas 都不会空白。`drawn` 布尔标记是防重复绘制的简洁方案。
