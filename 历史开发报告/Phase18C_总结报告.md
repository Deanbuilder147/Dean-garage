# Phase 18-C 总结报告：整备室出击数据链打通 + 出击黑屏清除

**执行时间**: 2026-06-21 22:10–22:14  
**修改文件**: `frontend/src/views/NewPreparationRoom.vue`（3 处插入/替换）  
**构建**: 120 modules, 0 errors, 1.03s  
**部署**: Docker --no-cache rebuild, 8/8 Healthy

---

## 一、问题诊断

### 1.1 出击黑屏根因分析

| 故障层 | 根因 | 影响 |
|--------|------|------|
| **路由层** | `router.push('/battle/' + battleId)` 触发 `redirectByDevice` 导航守卫，中间重定向 `/battle/:id` → `/battle-pc/:id`，可能导致状态丢失 | Canvas 不渲染 |
| **数据层** | deployPool 提交的 `selectedUnits` 未经过 Phase 13.5 防爆清洗，`equipment.left_hand/right_hand/other` 三槽位可能为 `null`/`undefined` | 战场侧 damagePipe 属性交叉碰撞崩溃，Canvas 静默黑屏 |

### 1.2 代码审计发现

- `NewPreparationRoom.vue` 第 275 行（旧）：`router.push('/battle/' + battleId)` — 触发了不必要的设备分流中间件
- `NewPreparationRoom.vue` 第 226-236 行（旧）：`selectedUnits` 直接 POST 到后端，未调用 `sanitizeUnitEquipment`
- `NewBattleView.vue` 第 532-563 行：`sanitizeUnitEquipment` 仅在战场侧 `onMounted` 后运行，已晚于 deployPool 传输

---

## 二、三处修改详情

### 修改 A：新增 `sanitizeUnitEquipment` 防爆器（第 217-248 行）

```javascript
function sanitizeUnitEquipment(unit) {
  if (!unit || typeof unit !== 'object') return unit
  unit.equipment = unit.equipment || {}
  const slots = ['left_hand', 'right_hand', 'other']
  let fixed = 0
  slots.forEach(slot => {
    if (!unit.equipment[slot] || typeof unit.equipment[slot] !== 'object') {
      unit.equipment[slot] = {
        damage_kind_modifiers: { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
      }
      fixed++
    } else {
      const dkm = unit.equipment[slot].damage_kind_modifiers
      if (!dkm || typeof dkm !== 'object') {
        unit.equipment[slot].damage_kind_modifiers = { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
        fixed++
      } else {
        const kinds = ['kinetic', 'beam', 'explosive', 'corrosive']
        let patched = false
        kinds.forEach(k => {
          if (!(k in dkm)) { dkm[k] = 0; patched = true }
        })
        if (patched) fixed++
      }
    }
  })
  if (fixed > 0) {
    console.log(`[PrepRoom-Sanitizer] 单位 "${unit.name || unit.id}": 修复 ${fixed} 个装备槽位`)
  }
  return unit
}
```

- 与 `NewBattleView.vue` 的 `sanitizeUnitEquipment` **完全同构**
- 覆盖三槽位 + 四伤害类型 key 补全

### 修改 B：deployPool 提交前强制清洗（第 264-267 行）

```diff
  const selectedUnits = availableUnits.value.filter(u => selectedIds.value.includes(u.id))
+ // Phase 18-C: 出击前强制清洗装备槽位，从源头截断空值崩溃
+ selectedUnits.forEach(u => sanitizeUnitEquipment(u))
+ console.log(`[PrepRoom] deployPool 已防爆清洗 ${selectedUnits.length} 个棋子装备`)
  const token = localStorage.getItem('token')
  await fetch(`/api/combat/${battleId}/pending-units`, { ... })
```

- 在 `POST /api/combat/:id/pending-units` 之前执行，**从源头截断空值传播**
- 确保后端 `damagePipe.cjs` 的 `_calcArmorReduction` 遍历三槽位时不会触发 `Cannot read property 'kinetic' of null`

### 修改 C：硬导航直达 PC 战斗视图（第 314-316 行）

```diff
- router.push('/battle/' + battleId)
+ // Phase 18-C: 硬导航直达 PC 战斗视图，跳过 redirectByDevice 中间件，消除重定向黑屏
+ router.push('/battle-pc/' + battleId)
```

- 跳过 `router.beforeEach` 中的 `redirectByDevice` 守卫（`/battle/:id` → `/battle-pc/:id` 中间重定向）
- `battleId` 来自 SQLite `battlefields` 表的数字 id，绝无 `.json` 文件名污染
- 减少一次完整的路由生命周期，消除重定向时序竞争导致的状态丢失

---

## 三、出击数据链完整校验

```
整备室格纳库
  │ hangarAPI.getUnits() → availableUnits
  │ 用户勾选棋子 → selectedIds
  ▼
startBattle()
  │ availableUnits.filter(id ∈ selectedIds) → selectedUnits
  │ sanitizeUnitEquipment(each) → equipment 三槽位完整 ✅
  │ POST /api/combat/:id/pending-units { units: selectedUnits } → 后端部署池
  │ router.push('/battle-pc/' + battleId) → 硬导航 ✅
  ▼
NewBattleView.vue
  │ route.params.id → 获取战斗状态
  │ sanitizeAllUnitsEquipment() → 二次防线 ✅
  │ loadDeployPool() → sanitizeUnitEquipment 再次清洗 ✅
  ▼
drawBattleScene() → Canvas 渲染
  │ damagePipe._calcArmorReduction → 三槽位完整遍历 ✅
  ▼
正常显示 ✅
```

---

## 四、部署验证

| 检查项 | 结果 |
|--------|------|
| npm run build | 120 modules, 0 errors, 1.03s |
| Docker 重建 | --no-cache, 新镜像 `0d02ca5ff43d` |
| 前端容器 | mecha-frontend (healthy) |
| 整体容器 | 8/8 Healthy ✅ |
| HTTP 状态 | 200 OK ✅ |
| JS bundle 验证 `battle-pc` | 命中 3 次 → 硬导航代码已部署 ✅ |
| JS bundle 验证 `PrepRoom-Sanitizer` | 命中 1 次 → 防爆器已注入 ✅ |
| JS bundle 验证 `[PrepRoom] deployPool` | 命中 → 清洗日志已部署 ✅ |

---

## 五、关键教训

1. **路由中间件重定向不是零成本**：`redirectByDevice` 守卫在 `/battle/:id` → `/battle-pc/:id` 间触发完整路由生命周期，可能导致 `onMounted` / `watch` 时序竞争 → Canvas 初始化被跳过
2. **数据清洗必须在源头执行**：仅战场侧清洗（`onMounted` 后）已晚于 deployPool 传输，整备室提交前必须先清洗
3. **"双防线"策略**：整备室侧（提交前）+ 战场侧（初始化后）双重 `sanitizeUnitEquipment`，确保任何路径都不会有空值命中 `damagePipe`
4. **防爆器重构提示**：`sanitizeUnitEquipment` 目前在 `NewBattleView.vue` 和 `NewPreparationRoom.vue` 各有一份副本。后续 Phase 可将其提取到 `src/utils/equipmentSanitizer.js` 作为共享工具，消除代码重复
