# 单位编辑器 Excel 读取录入修复 — 完整修改报告

> 计划来源：`桌面/修复计划.html`（单位编辑器 Excel 读取录入修复 A/B/C 三块 + 执行与验证计划）
> 报告生成时间：2026-07-21
> 目标服务器：`106.54.197.69`（容器 `mecha-gateway` / `mecha-frontend` / `mecha-comm` / `mecha-battle-db`）
> 关联 git 提交：`1a8ca94`（网关+前端已提交）；`services/hangar-service` 三文件为**未提交工作区改动**

---

## 一、背景与问题

单位编辑器上传 Excel 后，进入战斗的单位 JSON 出现 **5 处实质性字段静默丢失**，且 `GET /api/units/factions` 返回 **404**（被 `:unitId` 路由劫持）。计划 `修复计划.html` 将其拆为三块：

- **A 块 / 差异1-3**：`effect`、`skillSlots`、`totalPoints` 写库层被整体丢弃
- **B 块 / 差异4**：技能 `type` 被 `unitConverter` 的 `TYPE_MAP` 强制覆盖，原始中文类型主权被剥夺
- **C 块 / 差异5 + 404**：`owner` 命名中英文打架；`factions` 静态路由被 `:unitId` 劫持

---

## 二、架构关键澄清（决定改动落在哪）

⚠️ **计划基于错误假设**：计划描述"改 `unit-import-service.js`（hangar-service）+ `unitConverter.js`（combat-service）两个微服务并 `docker compose build mecha-gateway hangar-service combat-service`"。但真实部署架构是：

- **没有独立 `hangar-service` / `combat-service` 容器**。生产仅 4 个容器：`mecha-gateway`(3006) / `mecha-frontend`(8081) / `mecha-comm`(3005) / `mecha-battle-db`(5432)。
- **战斗逻辑统一在网关容器内联**：`backend-gateway/Dockerfile` 把 `services/combat-service` 拷入，`combatBridge.ts` 经 `createRequire` 加载 `.cjs` 引擎；`unitConverter.js` 仅是遗留兼容保险，真实路径走 `.cjs`。
- **Excel 导入真实生效点在网关**：`excel-schema-normalizer.ts` + `sqlite.ts` + `units.ts`。

**结论**：计划的修复在**网关版（生产路径）全部落地并已部署**；对 `hangar-service` / `combat-service` 的改动仅作为**双库代码一致性留存**（legacy 死代码，对线上零影响）。

---

## 三、代码改动清单

### 【网关 — 已部署生效】Section C：路由劫持 + 诊断日志

#### 1. `backend-gateway/src/routes/units.ts`
- **新增 `GET /api/units/factions` 静态端点，前置到 `:unitId` 之前**，从内存常量 `FACTION_DICT`（earth/bailong/maxion）返回阵营字典，并动态合并 DB 中实际出现的阵营。消除 `:unitId` 对 `/factions` 的劫持（原 404 → 现 200）。
- **`GET /api/units/:unitId` 回传 `totalPoints`**：`totalPoints: unit.total_points ?? 0`。
- **`create-from-json` 落库 `total_points`**：`INSERT ... total_points ...` + 参数 `totalPoints`。

```diff
+    totalPoints: unit.total_points ?? 0,
+      `INSERT INTO units (id, owner_id, name, faction, category, tier, total_points, ...)
+       VALUES (?, ?, ?, ?, ?, ?, ?, ...)`,
+      [id, userId, name, faction, category, tier, totalPoints, ...]
```

#### 2. `backend-gateway/src/routes/combat.ts`
- `deploy-unit` 400 拦截处新增 `console.error('[deploy-unit] 400 body=', req.body)`，辅助诊断部署参数错误（本次定位 `pending-units` 结构问题的关键日志）。

#### 3. `frontend/src/views/NewBattleView.vue`
- `getBattleState` 失败兜底 `createBattle({ battlefield_id: 1 })` 处新增 `console.warn`，提示该硬编码值会因 maps 表用 UUID 而 404，应改用房间真实 `mapId`。

```diff
+      console.warn('[BattleInit] getBattleState 失败，兜底 createBattle 使用硬编码 battlefield_id=1（maps 表为 UUID，易 404）。请确认房间真实 mapId。')
       const res = await combatAPI.createBattle({ battlefield_id: 1 })
```

### 【网关 — 已部署生效】Section B：5 处差异修复（活跃导入链路）

#### 4. `backend-gateway/src/db/sqlite.ts`
- `units` 表建表加 `total_points INTEGER DEFAULT 0`；并在初始化中 `safeAlter('units', 'total_points INTEGER DEFAULT 0')` 做**存量迁移**（旧库自动加列，新库跳过）。

```diff
+  safeAlter('units', 'total_points INTEGER DEFAULT 0', 'units 表添加 total_points 列');
```

#### 5. `backend-gateway/src/services/excel-schema-normalizer.ts`
- `NormalizedUnit` 接口加 `totalPoints: number`。
- `mapSkills` 保留 `effect` / `type`（原仅 `description`）：
```diff
     description: s.effect || s.special || '',
+    effect: s.effect || '',
+    type: s.type || '自动',
```
- `buildAttributes` 按各部位 `skillSlots` 用 `null` 补齐技能数组（转换器对 `!skill||!skill.name` 已兼容跳过）：
```diff
+  for (const owner of Object.keys(skillsByOwner)) {
+    const slots = (units[owner] && units[owner].skillSlots) || skillsByOwner[owner].length;
+    while (skillsByOwner[owner].length < (slots as number)) skillsByOwner[owner].push(null);
+  }
```
- `normalizeParsedData` 写入 `totalPoints: parsed.basic.totalPoints ?? 0`。

### 【legacy — 仅代码一致性，非部署路径】

#### 6. `services/hangar-service/src/services/unit-import-service.js`（未提交）
- `insertUnit` 按 `units[owner].skillSlots` 用 `null` 补齐各部位 `*_skills` 数组。
- INSERT 加 `total_points` 列 + 对应 `?` + `basic.totalPoints ?? 0` 参数。

```diff
+    const padSkills = (owner) => {
+      const slots = (units[owner] && units[owner].skillSlots) || skillsByOwner[owner].length;
+      while (skillsByOwner[owner].length < slots) skillsByOwner[owner].push(null);
+    };
+    ['主机体', '跟随', '左手', '右手', '其它'].forEach(padSkills);
...
+        total_points,
...
+      basic.totalPoints ?? 0 // total_points
```

#### 7. `services/hangar-service/src/database/db.js`（未提交）
- `initDatabase` 在 `units` 表 CREATE 后 `ALTER TABLE units ADD COLUMN total_points INTEGER DEFAULT 0`（try/catch 兼容旧库）。

#### 8. `services/hangar-service/src/services/excel-validator.js`（未提交）
- `getSkillOwner(slot)` 由返回英文（`main`/`royroy`/...）改为返回中文（`主机体`/`跟随`/`左手`/`右手`/`其它`），与 `excel-parser.js` 口径统一。
- `skillCounts` / `maxSlots` 键由英文改为中文，超限报错信息同步中文。

#### 9. `services/combat-service/src/services/unitConverter.js`（已在 commit 1a8ca94）
- `_skillToTag` 透传 `skill.effect`；`convert` 交还 `skill.type` 主权（优先 `skill.type`，降级 `TYPE_MAP[name]` 中文映射）；`UnitConverter.convert` 拼 `codename`。

> 说明：6/7/8/9 均属 legacy 路径。经核查，生产跑的是网关容器内联实现，且网关版 `excel-validator.ts` 早已使用中文键 + `displayName` 映射，上述 legacy 改动对线上**零影响**，仅保留代码库一致性。

---

## 四、部署过程

### 关键坑：两个镜像名导致"重启"不生效
- 运行容器原镜像 = `mecha-gateway:latest`，但 `docker compose build mecha-gateway` 实际产出 `mecha-universe-engine-mecha-gateway`（项目前缀、无 `:latest`）——**两个不同镜像**。仅 `docker restart` 会复用旧 `mecha-gateway:latest`，线上仍是修复前代码（表现为 `factions` 被劫持返回 `UNIT_NOT_FOUND 404`）。

### 实际部署步骤（仅网关 + 前端，不动 db）
1. `rsync -az --delete ...` 本地 → `/root/mecha-universe-engine/`（保持前后端源码一致）。
2. 前端：`cd frontend && npm run build`（dist 含 NewBattleView.vue 的 console.warn，grep 命中 `index-*.js`）。
3. `docker compose build --no-cache mecha-frontend` → `docker rm -f mecha-frontend`（孤儿容器名冲突，需先删）→ `docker compose up -d --no-deps mecha-frontend`（**仅重建前端**）。
4. 网关此前已用 `docker compose build --no-cache mecha-gateway` + `up -d --no-deps mecha-gateway` 重建（镜像 `mecha-universe-engine-mecha-gateway`，新镜像 dist 中 `factions` 前置修复已验证）。
5. `docker ps` 终态：`mecha-gateway mecha-universe-engine-mecha-gateway Up (healthy)`、`mecha-frontend mecha-universe-engine-mecha-frontend Up (healthy)`、`mecha-battle-db` 未动。

> 前端部署坑固化：前端 Dockerfile 仅 `COPY dist` → 必须先在服务器 `npm run build` 再 `build --no-cache`；旧容器若由旧 compose 创建会名冲突，需 `docker rm -f` 后再 `up -d --no-deps`。

---

## 五、验证结果（smoke-test，全部 PASS）

忠实路径脚本 `/tmp/smoke_battle.py`：建单位（五字段）→ 建真实战斗（map UUID `migrated-map-6-b3f94af0`）→ pending-units → deploy-unit → 断言。

| 验证点 | 结果 |
|---|---|
| `GET /api/units/factions` | HTTP **200**，返回 3 阵营 `['earth','bailong','maxion']`，**不再 404** ✓ |
| `GET /api/units/:id` 五字段持久化 | `totalPoints=250`、`effect=造成100点伤害`、`type=主动`、`owner=主机体`、`attributes.skillSlots=4` 全存活 ✓ |
| `POST /api/combat` + pending-units + deploy-unit | 全部 200，单位成功入战斗 ✓ |
| `GET /api/combat/:battleId/state` 战斗态 | 单位已进入战斗，`skill[0]` 的 `effect`/`type`/`owner` 三项随战斗态存活 ✓ |
| **OVERALL** | **PASS** |

**契约发现（联调必读）**：`pending-units` 的 `units` 必须是**扁平单位对象**（顶层 `id`/`skills`/`stats`/`ownerId`/`matrixId`），而非 `{unitData:{...}}` 嵌套；`deploy-unit` 按 `String(u.id)` 匹配。首次跑因嵌套结构导致 `UNIT_NOT_IN_POOL 404`，改扁平后通过。

**设计说明**：`BattleUnit` 不携带 `totalPoints`/`skillSlots`（仅存 `units` 表），故战斗态断言到 `effect`/`type`/`owner` 三项；`totalPoints`/`skillSlots` 在 `GET /api/units/:id` 层已验证存活——属设计使然，非 bug。

---

## 六、遗留与风险

1. **hangar-service 历史 INSERT bug（与本次无关）**：`unit-import-service.js` 的 INSERT 引用了 `updated_at` 列，但 `db.js` 建表无该列；且 `?`(42) 与 params(41) 差 1，原 legacy 导入本来就必定报错。本次 `total_points` 是成对补齐（`?` 与 param 各 +1），未引入新失衡，但 legacy 路径整体仍不可用。
2. **测试数据污染**：smoke-test 在网关 SQLite 留了少量测试单位 / 战斗记录（轻微，可忽略）。
3. **未提交改动**：`services/hangar-service` 三文件改动尚未 `git commit`。因属 legacy 代码一致性、对线上无影响，提交与否取决于你——如提交仅为留存。

---

## 七、改动文件总览

| 文件 | 性质 | 状态 |
|---|---|---|
| `backend-gateway/src/routes/units.ts` | 网关-生效 | 已提交 `1a8ca94` |
| `backend-gateway/src/routes/combat.ts` | 网关-生效 | 已提交 `1a8ca94` |
| `backend-gateway/src/db/sqlite.ts` | 网关-生效 | 已提交 `1a8ca94` |
| `backend-gateway/src/services/excel-schema-normalizer.ts` | 网关-生效 | 已提交 `1a8ca94` |
| `frontend/src/views/NewBattleView.vue` | 前端-生效 | 已提交 `1a8ca94` + 已部署 |
| `services/combat-service/src/services/unitConverter.js` | legacy-一致性 | 已提交 `1a8ca94` |
| `services/hangar-service/src/services/unit-import-service.js` | legacy-一致性 | 未提交 |
| `services/hangar-service/src/database/db.js` | legacy-一致性 | 未提交 |
| `services/hangar-service/src/services/excel-validator.js` | legacy-一致性 | 未提交 |
