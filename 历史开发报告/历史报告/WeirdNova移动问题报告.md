# WeirdNova 移动力/移动范围异常 排查与修复报告

- 战斗局 ID：`41abdb30-235a-4fe4-a100-c69705868626`
- 对照单位：`麦德雷特据点突击型`（同局，移动正常）
- 问题单位：`bEXM-21(W) WeirdNova`（面板移动力正确，但高亮范围过小且无法移到目标点）
- **初步结论（机制）**：「移动距离预算 `moveRange`」取自 `currentStats.speed`，而面板真正使用的「机动 `mobility`」取自 parts 合计；二者不一致导致 `moveRange=3` 而面板显示 20。
- **【二次复核·归因修正】** 经 `git diff` 比对 HEAD 已提交基线确认：`moveRange: params.currentStats?.speed ?? 0` 在 HEAD 基线（battleStateFactory.ts L88）**早已存在**，并非本次（2026-07-23 未提交工作区改动）新增。本次改动**只**把 `mobility` 改为 parts 合计、新增 `parts` 字段、并把面板改成显示 parts 合计（`calcMobilityBreakdown`），**未触碰 `moveRange`**，且在注释里明确写了「moveRange 仍为移动距离预算(speed)，二者语义分离」。**所以根因链路（moveRange 绑 speed）是旧逻辑；但"面板被正确化、moveRange 没被同步修正"正是本次改动造成的"只修显示数值、未修计算/写入链路"的典型后果**——它使原本一致错误的两值变成"面板对、范围错"的可见矛盾（改前面板显示 0 且范围 36，两者都错故不显眼；改后面板 20、范围仍 36，矛盾暴露）。
- **【修复状态】** 已按"链路级单一权威函数"方案实施修复，并加入新的「机动→移动力」换算比率规则（见第八节）。代码改动已写入 `battleStateFactory.ts` 与 `NewBattleView.vue`，**尚未部署、未提交 git**，等待用户确认后提交与部署。

---

## 一、现象（修复前，用户实际看到）

| 表现 | WeirdNova | 麦德雷特据点突击型 |
|---|---|---|
| 行动面板「移动力」显示 | 20（用户认为**正确**） | 15（正确） |
| 高亮可移动范围 | 极小（约 36 格） | 正常（约 373 格） |
| 点击目标点移动 | 失败，报 `移动失败: OUT_OF_RANGE` | 正常 |
| 用户感知 | “范围不对 + 移不到想去的格子” | 一切正常 |

---

## 二、两个单位关键字段对比（取自本局真实战斗状态）

| 字段 | WeirdNova | 麦德雷特 |
|---|---|---|
| `position` | {q:30, r:31}（地形 spawn，cost 0） | {q:26, r:21}（地形 spawn，cost 0） |
| `currentStats.speed` | **3**（陈旧/偏低） | 15 |
| `currentStats.mobility` | 无此字段 | 15 |
| 顶层 `moveRange`（修复前） | **3** ⚠️ | 15 |
| 顶层 `mobility`（修复前） | 20（=主机体10 + 载具10） | 25（=主机体15 + 跟随10） |
| `parts.主机体.机动` | 10 | 15 |
| `parts.其它(载具).机动` | 10 | — |
| `parts.跟随(Royroy).机动` | 0 | 10 |
| 面板实际显示值（修复前） | 20 | 15 |

**核心矛盾**：WeirdNova 的 `moveRange=3`，但其部件真实机动合计为 20（主机体 10 + 载具 10）。麦德雷特的 `moveRange=15` 恰好等于其 `speed=15`，因此一切正常。

---

## 三、根因：移动预算存在“两个数据源”，且彼此脱节

移动力在代码里有两条计算路径，永不互相校准：

### 路径 A —— 面板显示（修复前正确，但语义是"原始机动合计"）
`calcMobilityBreakdown(unit)` 遍历 `parts`：
- `主机体`(机体类) → 计入 mainBody
- `载具`/`背包`(载具类) → 计入 extra
- `跟随`(Royroy) → **不计入**
- 返回 `total = mainBody + extra`

WeirdNova：10 + 10 = **20** → 面板显示 20（用户对的上）。
麦德雷特：15 + 0 = **15** → 面板显示 15。

### 路径 B —— 移动范围高亮 + 后端寻路（修复前错误）
1. **后端建单位** `createBattleUnit`（`battleStateFactory.ts`，修复前）：
   ```ts
   moveRange: params.currentStats?.speed ?? 0,          // ← WeirdNova: speed=3 → moveRange=3
   mobility: (params.parts ? sumPartsMobility(params.parts) : 0) || (params.currentStats?.mobility ?? params.currentStats?.speed ?? 0),
   ```
   `moveRange` 只取 `currentStats.speed`，**完全无视 parts 合计**。WeirdNova 的 `speed=3` 是陈旧/偏低值，于是 `moveRange` 被写成 3。

2. **前端归一化** `normalizeBattleState`：
   ```ts
   if (u.moveRange === undefined || u.moveRange === 0) u.moveRange = u.mobility
   ```
   WeirdNova 的 `moveRange=3`（≠0、≠undefined）→ **不修正**，保持 3。

3. **前端高亮 BFS** `moveRangeHexes`：
   ```ts
   const rawMob = su.moveRange || su.mobility || su['机动'] || 3
   ```
   因为 `su.moveRange=3` 为真，**直接取 3**，忽略正确的 `su.mobility=20`。

4. **后端寻路** `POST /api/combat/:id/move`：
   ```ts
   const rawMob = (unit.moveRange && unit.moveRange > 0) ? unit.moveRange : (unit.mobility || 3)
   ```
   同样取 `unit.moveRange=3` → `movementRange=3` → 地形加权 Dijkstra 预算只有 3。

> 麦德雷特因 `moveRange=15 == currentStats.speed=15`，两条路径意外一致，所以不暴露问题。WeirdNova 的 `speed` 与 `parts` 真实机动脱节，于是爆雷。

---

## 四、“为什么点不到目标”的触发链路

1. 面板显示 20 → 用户预期能走很远。
2. 实际高亮按 `moveRange=3` 计算，只点亮约 36 格（半径 1~2 格），远小于预期。
3. 用户点击预期落点（在 20 范围内、但在 3 范围外）→ `onHexClick` 在 move 模式**不校验是否在 `moveRangeHexes` 内**，直接调 `executeMove` → `combatAPI.move`。
4. 后端 `tsFindPath` 预算=3，目标超预算返回 `OUT_OF_RANGE`。
5. 前端 `executeMove` 捕获 `resp.error` → 日志 `移动失败: OUT_OF_RANGE`，单位不移动。

即：**范围小、点哪都超距**，表现为“范围不对 + 移不到点”。

---

## 五、量化对比（同局实际地图，地形加权 BFS，修复前）

| 单位 | 实际计算预算 | 实际可到达格 | 应得预算(=面板原始机动合计) | 应得可到达格 |
|---|---|---|---|---|
| WeirdNova | 3（moveRange） | **36** | 20（mobility 原始合计） | **342** |
| 麦德雷特 | 15（moveRange） | 373 | 15（面板） | 373 |

WeirdNova 实际可达格仅为应得的 **~10.5%**，差距 9 倍。

---

## 六、修复实施方案（已完成代码改动，待提交/部署）

### 核心思路：抽「单一权威移动力函数」，前后端四处置换同一算法

移动力原先有三套互相脱节的算法：
1. `mobility` 字段 = `sumPartsMobility(parts)`（含 Royroy 的机动，且为原始合计）
2. 面板 = `calcMobilityBreakdown`（排除 Royroy，原始合计）
3. `moveRange` = `currentStats.speed`（可能为陈旧值）

现已抽出**唯一权威函数 `computeMobility(parts)`**，并加入用户指定的换算比率规则（见第八节），在以下四处**同源复用**：
- `createBattleUnit` 的 `mobility` 与 `moveRange`（二者必须相等）
- 前端 `resolveUnitMobility`（兜底解析）
- 前端 `calcMobilityBreakdown`（行动面板展示）
- 前端 BFS `moveRangeHexes`（直接用 `u.moveRange`）
- 后端 `/move` 的 `movementRange`（直接读 `unit.moveRange`）

### 改动 1：`battleStateFactory.ts`
删除旧 `sumPartsMobility`（全 parts 累加、含 Royroy），新增按规则换算的权威函数：
```ts
function computeMobility(parts: any): number {
  if (!parts || typeof parts !== 'object') return 0
  const TYPE_ALIAS = { '机体':'机体','主机体':'机体','载具':'载具','背包':'背包','武器':'武器','防具':'防具','跟随':'跟随' }
  const norm = (t) => TYPE_ALIAS[String(t || '').trim()] || String(t || '')
  let total = 0
  for (const p of Object.values(parts)) {
    if (!p || typeof p !== 'object') continue
    const t = norm(p.normalizedType || p.type)
    const raw = typeof p['机动'] === 'number' ? p['机动'] : (typeof p.mobility === 'number' ? p.mobility : 0)
    if (t === '机体') total += Math.max(5, Math.ceil(raw / 2))        // 机体 2:1，基础最低 5
    else if (t === '载具' || t === '背包') total += Math.ceil(raw / 3) // 装备 3:1
    // 武器 / 防具 / 跟随(Royroy) 不计入移动力
  }
  return total
}
// createBattleUnit 内：
const mob = (params.parts ? computeMobility(params.parts) : 0) || (params.currentStats?.mobility ?? params.currentStats?.speed ?? 0)
mobility: mob,
moveRange: mob,
```

### 改动 2：`NewBattleView.vue`
- `calcMobilityBreakdown` 的 `addPart` 与 `equipState` 兜底分支，均改为按规则换算（`机体` → `max(5, ceil(m/2))`；`载具`/`背包` → `ceil(m/3)`），使**面板展示值 = 实际移动预算**。
- `resolveUnitMobility` 的 parts 分支同样按规则换算（兜底一致性）。

> 前端 BFS 与后端 `/move` 无需改算式，因为它们只读 `moveRange`；只要 `moveRange` 由权威函数产出，二者即自动正确。

### 修复后预期数值（按第八节比率规则）

| 单位 | 主机体换算 | 载具/背包换算 | Royroy | `moveRange`=`mobility`=面板 |
|---|---|---|---|---|
| WeirdNova | max(5, ceil(10/2)) = 5 | ceil(10/3) = 4 | 排除 | **9** |
| 麦德雷特 | max(5, ceil(15/2)) = 8 | 无 | 排除 | **8** |

修复后：`moveRange = mobility = 面板` 三者恒等，高亮范围与可移动落点一致，`OUT_OF_RANGE` 不再因预算错误触发。

---

## 七、附带潜在隐患（同步消除）

旧后端 `sumPartsMobility` 把**所有 parts** 的 `机动` 都累加（含 `跟随`/Royroy），而前端 `calcMobilityBreakdown` **排除 Royroy**，二者原本就分叉：
- 麦德雷特：旧后端 `mobility=25`（含跟随10），前端面板 `15` → 若其 `moveRange` 为 0 触发 `|| unit.mobility` 兜底，会拿到 25，与面板 15 又不一致。
- **本次修复已彻底消除**：权威函数明确"移动力只计 主机体(机体类) + 载具/背包(装备类)，Royroy 不计入"，前后端同一算法，该分叉不再存在。

---

## 八、用户指定的「机动 → 移动力」换算比率规则（已纳入修复）

1. **机体（机体 / 主机体）**：移动力 = `机动值 / 2`，**向上取整**；**机体基础移动力最低 = 5**。
   - 公式：`max(5, ceil(机动值 / 2))`
2. **装备（背包 和 载具）**：移动力 = `机动值 / 3`，**向上取整**。
   - 公式：`ceil(机动值 / 3)`
3. 武器 / 防具 / 跟随(Royroy) 等不计入移动力。
4. `moveRange`、`mobility`、行动面板「移动力」三处**必须由同一权威函数产出，恒等**。

> 注意：该比率规则下，"面板显示值"的语义从"原始机动合计"变为"实际移动力预算"。例如 WeirdNova 面板将从旧值 20 变为 9，麦德雷特从 15 变为 8——这才是真正可用于走格的移动力。

---

## 九、待用户确认后的后续动作

1. **提交 git**：本报告 + `battleStateFactory.ts` + `NewBattleView.vue` 一并提交，供用户 review 改动。
2. **部署**：rsync 整目录到服务器 → `docker compose build --no-cache mecha-gateway mecha-frontend` → `up -d --no-deps mecha-gateway mecha-frontend`。
3. **本局生效说明**：当前运行中的 `41abdb30...` 局单位已在创建时固化了旧的 `moveRange`，修复只影响**新建战斗**。若要本局立即生效，需重开一局，或单独 patch 该战斗状态里 WeirdNova / 麦德雷特 的 `moveRange` 与 `mobility` 为权威值（9 / 8）。是否 patch 待用户确认。

---

## 十、结论一句话

WeirdNova 的「面板移动力(20)」来自 parts 原始机动合计，而「移动距离预算 `moveRange`」被后端错取为陈旧字段 `currentStats.speed(3)`，二者数据源不一致导致高亮范围只有应得的 1/10、点击目标超距报 `OUT_OF_RANGE`。根因是"只修了显示数值、没修计算/写入链路"。本次修复抽出唯一权威函数 `computeMobility`（按机体 2:1/装备 3:1 比率换算、Royroy 排除），在 `createBattleUnit`、前端面板、BFS、后端 `/move` 全链路同源复用，使三者恒等。
