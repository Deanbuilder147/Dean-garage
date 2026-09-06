# 阶段 4 详细实施计划（v2.1 · 结合 alpha3.0 经验 + Godot 工具特性）

> 编写日期：2026-08-13（基于 `phase4-skill-system.md` 增量展开，对齐真实代码现状）
> 前置：阶段 0–3 已完成（通信 / 棋盘渲染 / 单位选中 / 移动全链路打通）
> 工程根：`/Users/dingxuyang/Desktop/wggodot/alpha4.0/`
> 适用：`scenes/Battle3D.gd`（3D 为主，2D `Battle2D.gd` 同构）

---

## 0. 现状速查（基于真实代码，非文档假设）

### 0.1 已具备（本次排查已落地，勿重复造）
| 能力 | 位置 | 说明 |
|------|------|------|
| 技能菜单 UI | `_build_skill_menu` (960) / `_clear_skill_menu` (1050) | 浮动 `Control` 层，每技能一个按钮 |
| 目标选择状态机 | `_enter_skill_targeting`(1190) / `_exit_skill_targeting`(1260) | `_targeting_skill` 非空即"选目标中" |
| 射程环 + 阵营过滤 | `_compute_target_cells`(1198) | 已枚举整射程环 + `minRange` 过滤 + `_same_side` 敌我判定 |
| 高亮绘制 | `_draw_move_highlight` / `_draw_skill_highlight` | 平躺 `Sprite3D` 尖顶六边形贴图（青绿=移动 / 琥珀=技能） |
| 点击判定 | `_handle_skill_click`(800) / `_try_move`(1263) | 用 `_screen_to_hex` 反推 + `is_target_in_range` |
| 施放发送 | `_cast_skill_at`(817) | `api.post_battle_action(_battle_id,"attack",payload)` |
| 回包处理 | `_on_skill_ok`(832) / `_on_skill_err`(839) | 清状态 + 重绘（WS 推送驱动） |
| 敌我兼容判定 | `_same_side`(1199) | ownerId / playerId / faction 任一相同即同方（修 demo 缺 ownerId 误判） |
| 双向键名 | `types.gd.unit_skill`(27) | `cast_range`+`castRange` 等已双向保留 |
| 地形加权 BFS | `hex_math.gd.reachable_cells` | 移动范围对齐后端 `tsFindPath` |

### 0.2 仍缺失（本计划要补，按优先级）
1. **🔴 P0 demo 单位无技能** → `_ensure_demo_battle` 注入测试技能，否则链路无法端到端验证
2. **🔴 P0 事件穿透防线** → 确认 `SkillMenu` 按钮 `mouse_filter=MOUSE_FILTER_STOP` + 棋盘拾取在 `_unhandled_input`（否则点按钮会穿透到棋盘取消选中）
3. **🟡 P1 四层高亮** → 对齐 alpha3：移动青 / minRange 盲区暗红 / AOE 投影蓝 / 射程环黄 / 有效目标红+⊕（当前只有青+琥珀两层）
4. **🟡 P1 方向性 / AOE 技能形状** → alpha3 用 `mcShapes` + `map_cannon.directions` + `computeDirection`，Godot 缺失
5. **🟢 P2 命中飘字 / 特效** → `-XX`/`+XX` Label 瞬显 + 闪白脉冲（阶段 4.4 最小可用）
6. **🟢 P2 取消状态机收口** → 右键/Esc 退出目标选择 → 选中态 → 再右键取消选中（已部分具备，需核对 `_unhandled_input`）

---

## 1. alpha3.0 技能系统核心经验（必须迁移的点）

从 `frontend/src/views/NewBattleView.vue` 2163–2347 提炼的成熟做法：

### 1.1 四层高亮语义（视觉分层，避免玩家混淆）
| 层 | 颜色 | 含义 | alpha3 代码 |
|----|------|------|------|
| 移动范围 | 青 `rgba(0,180,220,0.15)` | 可达落点 | `moveRangeHexes` |
| **minRange 盲区** | 暗红 `rgba(120,40,40,0.22)` | 近身不可施放区（方案 A） | `skillRangeBlindHexes` |
| **AOE 投影** | 蓝 `rgba(80,160,255,0.18)` | 方向性/AOE 命中格预览 | `aoeRangeHexes` |
| 射程环 | 黄 `rgba(255,176,0,0.08)` | 射程内全部格 | `skillRangeHexes` |
| **有效目标** | 红 `rgba(255,77,77,0.2)` + `⊕` | 圈内且阵营合法的单位格 | `validTargets` |

→ **Godot 改造**：`_draw_skill_highlight` 现只用单一琥珀色。需拆成「射程环（黄）+ 有效目标（红+⊕ sprite）+ 盲区（暗红）+ AOE投影（蓝）」四套贴图/材质。

### 1.2 minRange 盲区可视化（alpha3 独有，防误点近身）
```js
const rangeMin = getSkillRangeMin(skill)
if (rangeMin > 0) {
  const blind = getHexesInRange(su.q, su.r, rangeMin - 1).filter(地图内)
  blind.forEach(h => skillRangeBlindHexes.add(`${h.q},${h.r}`))
}
```
→ Godot：在 `_compute_target_cells` 已过滤 `hex_distance < minRange`，但**未单独高亮盲区**。需新增 `_draw_blind_highlight`（暗红）。

### 1.3 方向性 / AOE 技能形状（alpha3 Phase 32 复杂经验）
- `aoe_mode === 'sector'`：读 `skill.range.mcShapes[dir]`（六向相对偏移集合），`computeDirection` 得 1–6，施法者坐标 + 偏移 = 命中格。
- `map_cannon.directions`：`{right:[...],rightup:[...]}` 六向，点集存绝对坐标，减 `CENTER=(8,8)` 还原相对，加施法者坐标。
- **实时转向预览**：鼠标悬停格直接驱动蓝色命中区域方向（不依赖场上是否有敌人）。
→ Godot：需移植 `computeDirection`（已在 `hex_math.gd`？需核对，否则加） + `mcShapes`/`map_cannon` 解析。这是阶段 4 最复杂的一块，**建议 P1 先做圆形 AOE（`aoe_radius` 环），方向性形状放 P1.5**。

### 1.4 射程字段真相源（已对齐，标注）
alpha3 用 `getSkillRange`/`getSkillRangeMin`（前端 `hexUtils.js` 镜像 `shared-kernel`）。Godot `hex_math.gd.get_skill_range_fields` 已双向兜底（§3.3 修正已落地），**无需再改**。

---

## 2. Godot 工具特性适配要点

### 2.1 渲染分层方式差异（Canvas2D vs 3D Sprite3D）
| alpha3（Canvas2D） | Godot 3D 做法 |
|--------------------|---------------|
| `ctx.fillStyle` 逐格重绘 | 预制 4 种高亮 `Sprite3D` 贴图（青/暗红/蓝/黄/红），`_add_highlight_sprite` 按类型选贴图 |
| `drawHexPath` 描边 | 六边形贴图已含描边（见 `_make_highlight_texture` 的 `_hexagon_edge_dist`） |
| `⊕` 文字标记有效目标 | 额外叠一个 `Sprite3D`（红环 + 中心十字 PNG，或程序生成十字贴图） |
| 每帧重绘 | 进入目标选择时一次性生成高亮节点，退出时 `queue_free`，无需 per-frame |

→ **优化**：把 4 种高亮贴图在 `_ready` 预生成缓存（`_hl_tex_move/_hl_tex_blind/_hl_tex_aoe/_hl_tex_range/_hl_tex_target`），避免每次 `_draw_*` 重画 `Image`。

### 2.2 事件穿透（Godot 特有坑）
- 棋盘射线拾取**必须**在 `_unhandled_input(event)`，不能在 `_input`。
- `SkillMenu` 按钮 `mouse_filter = Control.MOUSE_FILTER_STOP`：消费点击后事件不再下发，`_unhandled_input` 收不到 → 棋盘不取消选中。
- 右键/Esc 在 `_unhandled_input` 调 `get_viewport().set_input_as_handled()` 阻断。
→ **核对清单**：`_build_skill_menu` 创建的按钮是否设了 `MOUSE_FILTER_STOP`？当前代码未见显式设置（P0 必查）。

### 2.3 浮动 UI 层
- 技能菜单属 `CanvasLayer`（或 `UILayer` 子节点），`z_index` 高于 3D Viewport。
- Godot 4 的 `SubViewport` + `ViewportContainer` 场景：UI 节点与 3D 视口分离，天然不穿透（比 alpha3 单 Canvas 更干净）。需确认 `Battle3D.tscn` 的 UI 层结构。

---

## 3. 分步实施清单（可执行）

### P0-1：注入 demo 技能（打通链路）
位置：`_ensure_demo_battle`（约 224 行 `DEMO_U1/U2` 之后）
```gdscript
var demo_skills := [
	Types.unit_skill("sk-atk-1", "集束炮击", "远程能量打击", "", 0, 0, 0, "ENERGY",
		"cluster_artillery",", 3, 1, "enemy", "ranged"),   # 注意：unit_skill 第9参是 skill_key
	Types.unit_skill("sk-buff-1", "强化力场", "给友军上 buff", "", 1, 0, 0, "KINETIC",
		"reinforce_field", 1, 0, "ally", "melee"),
	Types.unit_skill("sk-aoe-1", "地图炮", "指定格落点 AOE", "", 2, 0, 0, "ENERGY",
		"map_cannon", 4, 2, "tile", "ranged"),
]
# 给 DEMO_U1 赋 skills: demo_skills（DEMO_U2 作为敌人无技能）
```
⚠️ `Types.unit_skill` 真实签名（types.gd 27 行）：`(id,name,desc,script,cooldown,current_cooldown,energy_cost,damage_type, skill_key="", cast_range=1, min_cast_range=1, target_filter="enemy", category="ranged")`。注入时务必按位置传参，不要写错第 9 参（skill_key）。

### P0-2：事件穿透防线（P0 必做）
在 `_build_skill_menu` 创建按钮处补：
```gdscript
btn.mouse_filter = Control.MOUSE_FILTER_STOP
```
并确认 `_unhandled_input`（约 930 行区域）已处理右键/Esc 退出目标选择（见 0.2-6）。

### P0-3：EventBus 信号总线接入（阶段 5 地基，建议阶段 4 联调后即做）
> 借鉴 `LiGameAcademy/godot4_turn_based_combat_system` 的 `autoload/` 思想（全局单例 + 信号切断 UI 与各系统直接依赖）。alpha3.0 对应物：`frontend/src/utils/battleSocket.js` 单例 socket 封装 + Pinia store 派生 —— 即"单例通信 + 事件订阅"模式已验证，Godot 侧 1:1 映射。

**目标**：把 `Battle3D.gd` 对 `api`/`ws_client` 的直接持有与 `_on_ws_message` 直改场景树，重构为经 `EventBus` 收发，为阶段 5 状态机铺线。

1. 新增 `core/EventBus.gd`（autoload 注册为 `EventBus`），定义信号：
   ```gdscript
   signal battle_state_updated(data: Dictionary)   # WS /ws-native 收到 battle_state
   signal skill_cast_result(ok: bool, payload: Dictionary)
   signal turn_changed(round: int, current_turn: String)   # 阶段 5 用
   ```
2. `net/ws_client.gd` 收到推送 → `EventBus.emit("battle_state_updated", payload)`（WS 层与场景层解耦）。
3. `Battle3D.gd`：
   - `_ready` 中 `EventBus.battle_state_updated.connect(_on_battle_updated)`
   - 原 `_on_ws_message` 改为只 `EventBus.emit("battle_state_updated", data)`，不再直改场景树
   - `_on_battle_updated(data)` 做重绘（现有 `set_battle_state` 逻辑搬入）
   - `_cast_skill_at` 结果经 `EventBus.emit("skill_cast_result", ...)` 由 `_on_skill_ok/err` 改为订阅者
4. **不照搬**：对方 `resources/` 的 `.tres` 技能驱动 —— 后端 JSON 即真相源，Godot 不重建资源文件。

### P1-1：四层高亮贴图预生成（_ready 缓存）
```gdscript
# 在 _ready 末尾
_hl_tex_move   = _make_highlight_texture(Color(0.0, 0.7, 0.85))  # 青（已有逻辑，改名）
_hl_tex_range  = _make_highlight_texture(Color(1.0, 0.7, 0.0))   # 黄射程环
_hl_tex_blind  = _make_highlight_texture(Color(0.6, 0.15, 0.15)) # 暗红盲区
_hl_tex_aoe    = _make_highlight_texture(Color(0.3, 0.6, 1.0))   # 蓝 AOE
_hl_tex_target = _make_target_texture()                         # 红环 + ⊕ 十字
```
`_make_highlight_texture` 已支持传入 `col`。新增 `_make_target_texture`（红环 + 中心十字，复用 `_point_in_hexagon` + 十字线判断）。

### P1-2：盲区 + AOE 投影高亮
- `_compute_target_cells` 返回结构扩展：`{"q","r","unit","in_range","is_target","is_blind","is_aoe"}`
- `_draw_skill_highlight` 按字段选贴图（盲区暗红、AOE 蓝、有效目标红+⊕、其余黄环）。
- 盲区集合：`get_hexes_in_range(sel_q,sel_r,minRange-1)` 过滤地图边界。
- AOE 投影：若 `skill.aoe_radius > 0`，以目标格为中心 `get_hexes_in_range(tq,tr,aoe_radius)` 标蓝（圆形 AOE 先做，方向性 P1.5）。

### P1-3：方向性 / 地图炮形状（P1.5，复杂）
- 移植 `computeDirection(q1,r1,q2,r2) -> int(1-6)` 到 `hex_math.gd`（若缺失）。
- 解析 `skill.range.mcShapes[String(dir)]` / `skill.map_cannon.directions[key]`（绝对坐标减 CENTER(8,8) 还原相对）。
- 悬停格驱动蓝色转向预览（`liveHover` 对应 Godot 的 `_screen_to_hex(get_viewport().get_mouse_position())`）。
- **注意**：Godot 坐标系是 Even-R offset，alpha3 是 axial/offset 混合，移植 `computeDirection` 时需用 `hex_math.gd` 的 Even-R 邻居方向，避免方向错乱。

### P2-1：命中飘字 / 特效（最小可用）
- WS 推送重绘后，对比前后 `currentStats.hp`：下降则在该单位头顶 `Label` 瞬显 `-Δ`（红），上升显 `+Δ`（绿），2 秒淡出 `queue_free`。
- 施法瞬间：施法者→目标连线（或目标格）闪白 `Sprite3D` 脉冲（scale 0.8→1.2→0.8，Tween）。

### P2-2：取消状态机收口
确认 `_unhandled_input` 逻辑（约 930）：
```
右键/Esc：
  if _targeting_skill 非空 → _exit_skill_targeting() + set_input_as_handled()
  elif _selected_unit 非空 → _deselect_unit() + set_input_as_handled()
左键：
  if _targeting_skill 非空 → _handle_skill_click(_screen_to_hex(pos))
  else → _handle_board_click(_screen_to_hex(pos))
```

---

## 4. 与后端契约对齐（关键，避免二次重构）

### 4.1 施法请求（已对齐，标注）
`POST /api/combat/:battleId/attack`（经 `api.post_battle_action(_battle_id,"attack",payload)`）
```json
{
  "attacker_id": "<unitId>",
  "attack_type": "skill",
  "skill_id":    "<skill.id>",
  "target_id":   "<targetUnitId>",     // 单位点选（enemy/ally/self）
  "target_pos":  {"q":2,"r":5}          // AOE/tile 落点（与 target_id 二选一或并行）
}
```
- `skill_id` 可用 `skill_key`/`skill_name` 兜底（后端 id→key→name 解析）。
- **无 `skill_id` 的普通攻击已废除**（400 SKILL_REQUIRED）——攻击必须由技能承载，Godot 前端无"普通攻击"入口。
- 成功 → WS 推送完整 `battle_state`，前端以 WS 为准重绘（已具备）。

### 4.2 射程字段（已对齐）
`get_skill_range_fields` 强兜底 `cast_range`/`castRange`、`min_cast_range`/`minCastRange`（已落地）。

### 4.3 敌我判定（已对齐，刚修）
`_same_side(a,b)`：ownerId/playerId/faction 任一相同即同方（兼容 demo 缺 ownerId）。

---

## 5. 靶场自测清单（端到端）

1. 编辑器播放 → 登录 → 加载 demo 战局，U1 带 3 个技能（含 AOE）。
2. 选中 U1（earth/o1）→ 技能菜单浮现 3 条按钮（名称+射程+消耗）。
3. 点"集束炮击"（enemy, range3）→ 敌方 U2 格高亮红+⊕，射程环黄，无盲区（minRange=1）。
4. 点 U2 → WS 日志 → U2 hp 下降、状态刷新，U1 技能进入 CD。
5. 点"地图炮"（tile, range4, minRange2）→ 射程内全格黄环 + 内 1 格暗红盲区 → 点空格 → 请求含 `target_pos`，AOE 蓝投影生效。
6. 点空白/非法 → 提示"非法目标"，**不发包**。
7. 右键/Esc → 退出目标选择回选中态；再右键 → 取消选中。
8. 点技能菜单按钮时，**棋盘不触发取消选中/非法报错**（事件穿透防线生效）。
9. （P1.5）方向性技能：悬停不同方位 → 蓝色命中区域实时转向。
10. （P2）命中后头顶飘 `-XX` 红字，2 秒淡出。

---

## 6. 风险与注意

- **demo 注入 vs 真实**：P0-1 注入仅本地自测，真实机体上线后移除（`_ensure_demo_battle` 分支）。
- **键名错位**：`get_skill_range_fields` 已双向兜底，勿裸取单一键名。
- **事件穿透**：棋盘拾取务必 `_unhandled_input` + UI `MOUSE_FILTER_STOP`（P0 最高优先，否则菜单不可用）。
- **坐标系**：方向性技能移植 `computeDirection` 必须用 Godot 的 Even-R 邻居（见 hex_math.gd），不能直接抄 alpha3 的 axial 版。
- **性能**：大地图遍历算高亮时，先按 `target_filter` 阵营过滤单位列表，再算距离（alpha3 同款优化）。
- **AOE 真相源**：命中格圈定后端已焊死 `getHexesInRange`，前端实时高亮仅预览，结算以后端为准。
- **信号总线解耦（P0-3 引入）**：WS 推送与技能结果走 `EventBus` 单例广播，渲染层只 `connect` 订阅；重构时勿在 `_on_battle_updated` 之外的函数直改场景树，避免双写入竞争（参考 `LiGameAcademy` autoload 模式）。后续阶段 5 状态机经 `EventBus.turn_changed` 广播，HUD 订阅而非读 `Battle3D` 内部态。

---

## 7. 与 `battle-migration-plan.md` 的衔接

- 本文是阶段 4 的**详细实施版**（v2.1），原 `phase4-skill-system.md` 为设计版（已部分落地）。
- 阶段 4 完成后，下一阶段 = **阶段 4.5（EventBus 信号总线与网络解耦，见 `battle-migration-plan.md`）→ 阶段 5（回合/AP 显示 + 结束回合 + 状态效果图标 + 显式状态机）**，详见 `battle-migration-plan.md`。
- 完成判据（DoD）：§5 靶场清单 1–8 通过即阶段 4 基础达标；9–10 为增强项；P0-3 EventBus 重构在阶段 5 启动前完成。
