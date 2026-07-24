# Phase 21-E v2 综合审查与修复报告

> 审查范围：战术部署 + 剧情战役 两航道全部子页面
> 审查日期：2026-06-22 13:08
> 关联 Phase：21-E v2（多态智能分流器）

---

## 一、审查清单

| # | 文件 | 用途 | 行数 |
|---|------|------|------|
| 1 | `NewBattleView.vue` | PC 主战场视图（战役/正常双轨） | ~2900 |
| 2 | `CampaignView.vue` | 剧情战役选择/沙盒/战斗容器 | ~840 |
| 3 | `NewPreparationRoom.vue` | 整备室（单位选择/ACE/出击） | ~320 |
| 4 | `HexGridCanvas.vue` | 通用六角格 Canvas 渲染组件 | ~700 |
| 5 | `NewHomeView.vue` | 主页导航（战术部署 / 剧情战役入口） | ~300 |
| 6 | `api/client.js` | 全局 API 客户端（combatAPI / hangarAPI 等） | ~120 |

---

## 二、发现的问题

### 🔴 问题 #1（中危）：`campaignApi.get` 双 ID 注入 —— `loadFactionCooldowns` / `loadVictoryInfo` 静默失败

**位置**: `NewBattleView.vue:L2598, L2605`

**故障链**：
```
battleApi.get(activeBattleId + '/faction-cooldowns')
  → campaignApi.get("42/faction-cooldowns")           [战役模式: activeBattleId="42"]
  → 内部再次拼接 targetId → /campaign/42/42/faction-cooldowns  ❌ 双ID
  → 后端 404 → .catch(() => {}) 静默吞下
```

**对比**：
| 模式 | 调用路径 | 最终 URL | 结果 |
|------|----------|----------|:--:|
| 正常模式 `_combatAPI.get` | `activeBattleId + '/faction-cooldowns'` | `/combat/UUID/UUID/faction-cooldowns` | ✅ |
| 战役模式 `campaignApi.get` | 同上 | `/campaign/42/42/faction-cooldowns` | ❌ 双ID |

**根因**：`_combatAPI.get(path)` 签名期望 `path` 已含 ID（如 `"UUID/faction-cooldowns"`），而 `campaignApi.get(path)` 在内部**额外**拼接了一次 `targetId`。两个适配器的接口语义不一致。

**影响面**：
- `loadFactionCooldowns()` — 阵营冷却数据无法加载
- `loadVictoryInfo()` — 胜利条件数据无法加载
- 影响战役模式下所有使用 `battleApi.get()` 的调用

**修复方案**：

```diff
// campaignApi.get 改为与 _combatAPI.get 一致的签名：
// path 参数已由调用方包含 ID，此处只拼接路由前缀
get: (path) => {
-   const targetId = String(activeBattleId.value)
-   return apiClient.get(`${getTargetPrefix(targetId)}/${targetId}/${path}`)
+   const targetId = String(activeBattleId.value)
+   return apiClient.get(`${getTargetPrefix(targetId)}/${path}`)
        .catch(() => ({ data: {} }))
},
```

---

### 🟡 问题 #2（中危）：`loadDeployPool` 硬编码 `/api/combat/` 绕过 `getTargetPrefix`

**位置**: `NewBattleView.vue:L1369`

```javascript
const poolRes = await fetch(`/api/combat/${activeBattleId}/deploy-pool`, { headers })
```

**问题**：
- 在战役模式 (`is_campaign=true`) 下仍硬编码 `/api/combat/`
- 当 `activeBattleId` 为短 campaignId（如 `"42"`）时，`/api/combat/42/deploy-pool` 在 combat 微服务上 404
- 首次请求必然失败，依赖 fallback 链（hangarAPI → localStorage → 硬编码默认值）恢复

**影响**：增加加载时间（首次请求 404 → try-catch 捕获 → 进入 fallback），但有 fallback 兜底不会崩。

**修复方案**：

```diff
- const poolRes = await fetch(`/api/combat/${activeBattleId}/deploy-pool`, { headers })
+ const targetId = String(activeBattleId.value)
+ const poolRes = await fetch(`${getTargetPrefix(targetId)}/${targetId}/deploy-pool`, { headers })
```

---

### 🟢 问题 #3（低危）：`campaignApi.deployUnit` / `endDeployment` 无条件 reject

**位置**: `NewBattleView.vue:L512-513`

```javascript
deployUnit: () => Promise.reject(new Error('Campaign: deploy already done')),
endDeployment: () => Promise.reject(new Error('Campaign: deploy already done')),
```

**问题**：`deployToHex()` (L2624) 和 `finishDeployment()` (L2640) 无条件调用 `battleApi.deployUnit()` / `battleApi.endDeployment()`。如果战役后端返回 `deployment` phase，部署操作将崩溃。

**当前防御**：战役流程中 `initBattle()` 在获取状态后直接将 `isDeployPhase.value = false`，所以正常流程不会触发。但这属于**隐式假设**而非显式守卫。

**修复方案**：在 `deployToHex` 和 `finishDeployment` 中增加 `props.is_campaign` 提前返回：

```javascript
if (props.is_campaign) {
    addLog('info', '战役模式无需手动部署')
    return
}
```

---

### 🟢 问题 #4（极低危）：`battleApi` 单向赋值不响应 props 变化

**位置**: `NewBattleView.vue:L549`

```javascript
const battleApi = props.is_campaign ? campaignApi : _combatAPI
```

**问题**：若 `is_campaign` 在组件生命周期内从 `false` 变为 `true`（或反之），`battleApi` 不会切换。

**实际风险**：极低。当前架构中 `is_campaign` 在组件挂载时即确定且从不变化。

---

### 🟢 问题 #5（极低危）：`activeBattleId` 隐式解包的可读性问题

**位置**: `NewBattleView.vue:L2598, L2605, L2624`

多处使用 `activeBattleId + '/faction-cooldowns'` 对 computed ref 做字符串拼接，依赖 JS 隐式调用 `valueOf()` 来获取 `.value`。行为正确但可读性差。

**建议**：统一改为 `activeBattleId.value`。

---

## 三、Canvas / 棋盘渲染审查：无故障 ✅

| 审查项 | 文件:行号 | 状态 |
|--------|-----------|:--:|
| 空气墙 `v-if` 守卫 | NewBattleView.vue:3 | ✅ |
| `safeDrawBattleScene` 异常捕获 | NewBattleView.vue:813-833 | ✅ |
| `sanitizeBattlefieldCells` 标准清洗 | NewBattleView.vue:2713-2754 | ✅ |
| `sanitizeBattlefieldTerrain` 地形清洗 | NewBattleView.vue:2652-2696 | ✅ |
| terrainMap 二次清洗 | NewBattleView.vue:2852-2865 | ✅ |
| `window.error` 全局错误边界 | NewBattleView.vue:2758-2762 | ✅ |
| `window.unhandledrejection` 边界 | NewBattleView.vue:2764-2770 | ✅ |
| HexGridCanvas ResizeObserver 防飞图 | HexGridCanvas.vue:93 | ✅ |
| hexUtils 坐标转换纯函数 | HexGridCanvas.vue:20-24 | ✅ |
| Props 注入模式 (无全局 Store) | HexGridCanvas.vue:29-52 | ✅ |
| ISO 矩阵参数标准管道 | HexGridCanvas.vue:78-81 | ✅ |
| 鼠标坐标逆推原子化 | HexGridCanvas.vue:147-158 | ✅ |

Canvas 渲染管线在九层防护墙（Layer 1-9）覆盖下，未发现任何新增故障点。

---

## 四、各页面逐项审查

### CampaignView.vue ✅

| 审查项 | 行号 | 状态 |
|--------|------|:--:|
| 战役列表 API 调用 `/campaign` | L509 | ✅ |
| `startCampaign` 调用 `/campaign/{id}/start` | L699-706 | ✅ |
| Proxy-Detox JSON 过水解耦 | L691-694 | ✅ |
| `battleId` = `currentCampaignId.value`（短ID → 正确分流） | L716 | ✅ |
| `is_campaign=true` 传入 NewBattleView | L322 | ✅ |
| exitBattle 清理端点 `/campaign/{id}/cleanup` | L773 | ✅ |
| 使用原生 `fetch` 绕过 apiClient 拦截器 | L424-438 | ⚠️ 缺少统一错误拦截 |

### NewPreparationRoom.vue ✅

| 审查项 | 行号 | 状态 |
|--------|------|:--:|
| `startBattle` 装备清洗 `sanitizeUnitEquipment` | L266 | ✅ |
| `pending-units` 上传 | L269 | ✅ |
| `combatAPI.createBattle` 生成 UUID | L287 | ✅ |
| UUID 导航 `/battle-pc/{UUID}` | L316 | ✅ |
| localStorage 持久化选中棋子 | L257-259 | ✅ |
| 胜利条件 / ACE 设置 | L290-305 | ✅ |

### NewHomeView.vue ✅

| 审查项 | 状态 |
|--------|:--:|
| 战术部署 → `/battlefields` | ✅ |
| 地图编辑器 → `/battlefield-edit` | ✅ |
| 剧情战役 → `/campaign` | ✅ |

### HexGridCanvas.vue ✅

| 审查项 | 状态 |
|--------|:--:|
| 六边形常量从 hexUtils 统一导入 | ✅ |
| 坐标转换管道纯净（无缩放耦合） | ✅ |
| Props 注入差异配置（无全局依赖） | ✅ |
| ResizeObserver 防飞图 | ✅ |
| 缩放/平移/ISO 矩阵标准管线 | ✅ |

---

## 五、修复优先级矩阵

| 优先级 | 问题 | 影响 | 修复复杂度 |
|:--:|------|------|:--:|
| **P1** | #1: `campaignApi.get` 双ID注入 | 战役模式阵营冷却/胜利条件数据缺失 | 低（单行修复） |
| **P2** | #2: `loadDeployPool` 硬编码路由 | 战役模式首次请求失败，依赖 fallback | 低（单行修复） |
| **P3** | #3: `deployUnit`/`endDeployment` 硬拒 | 极端场景部署崩溃 | 低（加守卫） |
| P4 | #5: `activeBattleId` 隐式解包 | 可读性问题 | 低（批量替换） |
| P5 | #4: `battleApi` 单向赋值 | 极低风险 | 低（computed化） |

---

## 六、九层防护墙现状 (Phase 21-A→E)

```
Layer 1: sanitizeBattleId()             → UUID 清洗 ✅
Layer 2: v-if 空气墙                     → 数据未就绪禁渲染 ✅
Layer 3: onMounted 双重清洗              → equipment + cells ✅
Layer 4: JSON.stringify 序列化写入       → localStorage 后备 ✅ (21-B)
Layer 5: Anti-Poison 反弹读取防御        → 毒化检测 ✅ (21-B)
Layer 6: mecha_deploy_pool 恢复兜底      → 最后防线 ✅ (21-B)
Layer 7: JSON.parse(JSON.stringify())    → Proxy 过水解耦 ✅ (21-D)
Layer 8: Anti-Proxy-Poison 后端拦截      → 路由+服务双保险 ✅ (21-D)
Layer 9: getTargetPrefix 多态智能分流    → UUID/剧本号智能路由 ✅ (21-E v2)
```

九层防护墙全量在位，Canvas 渲染无故障。

---

## 七、总结

- **Canvas / 棋盘渲染**：零故障，九层防护墙覆盖全面
- **新发现 Bug**：2 个中危（#1 `campaignApi.get` 双ID注入，#2 `loadDeployPool` 硬编码路由），均有 fallback 兜底不崩
- **建议优先修复 P1 (#1)**，其他可在后续 Phase 中渐进修复
- **正常对战模式**：UUID → `/combat/` 路径经 `getTargetPrefix` 完整覆盖，无问题

