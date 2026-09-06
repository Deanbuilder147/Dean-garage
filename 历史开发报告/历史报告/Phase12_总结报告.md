# Phase 12 · 装备管线收束 & 手动摇骰闭环 & AI 导入

**Git**: `7b9ccb4` → `origin/main` | **文件**: 5 changed, +326/-11 | **容器**: 8/8 Healthy ✅

---

## 一、交付清单

| # | 任务 | 关键改动 | 状态 |
|---|------|----------|------|
| 1 | **dkm 平坦字段 → 装备对象映射** | combatResolver.js `_mapDkmToEquipment` | ✅ |
| 2 | **WebSocket 手动摇骰完整闭环** | battles.js `manual-roll-result` 路由 + socketService.js | ✅ |
| 3 | **damagePipe 装备槽位扩展** | damagePipe.cjs `_calcArmorReduction` 支持 hand/other | ✅ |
| 4 | **AI 技能一键导入按钮** | GlossaryView.vue 弹窗 + 方法 + CSS | ✅ |

---

## 二、技术详解

### 2.1 dkm 平坦字段 → 装备对象映射

**问题**：`NewUnitEditorView.vue` 的 dkm 编辑使用平坦字段（`left_dkm_beam`、`right_dkm_kinetic`...），但 `damagePipe.cjs` 期望 `defender.equipment.left_hand.damage_kind_modifiers.beam`。

**解决方案**：在 `executeTurn` 开头新增 `_mapDkmToEquipment()` 方法，自动将平坦字段映射为装备对象：

```
输入: { left_type: '武器', left_dkm_beam: 0.5, left_dkm_explosive: 1.2 }
输出: equipment.left_hand = { damage_kind_modifiers: { beam: 0.5, explosive: 1.2 } }
```

**映射规则**：
- `left_*` → `left_hand`
- `right_*` → `right_hand`
- `extra_*` → `other`
- 零值字段自动跳过
- 已存在的 equipment 字段被保留合并

### 2.2 手动摇骰完整闭环

**流程**：

```
客户端 POST /:id/attack (skill.is_manual_roll=true)
   ↓
服务端检测 → 存入 pendingManualTurns Map
   ↓
返回 { status: 'pending_roll', turnId, dice_type, success_line }
   ↓
客户端展示摇骰 UI (已有 Phase 8 实现)
   ↓
客户端 POST /:id/manual-roll-result { turnId, roll }
   ↓
服务端取出挂起数据 → 重新 executeTurn (带 external_roll_result)
   ↓
返回完整战斗结果 { combat_result, state }
```

**新增端点**：
- `POST /:id/manual-roll-result` — 提交掷骰结果
- `GET /:id/pending-roll` — 查询挂起状态（客户端重连恢复）

**超时清理**：60 秒内未收到结果自动丢弃。

### 2.3 装备槽位扩展

`damagePipe.cjs` `_calcArmorReduction` 遍历列表从：
```js
['full_armor', 'coating', 'shield_gen', 'reactive_armor']
```
扩展为：
```js
['full_armor', 'coating', 'shield_gen', 'reactive_armor', 'left_hand', 'right_hand', 'other']
```

### 2.4 AI 技能一键导入

`GlossaryView.vue` 新增按钮和弹窗：
- **按钮**：`🤖 导入AI技能`（与创建向导并列）
- **弹窗**：JSON 文本粘贴区 → 解析 → 标准化 → 校验 → 导入词条库
- **标准化**：自动将 AI 输出字段映射为万能语法规范字段
- **冲突处理**：已有同名技能提示覆盖

---

## 三、验证结果

| 测试项 | 结果 |
|--------|------|
| 8/8 容器健康 | ✅ |
| combat-service health | ✅ |
| 前端 HTTP 200 | ✅ |
| 词条库 v5.0 (9 skills/10 terrains) | ✅ |
| combatResolver 语法 | ✅ (无语法错误) |
| damagePipe require | ✅ |
| battles routes (32 stack) | ✅ |
| dkm 映射逻辑测试 | ✅ (3槽位正确映射) |

### dkm 映射测试输出
```json
{
  "left_hand":  { "damage_kind_modifiers": { "beam": 0.5, "explosive": 1.2 } },
  "right_hand": { "damage_kind_modifiers": { "kinetic": -0.3 } },
  "other":      { "damage_kind_modifiers": { "corrosive": 0.8 } }
}
```

---

## 四、Git 演进

| 版本 | 描述 |
|------|------|
| `9c0d940` | Phase 9.7: Even-R 拓扑锁死 |
| `bd91983` | Phase 10: 万能语法战斗中枢 |
| `52a7939` | Phase 11: WebSocket掷骰 + 技能预览 + 分步向导 + 装备DKM + AI生成器 |
| **`7b9ccb4`** | **Phase 12: 装备dkm映射 + 手动摇骰闭环 + AI导入** |

---

## 五、后续建议

1. **端到端摇骰测试**：在一场实际战斗中测试 `is_manual_roll` 技能的完整流程
2. **dkm 字段持久化**：考虑在数据库中以装备对象存储，而非平坦字段
3. **AI 技能批量生成**：利用 Phase 11 AI 生成器 + Phase 12 导入按钮，快速膨胀技能库
4. **摇骰动画优化**：前端骰子动画与 WebSocket 广播同步
