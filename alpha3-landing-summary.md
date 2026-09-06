# Alpha 3.0 系统 — 五节点落地总结与部署清单

> 依据桌面 `alpha3.0 系统/` 六核心报告 + 蓝图。指挥（主 Agent）按批次协调执行，每批验收通过。

## 一、协调方案回顾（Agent Teams 设计）

| 批次 | Subagent 角色 | 节点 | 范围文件 | 验收口径 |
|---|---|---|---|---|
| 1 | 契约层 | B-4 | shared-kernel/contracts + enums + validateBody 中间件 | grep 命中 + shared-kernel build |
| 2a | 实体活路径 | C-6 | battle.contract + combat.ts computeWeapon* | grep 命中 + tsc |
| 2b | 信息层几何 | I-6 | hexMath + hexUtils + socketService + unit.contract | grep 命中 + node --check |
| 3a | 回写原子 | A-5 | combat.ts applyPatch + sqlite version + combatSnap CAS | grep 命中 + tsc |
| 3b | 外围门控 | P-3+ | tokens BattlePhase + combat.ts end-deployment/deploy-unit | grep 命中 + tsc |
| 4 | 指挥 | 统一构建 + 部署 | 全仓 | build/tsc/node --check 全绿 |

> 工具约束：内置 `code-explorer` 子 agent 为**只读**，无写文件/执行命令权限。故实际落地由指挥亲自执行，子 agent 仅用于实机复核（其复核暴露了 3+ 处"文档假设 vs 实机"偏差，价值显著）。

## 二、实机核查纠偏（蓝图两条纪律的再次验证）

| 报告假设 | 实机真相 | 处置 |
|---|---|---|
| B-4：`validateBody` 既有设施 | 零命中，待建 | 新建中间件 |
| B-4：`PatchContract`/`BattleStateContract` 已设计 | 零命中 | 新建契约 |
| B-4：`terrain_key` 应收紧为枚举 | 存量含 `ruins`/`void`/`space`，强收紧会 400 | 渐进：新建 `TERRAIN_KEY` 仅新契约引用，旧 `types.ts` 保留 EnglishKey |
| C-6：`computeWeaponMobilityBonus` 缺 destroyed 检查 | 已内置拦截（2.0B.2） | 仅提取 `activeEquip()` 统一，不重复造 |
| I-6：`TerrainCellContract.height` 是地形高度 | `height` 是地图尺寸；地形高度字段是 `elevation` | 消费 `elevation` + 新增 `blocks_sight` |
| P-3+：`phase` 字段缺失 | `BattlePhase` 枚举已存在，缺的是门控 | 补 `BATTLE_LOADING` + 门控逻辑 |
| A-5：七处散落出口 | 30+ `battleStore.set()`，无 `applyPatch` | 新建 `applyPatch` 出口 + CAS，未强行改写 30+ 点（控风险） |

## 三、改动落点清单（已验收）

**shared-kernel/**
- `src/enums.ts`：`PATCH_FIELD`(9键) / `TERRAIN_KEY` / `TIMING.ON_BATTLE_START` / `EQUIP_SLOT`
- `src/contracts/patch.contract.ts`：`PatchContract` + `StatePatchItemContract`（新建）
- `src/contracts/battle-state.contract.ts`：`BattleStateContract` 聚合（新建）
- `src/contracts/battle.contract.ts`：`EquipmentLockMetaContract` + `BattleUnitContract._meta`
- `src/contracts/map.contract.ts`：渐进引用 `TERRAIN_KEY` + 预埋 `elevation`/`blocks_sight`
- `src/contracts/unit.contract.ts`：`sight_range`（默认6）
- `src/hexMath.ts`：`hexLineDraw` / `computeLoS` / `cubeRound` / `LOS_TOLERANCE`
- `src/tokens.ts`：`BattlePhase.BATTLE_LOADING`

**backend-gateway/**
- `src/middleware/validateBody.ts`（新建，Macro 边界 safeParse）
- `src/routes/combat.ts`：`applyPatch()` 出口 + 五不变量 + `_lastDiff`；`toExecutorUnit` 透传 `_meta`；`activeEquip()`/`applyEquipmentLock`/`isEquipmentLocked`；`/skill` 与 `executeDirectSkill` 的 `EQUIPMENT_LOCKED` 预检；`end-deployment` 门控 + `igniteBattleStart()`；`deploy-unit` 409 门控；`PushBattleStore.set` 自动 CAS 落库；地图加载/pending-units 挂 `validateBody`
- `src/routes/rooms.ts`：房间创建挂 `validateBody`
- `src/db/sqlite.ts`：battles 表加 `version` 列
- `src/combatSnap.ts`：`saveBattleSnapshot(expectedVersion)` CAS

**services/comm-service/**
- `src/services/socketService.js`：内联 LoS（与 shared-kernel 逐字一致）+ `deriveVisibilityStatus` + `applyFog` 接入 los 剔除 hidden

**frontend/**
- `src/utils/hexUtils.js`：`hexLineDraw` 逐字镜像（I-6 K9）

## 四、本地校验结果（全绿）
- `cd shared-kernel && npm run build` ✅ ESM+CJS 双产物
- `cd backend-gateway && npx tsc --noEmit` ✅ 零错误
- `node --check frontend/src/utils/hexUtils.js` ✅
- `node --check services/comm-service/src/services/socketService.js` ✅

## 五、服务器部署清单（需用户批准，触碰线上）
> 纪律：改 shared-kernel/src 后必须仓库根 `npm run build` 先出 dist；gateway 运行时用宿主机 rsync 同步进容器 dist（Dockerfile 不 tsc）。

1. 仓库根 `npm run build`（shared-kernel ESM+CJS 双产物出 dist）
2. `rsync -avz --exclude node_modules --exclude .git --exclude dist --exclude '*.db' --exclude 'data/*.log' /Users/dingxuyang/CodeBuddy/20260604120036/mecha-universe-engine/ root@106.54.197.69:/root/mecha-universe-engine/`
3. ssh 进服务器：`cd /root/mecha-universe-engine/backend-gateway && npm run build`（tsc src→dist）
4. ssh：`cd /root/mecha-universe-engine/frontend && npm run build`
5. 宿主机：`docker compose build --no-cache mecha-gateway mecha-frontend`（改 comm 也加 mecha-comm）
6. 宿主机：`docker compose up -d --no-deps mecha-gateway mecha-frontend`（避开 db 孤儿冲突）
7. 验收：curl 8081 `index.html` 资产哈希 == 刚 build 产物哈希 + 调 `/api/combat` 等返回 400 VALIDATION_ERROR（B-4 生效）+ `end-deployment` 后 `deploy-unit` 返回 409 DEPLOY_LOCKED（P-3+ 生效）
8. **绝不动 mecha-battle-db**

## 六、遗留（有意未做，避免范围蔓延）
- 网关 push `state._losOptions`（terrainGrid+viewerPos）组装：I-6 几何真相源已就位，`applyFog` 已支持，待 A-5/P-3+ 后续接线把 LoS 真正接入实时推送（服务端权威遮挡）。
- 30+ `battleStore.set` 调用点未改写：仅新增 `applyPatch` 出口 + CAS 机制，逐步迁移留待后续迭代。
