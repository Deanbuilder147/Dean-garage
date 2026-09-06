# 阶段 4 详细技术文档：技能系统（词条自由组合 → 战场即时响应）

> 编写日期：2026-08-13（v2，含键名兼容 + 事件穿透 + AOE 落点 + 取消状态机修正）
> 前置：阶段 0–3 已完成（登录 / 拉战局 / WS 同步 / 选中 / 移动 全链路打通）
> 工程根：`/Users/dingxuyang/Desktop/wggodot/alpha4.0/`
> 适用场景：`scenes/Battle2D.gd`(2D) 与 `scenes/Battle3D.gd`(3D) 共用同一套后端契约，本文以 3D 为主述，2D 完全同构。

---

## 1. 目标与范围

**目标**：把后端数据驱动的技能引擎（`skillExecutor` v5.0「主谓宾定状补」词条驱动）接到 Godot 战场交互，实现：

> 选中己方单位 → 弹出技能菜单 → 选技能 → 高亮合法目标 → 点目标 → 后端结算 → WS 推送战场状态变化 → 即时重绘。

**本阶段不做**（留给后续阶段）：
- 阶段 5：回合/AP 显式展示、状态效果图标、结束回合按钮
- 阶段 7：Godot 版词条库积木编辑器（独立子项目）
- 复杂特效/弹道（先做最小可用：闪白/缩放脉冲）

**完成判据（DoD）**：
- [ ] 己方单位被选中后，浮现其 `skills[]` 列表
- [ ] 点击某技能进入"目标选择"模式，按该技能 `cast_range`/`min_cast_range`/`target_filter` 高亮合法格/单位
- [ ] 点合法目标发出 `POST /attack`（`attack_type:"skill"` + `skill_id`），收到 200 且战场状态（hp/position/status）随 WS 推送刷新
- [ ] 非法目标点选被拦截（前端先校验一次，后端二次校验兜底）
- [ ] 右键 / Esc 可退出目标选择或取消选中，且 UI 点击不会穿透到棋盘

---

## 2. 项目现状（精确盘点）

### 2.1 Godot 侧已具备
| 文件 | 现状 |
|------|------|
| `net/ws_client.gd` | ✅ 原生 WS，已封装 `send_action` / 事件回调 |
| `net/api_client.gd` | ✅ `post_battle_action(battle_id, action, payload, ...)` 通用封装，`action="attack"` 直接可用（`POST /combat/:id/:action`） |
| `core/types.gd` | ✅ 数据结构真相源，已有 `unit_skill(...)` / `battle_unit(...)` 工厂 |
| `core/hex_math.gd` | ✅ 已有 `get_hexes_in_range` / `get_hex_key` / `get_skill_range_fields` / `is_target_in_range` |
| `scenes/Battle3D.gd` | ✅ 已接 WS、登录、拉战局、`set_battle_state`；`_screen_to_hex` 屏幕→六边形反推已就绪；移动闭环已通；相机交互打磨完 |
| `scenes/Battle2D.gd` | ✅ 同上（2D 版） |

### 2.2 Godot 侧缺口（本阶段要补）
- ❌ 没有任何 `skill` 菜单 UI（Control 层）
- ❌ 没有"目标选择"高亮 + 取消状态机
- ❌ `get_skill_range_fields` 当前**只读 `bonus_range`/`min_range`，未读 `cast_range`/`castRange`**（见 §3.3 重大修正）
- ❌ `Types.unit_skill` 不含 `cast_range`/`target_filter` 字段

### 2.3 后端已具备（契约）
- `skillExecutor.cjs` v5.0：五谓语 switch；只认通用句式、不认技能名；JSON 词条驱动；**已支持 `target_pos` 坐标落点（AOE / 地图炮）**
- `gateway/src/routes/combat.ts` `POST /api/combat/:battleId/attack`：技能攻击走 `attack_type:"skill"` + `skill_id`（亦可用 `skill_key`/`skill_name` 兜底）
- `getSkillRangeFields(owned)`：射程唯一真相源，**优先读归属技能自身 `cast_range`/`min_cast_range`**，类型基准仅作兜底
- WS `/ws-native`：结算后推送完整 `battle_state`，单位带 `skills[]` / `statusEffects[]` / `currentStats.hp`

### 2.4 ⚠️ 关键前置：demo 单位无技能
当前 `Battle3D.gd` / `Battle2D.gd` demo 单位 `"skills": []`。

**两种解法（先选一种打通链路）**：
- **A（推荐，先打通）**：临时在 `_ensure_demo_battle` 给 demo 单位塞 1–2 个测试技能词条（用 `Types.unit_skill(...)` 构造）。
- **B（贴近真实）**：后端部署携带真实技能的机体，前端 `set_battle_state` 自然拿到 `skills[]`。
- 文档以 **A** 为示例；**B** 上线时移除 demo 注入。

---

## 3. 后端契约（Godot 必须严格对齐）

### 3.1 REST 施法契约（修正版）
请求：`POST /api/combat/:battleId/attack`
```json
{
  "attacker_id": "unit-uuid",
  "target_id":   "target-unit-uuid",            // 目标单位 ID（单位点选）
  "target_pos":  { "q": 2, "r": 5 },            // 目标坐标（AOE / 地图炮 / 任意格点选，与 target_id 二选一或并行）
  "attack_type": "skill",
  "skill_id":    "skill-uuid",
  "context":     {}                              // 可选：手动掷骰等
}
```
- `skill_id` 可用 `skill_key` / `skill_name` 兜底（后端按 id→key→name 顺序解析）。
- 无 `skill_id` 的 `ranged/melee` 分支 **已废除**（返回 400 `SKILL_REQUIRED`）——攻击必须由技能承载。
- **`target_pos` 与 `target_id` 二选一或并行**：AOE/地图炮/召唤/传送类技能以坐标落点，后端 `skillExecutor` 已全面支持。前端务必在契约中声明，避免二次重构。
- 成功响应：`{"success": true, "battle": {...}, "logs": [...]}`；随后 WS 推送同一 `battle_state`，前端以 WS 推送为准重绘。

### 3.2 单位技能词条结构（后端 `owned`）
后端 `owned` 对象的真实字段（GDScript 需兼容）：
- `id` / `name` / `description` / `skill_key`
- 射程：**`cast_range`**（Snake）或 `castRange`（Camel）——二者后端可能任一出现
- 近界：**`min_cast_range`**（Snake）或 `minCastRange`（Camel）
- `target_filter`：`enemy` / `ally` / `self` / `tile`
- `category`：`melee` / `ranged`
- `type`：`active` / `passive`

### 3.3 ⚠️ 重大修正：射程字段键名错位 + Godot 兜底
**问题**：后端 `skillExecutor` 与 `combat.ts` 读取 `owned` 时，字段名存在 Snake_case / CamelCase 混合（如 `min_cast_range` vs `minCastRange`、`cast_range` vs `castRange`）。若 GDScript 只按单一键名取值，JSON 取到 `null` 会回退默认 `1`，导致**前端高亮范围与后端校验范围不一致**。

**强制约定（消除错位）**：
1. `Types.unit_skill` 工厂**双向保留键名**（见 §5.1）：同时写 `cast_range` + `castRange`、`min_cast_range` + `minCastRange`、`target_filter` + `targetFilter`。
2. `HexMath.get_skill_range_fields` **强兜底**（见 §5.5）：用 `skill.get("cast_range", skill.get("castRange", 默认值))` 形式读取，绝不裸取。

---

## 4. Godot 实现要求

### 4.1 架构原则（宪法红线）
- **3D/2D 是渲染终点**：技能菜单属 `Control` 浮动层（z-index 高于 3D Canvas），不嵌入棋盘节点；棋盘只接收 `set_battle_state` push。
- **坐标数学唯一真相源**：3D 目标点用 `_screen_to_hex(click_pos)` 反推；2D 用 `HexBoard.world_to_hex`。
- **通信只走 8081**：`POST /attack` 经 `ApiClient.post_battle_action`，不新增子端口。

### 4.2 交互状态机（选中 → 菜单 → 目标 → 施放）
```
[空闲]
  └─ 左键点己方单位 → [已选中] 弹出技能菜单(读 unit.skills)
       └─ 点技能A → [目标选择] 高亮合法格(target_filter × range)
            └─ 点合法目标 → POST /attack(skill) → [空闲](WS回包重绘)
            └─ 点非法目标 → 提示拒绝，保持[目标选择]
            └─ 右键/Esc → 回[已选中]   ← 必须实现（见 §5.8）
       └─ 右键/Esc → [空闲]
  └─ 右键/Esc（[已选中]时）→ [空闲] 清选中
```

### 4.3 💡 事件穿透防线（UI 节点与 _input 争抢）
**问题**：若棋盘射线拾取写在普通 `_input(event)`，点击 `SkillMenu` 按钮会同时触发棋盘点击 → 取消选中或非法目标报错。

**规范约束**：
- 棋盘的射线/坐标拾取**必须统一写在 `_unhandled_input(event)`**（不是 `_input`）。
- `SkillMenu` 按钮 `mouse_filter = MOUSE_FILTER_STOP`，消费点击事件后，事件不再下发给 `_unhandled_input`，棋盘不接收。
- 任何在 `_unhandled_input` 中处理了的 UI 相关输入，调用 `get_viewport().set_input_as_handled()` 显式阻断。

### 4.4 最小可用 UI（阶段 4 不追求美术）
- 选中己方单位：`Control` 容器内 `VBox` 列出技能按钮（名称 + 射程 + 消耗）。
- 目标选择：复用"可移动范围"高亮，改为按技能 `range` + `target_filter` 着色（建议不同颜色区分"移动高亮"与"技能目标高亮"）。
- 飘字：命中后 `Label` 短暂显示 `-XX` / `+XX`（可选，不阻塞）。

---

## 5. 操作细节（分步实施清单）

### 5.1 core/types.gd 拓展（双向键名，修正版）
```gdscript
static func unit_skill(id, name, description, script, cooldown, current_cooldown, energy_cost, damage_type, skill_key = "", cast_range = 1, min_cast_range = 1, target_filter = "enemy", category = "ranged") -> Dictionary:
	return {
		"id": id, "name": name, "description": description, "script": script,
		"cooldown": cooldown, "currentCooldown": current_cooldown,
		"energyCost": energy_cost, "damageType": damage_type, "skill_key": skill_key,
		# 双向保留键名，兼容 CamelCase 与 Snake_case（避免前端回退默认值错位）
		"cast_range": cast_range, "castRange": cast_range,
		"min_cast_range": min_cast_range, "minCastRange": min_cast_range,
		"target_filter": target_filter, "targetFilter": target_filter,
		"category": category,
	}
```

### 5.2 注入 demo 技能（打通链路）
在 `_ensure_demo_battle` 给单位 `skills` 赋 1–2 条（含一个 AOE 落点示例）：
```gdscript
var demo_skills := [
	Types.unit_skill("sk-atk-1", "集束炮击", "远程能量打击", "", 0, 0, 0, "ENERGY",
		"cluster_artillery", 3, 1, "enemy", "ranged"),
	Types.unit_skill("sk-buff-1", "强化力场", "给友军上攻击 buff", "", 1, 0, 0, "KINETIC",
		"reinforce_field", 1, 0, "ally", "melee"),
	Types.unit_skill("sk-aoe-1", "地图炮", "指定格落点 AOE", "", 2, 0, 0, "ENERGY",
		"map_cannon", 4, 2, "tile", "ranged"),
]
# demo 单位改为 "skills": demo_skills
```
> 上线接真实机体后删此注入。

### 5.3 读取技能并构建菜单数据源
在选中逻辑中（仅 `u.ownerId == _my_user_id`）：
```gdscript
_selected_skills = u.get("skills", [])
if _selected_skills.size() > 0:
	_build_skill_menu(_selected_skills)
```

### 5.4 技能菜单 UI（Control 节点 + mouse_filter）
- 场景树加 `SkillMenu`（`CanvasLayer` 或 `UILayer` 子节点）。
- `_build_skill_menu(skills)`：清空旧按钮，为每个技能 `add_button(name + "  射程" + str(rf.maxRange))`，按钮 `mouse_filter = MOUSE_FILTER_STOP`；`pressed` → `_enter_skill_targeting(skill)`。

### 5.5 目标选择高亮 + 射程强兜底（修正版）
```gdscript
static func get_skill_range_fields(skill: Dictionary) -> Dictionary:
	var max_r = skill.get("cast_range", skill.get("castRange", 1))
	var min_r = skill.get("min_cast_range", skill.get("minCastRange", 1))
	return { "maxRange": int(max_r), "minRange": int(min_r) }

func _enter_skill_targeting(skill: Dictionary):
	_targeting_skill = skill
	var rf = HexMath.get_skill_range_fields(skill)
	_skill_target_cells = _compute_target_cells(skill, rf)   # target_filter + is_target_in_range
	_draw_skill_highlight(_skill_target_cells)

func _compute_target_cells(skill: Dictionary, rf: Dictionary) -> Array:
	var tf: String = skill.get("target_filter", skill.get("targetFilter", "enemy"))
	var cells := []
	var owner_id: String = _selected_owner_id
	for u in _units.values():
		var in_range: bool = HexMath.is_target_in_range(
			_selected_q, _selected_r, u.q, u.r, rf)
		if not in_range:
			continue
		if tf == "enemy" and u.ownerId == owner_id:
			continue
		if tf == "ally" and u.ownerId != owner_id:
			continue
		cells.append({"q": u.q, "r": u.r, "unit": u})
	if tf == "tile" or tf == "self":
		# self：仅自身格；tile：全图射程内任意格
		for cell in HexMath.get_hexes_in_range(_selected_q, _selected_r, rf.maxRange):
			if tf == "tile" or (cell.q == _selected_q and cell.r == _selected_r):
				cells.append({"q": cell.q, "r": cell.r, "unit": null})
	return cells
```

### 5.6 施放与请求发送（修正版，含 AOE 落点）
```gdscript
func _cast_skill_at(target_unit: Dictionary, target_hex: Dictionary):
	var sk = _targeting_skill
	var payload = {
		"attacker_id": _selected_unit_id,
		"attack_type": "skill",
		"skill_id":    sk["id"],
	}
	if target_unit != null and not target_unit.is_empty():
		payload["target_id"] = target_unit.get("unitId", target_unit.get("id", ""))
	if target_hex != null and not target_hex.is_empty():
		payload["target_pos"] = { "q": target_hex.q, "r": target_hex.r }
	api.post_battle_action(_battle_id, "attack", payload, _on_skill_ok, _on_skill_err)

func _on_skill_ok(resp):
	_targeting_skill = null
	_clear_skill_highlight()
	status_label.text = "技能结算完成"
```
> `api.post_battle_action` 已通用（`POST /combat/:id/:action`），`action="attack"` 直接可用，无需补封装。

### 5.7 WS 重绘（已具备）
`set_battle_state` 收到推送后重建单位，`currentStats.hp` / `statusEffects` / `position` 自动刷新——**技能响应可视化零额外代码**，只需确保重绘不重置 `_cam_target`（已实现）。

### 5.8 💡 取消 / 退出状态机（补齐）
棋盘拾取写在 `_unhandled_input`；右键 / Esc 清除状态并 `set_input_as_handled`：
```gdscript
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed):
		if _targeting_skill != null:
			_exit_skill_targeting()          # 清除高亮，回到选中态
			get_viewport().set_input_as_handled()
			return
		elif _selected_unit_id != "":
			_deselect_unit()                  # 清除单位选中
			get_viewport().set_input_as_handled()
			return
	# 以下：左键点选棋盘（目标选择 / 单位选中）
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var click_hex = _screen_to_hex(event.position)
		if _targeting_skill != null:
			_handle_skill_click(click_hex)    # 合法→施放，非法→提示
		else:
			_handle_board_click(click_hex)
```
```gdscript
func _handle_skill_click(click_hex: Dictionary):
	var hit = _find_unit_at_hex(click_hex)
	var tf: String = _targeting_skill.get("target_filter", _targeting_skill.get("targetFilter", "enemy"))
	var is_valid := false
	if tf == "tile" or tf == "self":
		is_valid = _skill_target_cells.any(func(c): return c.q == click_hex.q and c.r == click_hex.r)
	else:
		is_valid = hit != null and _skill_target_cells.any(func(c): return c.unit != null and c.unit.unitId == hit.unitId)
	if not is_valid:
		status_label.text = "非法目标"
		return
	_cast_skill_at(hit if hit != null else {}, click_hex if (tf == "tile" or tf == "self") else {})
```

---

## 6. 自测清单（靶场式）

1. 编辑器播放 → 登录 → demo 战局加载，单位带 `skills`（含 AOE）。
2. 选中己方单位 → 技能菜单浮现 3 条。
3. 点"集束炮击" → 敌方单位格高亮（射程 3）。
4. 点敌方单位 → WS 日志 → 目标 hp 下降、状态刷新。
5. 点"地图炮"（tile）→ 射程内全部格高亮 → 点空格 → 请求含 `target_pos`，AOE 生效。
6. 点空白/非法 → 提示"非法目标"，不发包。
7. 右键 / Esc → 退出目标选择回选中态；再右键 → 取消选中。
8. 点技能菜单按钮时，**棋盘不触发取消选中 / 非法报错**（事件穿透防线生效）。

---

## 7. 风险与注意

- **demo 注入 vs 真实**：5.2 注入仅本地自测，真实机体上线后必须移除。
- **键名错位（最高优先）**：`get_skill_range_fields` 必须双向兜底（§5.5），否则前端高亮与后端校验范围不一致。
- **事件穿透**：棋盘拾取务必在 `_unhandled_input`，UI 按钮 `mouse_filter=STOP`（§4.3）。
- **AOE 落点**：`target_filter=="tile"` 时请求带 `target_pos` 不带 `target_id`（§5.6）。
- **性能**：大地图（span≈2759，数百格）遍历算目标高亮时，先按 `target_filter` 阵营过滤单位列表，再算距离，避免全格遍历卡顿。
