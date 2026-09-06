# 攻击"0 伤害"诊断报告 — 战局 cce39656

> 用户疑问：麦德雷特攻击 WeirdNova 时，**对方没受到伤害**（反而之前麦德雷特自己掉血，那是敌方回合回击，见上一报告）。
> 结论：**后端攻击逻辑没有"漏伤 / 方向写反"的真 bug；真正的元凶是"近战超距被静默丢弃"**。

## 一、引擎级复现（决定性证据）

在容器内直接驱动 `skillExecutor`，用麦德雷特真实属性（attack/melee=29, range=1 近战）模拟基础攻击：

| 情形 | 距离 | 引擎返回 | 说明 |
|---|---|---|---|
| CASE1 相邻 (23,28)→(24,28) | 1 | `triggered=true, final_damage=29, dodged=false` | 正常造成 29 伤害 |
| CASE2 不相邻 (23,30)→(24,28) | 2 | `triggered=false, out_of_range=true, final_damage=0` | **超距被引擎正确拒掉，0 伤害** |

→ 引擎本身正确：只要在射程内，麦德雷特稳定打 29 伤害；WeirdNova 满血只可能是那次攻击**根本没进入结算**（超距）。

## 二、为什么"攻击了却 0 伤害"——两处静默缺陷（这才是真问题）

### 缺陷 A：后端 `/attack` 对 `out_of_range` 不报错
`backend-gateway/src/routes/combat.ts:915` 的回写条件：
```js
if (writeBackTarget && result && result.triggered !== false) {  // 超距时 triggered=false → 跳过写血
```
`combat.ts:933-950` 的响应**无论是否超距都返回 `success:true`（HTTP 200）**，`combat_result` 里也**没有 `out_of_range` 字段**，只有 `final_damage:0`：
```js
res.json({ success: true, combat_result: { triggered, final_damage:0, dodged, ... } })
```
即：近战单位在没走到相邻格时点了攻击，后端**静默返回"成功但 0 伤害"**。

### 缺陷 B：前端普通攻击无距离预校验、无"超出射程"提示
- `NewBattleView.vue:2633 executeAttack`：直接 `combatAPI.attack`，**没有距离判断**，后端返回 0 伤害就照常 `addLog('attack', '... 伤害 0')`（line 2657）然后 `refreshState()`。
- 普通攻击（非 tactical 模式）**没有攻击范围高亮**（`attackRangeHexes` 仅在 tactical 分支填充，combat.ts 前端 1758-1807 是 `actionMode==='tactical'` 才计算）。用户**看不到"可攻击/不可攻击"的视觉区分**，很容易对远处敌人点出攻击。

### 叠加后果
麦德雷特是**近战（range=1）**，必须走到相邻格才能打。若你当时点了攻击但麦德雷特还没走到 WeirdNova 旁边：
1. 前端无校验 → 发起请求；
2. 后端 `out_of_range` → 静默 `success:true, final_damage=0`；
3. 前端日志显示"攻击 → 伤害 0"，WeirdNova 满血不动；
4. 用户感知 = "我攻击了，但对方完全没受伤"。

## 三、排除项（已验证非 bug）
- **攻击方向写反**：复现 WeirdNova→麦德雷特（上一报告）证明伤害只落目标，无自伤。本局麦德雷特 attack=29 经 `toExecutorUnit.melee = s.attack ?? 0` 正确注入，CASE1 已验证 29 伤害成立。
- **闪避**：两方 `evasion/accuracy=0`（已查 state），`netDodge=0`，不可能触发闪避。
- **反击**：glossary 无 `counter`，`getSkillConfig('counter')=null`，永不触发（麦德雷特掉血是敌方回合正常攻击，非反击）。

## 四、修复建议（待确认，本次未改）
1. **后端**：`out_of_range`/`below_min_range` 时返回 `success:false` + 明确错误码（如 `OUT_OF_RANGE`）+ 在 `combat_result` 透传 `out_of_range:true`，避免静默 0 伤害。
2. **前端**：`executeAttack` 前加距离预校验（用与后端一致的 `hexDistanceOffset`，距离 > attacker.range 时拦截并提示"超出射程"）；普通攻击也像 tactical 一样高亮可攻击范围，避免误点。

## 五、副作用说明
本次仅做**只读**核查 + 引擎级 node 模拟（未对战局发起任何 `/attack`/`/move` 写入）。麦德雷特仍维持上一次诊断遗留的 `hp=0（阵亡）` 状态，待用户决定恢复方式。

---
诊断时间：2026-07-24 ｜ 仅诊断，未改源码、未重部署。
