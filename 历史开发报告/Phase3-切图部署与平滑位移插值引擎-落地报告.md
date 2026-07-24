# Phase 3: 切图部署与平滑位移插值引擎 — 落地报告

**日期**: 2026-06-19 21:26  
**状态**: ✅ 全量部署完成，Docker 容器 Healthy  
**依赖**: Phase 2 (2D 棋子 Billboard 渲染)

---

## 一、文件变更统计

| 文件 | 类型 | 变更 | 行数变化 |
|------|:---:|------|:---:|
| `public/assets/sprites/units/DEFAULT_0_idle.png` | **新建** | 默认降级机甲切图 (48×56) | 475B |
| `src/resolvers/unitSpriteResolver.js` | 升级 | 多帧动画帧计数器 | 179 → **274** (+95) |
| `src/views/NewBattleView.vue` | 重构 | Lerp 平滑位移引擎 | 2664 → **2755** (+91) |
| **总计** | | | **+186 行** |

---

## 二、Step 1 — 默认测试切图实例化

### 生成方式

使用 Python Pillow 动态绘制 48×56 像素风机甲图标：

```
头部:   16×14 深灰蓝, 亮橙驾驶舱
躯干:   24×20 深灰蓝, 蓝色核心装甲板
双臂:   10×22 各侧, 含肩甲 + 手部武器
双腿:   10×18 各侧, 含膝甲 + 脚部装甲
外发光: 半透明蓝色光环 (6px 半径)
```

### 部署路径

```
/public/assets/sprites/units/DEFAULT_0_idle.png  →  dist/assets/sprites/units/DEFAULT_0_idle.png
                                                       ↓
                                              Docker: /usr/share/nginx/html/assets/sprites/units/DEFAULT_0_idle.png
```

### 降级链验证

```
getTexture(anyCode, anyDir, anyAction, 'DEFAULT')
  → 精确匹配 MISS → 朝向idle MISS → 默认idle MISS
  → DEFAULT_0_idle.png HIT ✅
  → 475 字节, HTTP 200 可访问
```

**效果**: 即使没有任何单位专属切图，所有棋子自动从"纯代码圆形 Fallback"进化为"DEFAULT_0_idle.png 图片渲染"。

---

## 三、Step 2 — 平滑位移插值引擎 (Lerp)

### 核心数据结构

```javascript
// unitLerpState: Map<unitId, LerpEntry>
const unitLerpState = reactive(new Map())

// LerpEntry:
{
  fromX: number,        // 起点 flatX
  fromY: number,        // 起点 flatY
  toX: number,          // 终点 flatX
  toY: number,          // 终点 flatY
  startTime: number,    // performance.now() 时间戳
  duration: number,     // 动画时长 (ms)
  currentX: number,     // 当前插值 flatX (每帧更新)
  currentY: number,     // 当前插值 flatY
  onComplete: Function, // 动画完成回调
}
```

### 插值算法

```javascript
function _tickLerp() {
  const now = performance.now()

  unitLerpState.forEach((entry, id) => {
    const elapsed = now - entry.startTime
    const rawT = Math.min(elapsed / entry.duration, 1.0)

    // easeInOutCubic: 启动缓入 → 中段加速 → 抵达缓出
    const t = rawT < 0.5
      ? 4 * rawT * rawT * rawT
      : 1 - Math.pow(-2 * rawT + 2, 3) / 2

    entry.currentX = entry.fromX + (entry.toX - entry.fromX) * t
    entry.currentY = entry.fromY + (entry.toY - entry.fromY) * t

    if (rawT >= 1.0) {
      // 动画完成 → 触发回调 → 清除状态
      entry.currentX = entry.toX
      entry.currentY = entry.toY
      entry.onComplete?.()
      unitLerpState.delete(id)
    }
  })

  hexGrid.value?.redraw()  // 每帧触发 Canvas 重绘

  if (unitLerpState.size > 0) {
    requestAnimationFrame(_tickLerp)  // 继续下一帧
  }
}
```

### 动画时长自动计算

```javascript
// executeMove 中:
const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
const duration = Math.max(200, Math.min(600, distance * 2.5))
// 最近距离: 200ms, 最远距离: 600ms, 典型单格: ~300ms
```

### executeMove 新流程

```
用户点击目标格
  │
  ├─ 1. computeDirection(from, to) → setUnitVisual(id, dir, 'move')
  ├─ 2. combatAPI.move() → API 调用 (后端移动)
  │
  ├─ 3. API 成功后:
  │     startLerpAnimation(unitId, fromFlat, toFlat, duration, onComplete)
  │       │
  │       ├─ _tickLerp() → 每帧更新 currentX/Y → hexGrid.redraw()
  │       └─ 动画完成 → refreshState() → setUnitVisual(id, dir, 'idle')
  │
  └─ 4. API 失败:
        stopLerpAnimation(id) → setUnitVisual(id, 0, 'idle') → cancelAction()
```

### drawBattleScene 集成

```javascript
// Z-order 预计算阶段:
const { flatX, flatY } = getUnitDrawFlat(u)  // 自动判断 lerp/静态

// getUnitDrawFlat 内部:
function getUnitDrawFlat(unit) {
  const lerpEntry = unitLerpState.get(unit.id)
  if (lerpEntry?.currentX !== undefined) {
    return { flatX: lerpEntry.currentX, flatY: lerpEntry.currentY }
  }
  // fallback: 静态六角中心
  return pointyTopCenter(unit.q, unit.r, ...)
}
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| API 调用在 lerp 之前 | 先确认移动成功，避免动画后回滚 |
| lerp 运行期间不 refreshState | 避免后端数据覆盖插值位置 |
| easeInOutCubic 缓动函数 | 开始慢→中间快→结束慢，模拟机甲加速惯性 |
| performance.now() 时间基准 | 高精度，不受系统时钟调整影响 |
| 动画时长与距离成正比 | 远距离移动看起来更快，近距离不显拖沓 |

---

## 四、Step 3 — 多帧动画扩展机制

### SpriteResolver 新增配置

```javascript
_frameDurations: {  // 各状态帧间隔 (ms)
  idle:    150,
  move:    120,
  attack:  100,
  damaged: 200,
  defend:  150,
  wait:    150,
},

_totalFrames: {     // 各状态总帧数
  idle:    1,       // 单帧静止 (Phase 3)
  move:    4,       // 预留 4 帧 (Phase 4+)
  attack:  3,       // 预留 3 帧
  damaged: 2,       // 预留 2 帧
  defend:  1,
  wait:    1,
},
```

### getFrameIndex 时间基准帧计数器

```javascript
getFrameIndex(actionState) {
  const total = this._totalFrames[actionState] || 1
  if (total <= 1) return 0
  const interval = this._frameDurations[actionState] || 150
  return Math.floor(Date.now() / interval) % total
}
```

所有同动作状态的单位共享同一 `Date.now()` 时间基准，产生同步动画节奏。

### 多帧切图命名规范

```
单帧 (向后兼容):
  {unitCode}_{direction}_{actionState}.png
  例: KMF-001_0_idle.png

多帧 (Phase 4+ 启用):
  {unitCode}_{direction}_{actionState}_f{frameIndex}.png
  例: KMF-001_2_move_f0.png, KMF-001_2_move_f1.png, ...
```

### getTexture 降级链 (Phase 3 升级版)

```
优先级 1 → {code}_{dir}_{action}_f{frame}.png  ← 精确多帧 (totalFrames>1 时)
优先级 2 → {code}_{dir}_{action}.png            ← 精确单帧 (向后兼容)
优先级 3 → {code}_{dir}_idle.png                ← 朝向降级
优先级 4 → {code}_0_idle.png                    ← 默认朝向
优先级 5 → DEFAULT_0_idle.png                   ← 通用降级 (475B, Phase 3 实例化)
优先级 6 → null → Canvas Fallback                ← 代码兜底
```

---

## 五、部署验证

### 构建链接

```
JS:   index-De-TW5pZ.js (298KB)
CSS:  index-ncHV6Gx-.css (88KB)
切图:  dist/assets/sprites/units/DEFAULT_0_idle.png (475B)
Docker: mecha-frontend (Healthy)
HTTP:  200 OK
```

### 验证清单

| 检查项 | 方法 | 结果 |
|--------|------|:---:|
| DEFAULT_0_idle.png 生成 | Pillow 绘制 | ✅ 475B, 48×56 |
| SpriteResolver getFrameIndex 存在 | grep dist JS | ✅ |
| SpriteResolver getTexture 含帧降级 | grep source | ✅ |
| unitLerpState 声明 | grep source | ✅ |
| startLerpAnimation 函数 | grep source | ✅ |
| _tickLerp + requestAnimationFrame | grep dist JS | ✅ |
| easeInOutCubic 公式 | grep source | ✅ |
| getUnitDrawFlat 函数 | grep source | ✅ |
| executeMove lerp 集成 | grep source | ✅ |
| drawBattleScene getUnitDrawFlat | grep source | ✅ |
| refreshState lerp cleanup | grep source | ✅ |
| setTransform(1,0,0,1,0,0) 保留 | grep dist JS | ✅ |
| performance.now() | grep dist JS | ✅ |
| 4/4 patches 全部通过 | patch script | ✅ |
| 9/9 validation 通过 | patch script | ✅ |
| Vite build 成功 | npx vite build | ✅ |
| Docker 容器 Healthy | docker ps | ✅ |
| 页面 HTTP 200 | curl | ✅ |
| 切图 HTTP 200 + 475B | curl | ✅ |

### 备份位置

```
/root/original-project/frontend/backups/20260619-phase2-sprite/
  ├── NewBattleView.vue           (Phase 1)
  ├── NewBattleView.vue.phase2.bak (Phase 2 快照)
  ├── unitSpriteResolver.js.phase2.bak (Phase 2 快照)
```

---

## 六、平滑位移插值算法总结

```
输入:  fromFlatX, fromFlatY, toFlatX, toFlatY (flat 坐标系)
时长:  distance → max(200, min(600, distance * 2.5)) ms

每帧 (requestAnimationFrame):
  rawT = elapsed / duration                          ← 进度 [0, 1]
  t    = easeInOutCubic(rawT)                        ← 缓动曲线
  curX = fromX + (toX - fromX) * t                   ← 线性插值
  curY = fromY + (toY - fromY) * t
  hexGrid.redraw()                                   ← 触发 Canvas 重绘

完成:
  currentX = toX, currentY = toY                     ← 精确抵达
  refreshState() + setUnitVisual(id, dir, 'idle')   ← 恢复后端数据
```

### 数学正确性保证

- **坐标系**: 所有插值在 flat 坐标空间 (hexUtils 核心数学) 进行
- **渲染**: drawBattleScene 通过 `getUnitDrawFlat` 获取插值后的 flatX/Y → ISO 矩阵变换 → screenX/Y → Billboard 1:1 绘制
- **不侵入 HexGridCanvas**: lerp 完全在 NewBattleView 层实现，仅通过 `hexGrid.redraw()` 触发重绘
- **宪法合规**: 所有六边形计算通过 hexUtils 统一入口，无边距硬编码

---

## 七、当前里程碑状态

```
Phase 1 ✅ 协议设计: direction + actionState + Sprite Resolver 接口 + Billboard 数学
Phase 2 ✅ 运行时代码: Billboard 5 步绘制 + 4 级降级链 + 状态机绑定
Phase 3 ✅ 切图实例化 + 平滑位移插值 + 多帧动画扩展接口
Phase 4 ⏳ 动画帧实例 (move 4 帧 / attack 3 帧切图制作与部署)
```

### 当前运行时行为

1. **有专属切图时**: `getTexture(code, dir, action)` → 精确命中图片 → Billboard 1:1 渲染
2. **无专属切图时**: 降级链 → `DEFAULT_0_idle.png` (475B 机甲图标) → Billboard 渲染
3. **切图加载中或完全无资源**: Canvas Fallback (派系色圆形 + 字母)
4. **移动时**: easeInOutCubic 平滑插值, actionState='move', 方向实时更新
5. **多帧预备**: getFrameIndex 已就绪, 一旦放入多帧 PNG 即刻激活

---

*此报告由 Phase 3 全量代码落地自动生成。*
*前置报告: Phase 2 → `/Users/dingxuyang/Desktop/Phase2-2D棋子Billboard渲染与状态机-落地报告.md`*
*协议文档: `2D棋子9视图朝向与动画状态机-协议设计.md`*
