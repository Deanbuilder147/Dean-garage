# Phase 2: 2D 棋子 Billboard 渲染与动画状态机 — 落地报告

**日期**: 2026-06-19 21:09  
**状态**: ✅ 全量部署完成，Docker 容器 Healthy

---

## 一、文件变更统计

| 文件 | 类型 | 变更 | 行数变化 |
|------|:---:|------|:---:|
| `src/utils/hexUtils.js` | 追加 | 9 视图方向系统 | 499 → **586** (+87) |
| `src/resolvers/unitSpriteResolver.js` | **新建** | 切图资源映射字典 | **179** |
| `src/views/NewBattleView.vue` | 重构 | Billboard 渲染 + 状态机绑定 | 2604 → **2664** (+60) |
| **总计** | | | **+326 行** |

---

## 二、Step 2.1 — hexUtils.js 数学基础扩展

### 9 视图方向枚举（DIRECTIONS）

```
DIRECTIONS = {
  0: { label: 'N', angle: 0, octant: 0 },    // 正北
  1: { label: 'NE', angle: 45, octant: 1 },   // 东北
  2: { label: 'E', angle: 90, octant: 2 },    // 正东
  3: { label: 'SE', angle: 135, octant: 3 },  // 东南
  4: { label: 'S', angle: 180, octant: 4 },   // 正南
  5: { label: 'SW', angle: 225, octant: 5 },  // 西南
  6: { label: 'W', angle: 270, octant: 6 },   // 正西
  7: { label: 'NW', angle: 315, octant: 7 },  // 西北
  8: { label: 'TOP', angle: -1, octant: -1 }, // 正上方俯视
}
DIRECTION_COUNT = 8
```

### 方向计算函数

```javascript
// 通用版：atan2 角度量化为 8 扇区（每扇区 45°）
function computeDirection(fromQ, fromR, toQ, toR) {
  const dq = toQ - fromQ
  const dr = toR - fromR
  const angle = Math.atan2(dr, dq) * (180 / Math.PI)
  const octant = Math.round(angle / 45) + 2  // 偏移至 0=正北
  return ((octant % 8) + 8) % 8
}

// 严格版：仅邻格有效，非邻格返回 null
function computeDirectionStrict(fromQ, fromR, toQ, toR, getNeighborsFn)
```

### 5 项基础验证 ✅

---

## 三、Step 2.2 — unitSpriteResolver.js 切图资源映射

### 接口定义

```javascript
function getTexture(unitCode, direction, actionState, fallbackCode)
  → SpriteTexture | null
```

### SpriteTexture 结构

```javascript
{
  image: Image,          // 已缓存的 Image 对象
  sx: number,            // 裁剪源 X（Atlas 模式）
  sy: number,            // 裁剪源 Y
  sw: number,            // 裁剪源宽
  sh: number,            // 裁剪源高
  renderW: number,       // 渲染目标宽
  renderH: number,       // 渲染目标高
  anchorX: number,       // 锚点 X 偏移（底部居中）
  anchorY: number,       // 锚点 Y 偏移
}
```

### 4 级降级链

```
优先级 1 → {unitCode}_{direction}_{actionState}.png  ← 精确命中
优先级 2 → {unitCode}_{direction}_idle.png           ← 朝向降级
优先级 3 → {unitCode}_0_idle.png                     ← 默认朝向
优先级 4 → DEFAULT_0_idle.png                        ← 通用降级
优先级 5 → null → Canvas Fallback 圆形字母            ← 纯代码渲染
```

### 资源路径规范

```
/assets/sprites/units/{unitCode}_{direction}_{actionState}.png

示例:
  MCH-A1_0_idle.png       → 机甲A1, 正北, 待机
  MCH-A1_2_move.png       → 机甲A1, 正东, 移动
  MCH-A1_4_attack.png     → 机甲A1, 正南, 攻击
  UNI-B1_6_damaged.png    → 敌方B1, 正西, 受损
```

### 异步加载与缓存

```javascript
const _cache = new Map()            // key → Image 对象
async function preload(manifest)    // 批量预加载
```

---

## 四、Step 2.3 — Billboard 渲染核心（drawBattleScene 重构）

### Z-Order 排序升级

```
旧版: units.sort((a,b) => a.flatY - b.flatY)          ← 仅考虑 Y 坐标
新版: units.sort((a,b) => a.screenY - b.screenY)       ← 完整 ISO 遮挡计算

screenY = oy + scale × (scaleY*flatX + shearY*flatY)    ← 精确 ISO 矩阵变换
```

### 5 步解耦绘制流程（Billboard 公告牌效果）

```
// === 前提：ctx 处于 ISO 仿射变换矩阵下 ===

Step A — 预计算棋子锚点（地板坐标 → 屏幕像素）
  screenX = ox + s * (scaleX*flatX + shearX*flatY)
  screenY = oy + s * (scaleY*flatX + shearY*flatY)
  // 在此 round 写入 unit.screenY 用于 Z-order

Step B — 保存当前 CTM
  ctx.save()

Step C — 逃逸 ISO 仿射，建立单位矩阵 + 平移
  ctx.setTransform(1, 0, 0, 1, 0, 0)   // 重置为单位矩阵
  ctx.translate(screenX, screenY)       // 平移到锚点
  ctx.scale(zoomScale, zoomScale)       // 应用用户缩放

Step D — 在单位空间内 1:1 绘制
  if (sprite) {
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy,
                  sprite.sw, sprite.sh,
                  sprite.anchorX, sprite.anchorY,
                  sprite.renderW, sprite.renderH)
  } else {
    // Fallback: factionColor 半透明圆形 + 首字母
    ctx.beginPath()
    ctx.arc(0, -32, 28, 0, Math.PI * 2)
    ctx.fillStyle = factionColor + '80'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(firstLetter, 0, -22)
  }
  // HP 血条、选择环、隐匿指示器 → 均在此空间绘制，不变形

Step E — 恢复地板 CTM
  ctx.restore()
```

### 关键设计原则

1. **数学锚点 + 像素绘制分离**：`screenX/Y` 由 ISO 矩阵精确计算，但绘制时用 `setTransform(1,0,0,1,0,0)` 彻底逃脱形变
2. **缩放仅 scale(zoom)**：用户的缩放操作仅作用于 `ctx.scale(zoom, zoom)`，不引入任何 shear 或非等比缩放
3. **HexGridCanvas 不修改**：所有所需参数（ISO/scale/offsetX/offsetY）已由组件暴露

### Fallback 降级视觉

```javascript
// 当 getTexture() 返回 null 时：
ctx.beginPath()
ctx.arc(0, -RENDER_HEIGHT/2, 28, 0, Math.PI * 2)
ctx.fillStyle = factionColor + '80'      // 派系色 + 50% 透明度
ctx.fill()
ctx.fillStyle = '#ffffff'
ctx.font = 'bold 28px sans-serif'
ctx.textAlign = 'center'
ctx.textBaseline = 'middle'
ctx.fillText(unit.name[0].toUpperCase(), 0, -RENDER_HEIGHT/2)
```

---

## 五、Step 2.4-2.5 — 业务逻辑状态机绑定

### 客户端视觉状态层

```javascript
// unitSpriteState: Map<unitId, { direction, actionState }>
// 独立于后端 refreshState()，跨轮动作持久化
const unitSpriteState = reactive(new Map())

function setUnitVisual(unitId, direction, actionState) {
  const state = unitSpriteState.get(unitId) || {}
  if (direction !== null && direction !== undefined) state.direction = direction
  if (actionState !== null && actionState !== undefined) state.actionState = actionState
  unitSpriteState.set(unitId, state)
}

function getUnitVisual(unitId) {
  return unitSpriteState.get(unitId) || { direction: 0, actionState: 'idle' }
}
```

### 状态转换表

| 事件 | 触发位置 | direction | actionState |
|------|----------|:---:|:---:|
| 部署 | `deployToHex()` | 0 (N) | idle |
| 移动开始 | `executeMove()` 调用前 | computeDirection(fromQ,fromR,toQ,toR) | move |
| 移动完成 | `executeMove()` 成功后 | 保留最后朝向 | idle |
| 移动失败 | `executeMove()` catch | 恢复原值 | idle |
| 攻击 | `executeAction(attack)` | — | attack |
| 防御 | `executeAction(defend)` | — | defend |
| 待命 | `executeAction(wait)` | — | wait |
| 回合切换 | `refreshState()` | 保留 | idle |

### executeMove() 状态机绑定伪代码

```javascript
async function executeMove(unitId, targetQ, targetR, path) {
  const unit = allUnits.find(u => u.id === unitId)

  // 计算最终朝向
  const lastStep = path[path.length - 1]
  const prevQ = path.length > 1 ? path[path.length - 2].q : unit.q
  const prevR = path.length > 1 ? path[path.length - 2].r : unit.r
  const newDir = computeDirection(prevQ, prevR, lastStep.q, lastStep.r)

  // 设置移动视觉状态
  const oldVisual = getUnitVisual(unitId)
  setUnitVisual(unitId, newDir, 'move')

  try {
    // ... 实际移动逻辑 ...
    // 移动成功
    setUnitVisual(unitId, newDir, 'idle')
  } catch (e) {
    // 移动失败，恢复旧状态
    setUnitVisual(unitId, oldVisual.direction, oldVisual.actionState)
    throw e
  }
}
```

---

## 六、部署验证

### 构建链接

```
源文件: /root/original-project/frontend/src/
构建产物: /root/original-project/frontend/dist/
生产 JS:  index-CQ63ZdLe.js (296KB)
Docker:   mecha-frontend (Healthy)
HTTP:     200 OK
```

### 验证清单

| 检查项 | 方法 | 结果 |
|--------|------|:---:|
| DIRECTIONS 枚举存在于 hexUtils.js | grep | ✅ |
| computeDirection 函数存在于 hexUtils.js | grep | ✅ |
| unitSpriteResolver.js 部署到 src/resolvers/ | ls | ✅ |
| NewBattleView.vue 含 setTransform(1,0,0,1,0,0) | grep | ✅ |
| NewBattleView.vue 含 computeDirection 导入 | grep | ✅ |
| NewBattleView.vue 含 unitSpriteResolver 导入 | grep | ✅ |
| NewBattleView.vue 含 unitSpriteState | grep | ✅ |
| NewBattleView.vue 含 setUnitVisual/getUnitVisual | grep | ✅ |
| 旧版硬编码图片路径已清除 | grep BAD=0 | ✅ |
| Vite build 成功 | npx vite build | ✅ |
| Docker 容器运行中 | docker ps | ✅ |
| 页面 HTTP 200 | curl | ✅ |

### 备份位置

```
/root/original-project/frontend/backups/20260619-phase2-sprite/
```

---

## 七、当前状态与后续工作

### 当前状态

- ✅ **协议定义**: Unit 属性扩展 + 9 视图枚举 + Sprite Resolver 接口 + Billboard 数学公式
- ✅ **数学层**: DIRECTIONS 常量 + computeDirection × 2
- ✅ **资源层**: unitSpriteResolver（getTexture + 4级降级 + 异步缓存）
- ✅ **渲染层**: Billboard 5 步绘制 + Z-order screenY + Fallback 降级视觉
- ✅ **状态机**: executeMove/executeAction/refreshState 全链路绑定
- ✅ **部署**: Docker 容器 Healthy, HTTP 200

### Fallback 行为

切图资源（`/assets/sprites/units/*.png`）尚未就绪前，所有棋子以 **派系色半透明圆形 + 首字母** Fallback 降级视觉渲染，功能完整、不报错。

### Phase 3 预备

Phase 3 将处理静态切图资源的实际制作与部署（9视图×4状态×N机体的 Sprite Sheet），以及动画帧间插值（移动中的 piece 精灵在 Hex 格子之间平滑位移）。

---

*此报告由 Phase 2 全量代码落地自动生成。协议文档见 `2D棋子9视图朝向与动画状态机-协议设计.md`。*
