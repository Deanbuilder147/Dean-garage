# WeirdNova 移动力/移动范围异常 — 修复部署与 Review 报告

> 本文档供用户 Review。对应代码改动已 git 提交（`7ef2b33`）并**已部署到生产服务器**。

- 战斗局 ID：`41abdb30-235a-4fe4-a100-c69705868626`
- 问题单位：`bEXM-21(W) WeirdNova`（面板移动力显示正确，但高亮范围过小、无法移到目标点）
- 对照单位：`麦德雷特据点突击型`（同局，移动正常）
- 部署时间：2026-07-24
- Git 提交：`7ef2b33`（仅含本报告 + `battleStateFactory.ts` + `NewBattleView.vue`）

---

## 一、问题本质（一句话）

移动力存在**两个脱节的数据源**：行动面板从 `parts` 合计取数（WeirdNova=20），而实际移动预算 `moveRange` 被后端错取为陈旧字段 `currentStats.speed`（WeirdNova=3）。二者不一致 → 高亮范围只有应得的 ~10%，点击目标超距报 `OUT_OF_RANGE`。

> 二次复核归因：该 `moveRange=speed` 链路是 HEAD 基线旧逻辑（非本次回归）；但 2026-07-23 的改动只修了"显示数值"、没修"计算/写入链路"，使矛盾从"都错不显眼"变成"面板对、范围错"的可见故障。详见工作区报告 `WeirdNova移动问题报告.md`。

---

## 二、修复方案（链路级单一权威函数）

抽出唯一权威函数 `computeMobility(parts)`，在 `createBattleUnit` 的 `mobility`/`moveRange`、前端面板 `calcMobilityBreakdown`/`resolveUnitMobility`、前端 BFS、后端 `/move` **全链路同源复用**，三者恒等。

### 用户指定的「机动 → 移动力」换算比率（已落地）
1. **机体（机体 / 主机体）**：`移动力 = max(5, ceil(机动值 / 2))`（基础最低 5）
2. **装备（背包 / 载具）**：`移动力 = ceil(机动值 / 3)`
3. 武器 / 防具 / 跟随(Royroy) 不计入移动力

### 改动点
- `backend-gateway/src/battleStateFactory.ts`：删除旧 `sumPartsMobility`（全 parts 累加、含 Royroy），新增 `computeMobility`；`mobility` 与 `moveRange` 同源唯一。
- `frontend/src/views/NewBattleView.vue`：`calcMobilityBreakdown` 与 `resolveUnitMobility` 按同一比率换算，使**面板展示值 = 实际移动预算**。

---

## 三、换算结果验证（按本局真实 parts 数据）

| 单位 | 主机体 | 载具/背包 | Royroy | 修复后 `moveRange`=`mobility`=面板 |
|---|---|---|---|---|
| WeirdNova | max(5, ceil(10/2)) = 5 | ceil(10/3) = 4 | 排除 | **9** |
| 麦德雷特 | max(5, ceil(15/2)) = 8 | — | 排除(10) | **8** |

本地 node 脚本与运行镜像 `grep` 双重验证（`computeMobility` 已进入镜像，`Math.ceil` 出现 2 处对应两比率）。

---

## 四、部署状态（已执行）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 源码同步 | `rsync -az --delete … /mecha-universe-engine/ → 服务器` | ✅ exit 0 |
| 前端构建 | `cd frontend && npm run build` | ✅ 120 模块，3.56s |
| 镜像构建 | `docker compose build --no-cache mecha-gateway mecha-frontend` | ✅ exit 0（网关 tsc 通过） |
| 重启 | `docker compose up -d --no-deps mecha-gateway mecha-frontend` | ✅ Recreate/Started |
| 健康检查 | gateway `/health`=200；两容器 `healthy` | ✅ |

运行镜像校验：`/app/dist/battleStateFactory.js` 含 `computeMobility`，`Math.ceil` 计数=2（与两处比率一致）。

---

## 五、Review 与验证建议

### ⚠️ 重要：本局 `41abdb30...` 仍为旧值
修复**只影响新建战斗**。当前运行局的单位 `moveRange` 在创建时已固化为旧值（WeirdNova=3、麦德雷特=15），本次部署**不会**改变它们。要验证修复效果，请：

- **方案 A（推荐）**：新建一局并放入 WeirdNova，观察其面板移动力应为 **9**、高亮范围显著扩大、可正常移动到范围内落点。
- **方案 B**：保留本局，由我单独 patch 该局内存状态里 WeirdNova→`moveRange=mobility=9`、麦德雷特→`8`（需你确认后再执行，因涉及运行时状态改动）。

### Review 清单
- [ ] `battleStateFactory.ts`：`computeMobility` 比率与 Royroy 排除是否正确
- [ ] `NewBattleView.vue`：`calcMobilityBreakdown` / `resolveUnitMobility` 是否与后端同源
- [ ] 是否接受"面板显示值"语义从"原始机动合计"变为"实际移动力预算"（WeirdNova 由 20→9、麦德雷特 15→8）
- [ ] 是否需要我对本局 `41abdb30` 做运行时 patch（方案 B）

---

## 六、结论

链路级修复已落地并部署，移动力三处（面板/高亮/寻路）现在由唯一权威函数产出、恒等一致。请按第五节验证；若需本局即时生效，确认后我执行运行时 patch。
