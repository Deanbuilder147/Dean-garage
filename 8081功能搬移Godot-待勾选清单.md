# 8081 功能搬移 Godot — 待勾选清单

> 目的：把 8081（mecha-frontend Vue SPA）上的功能，对照搬进桌面 Godot 项目 `wggodot/alpha4.0`，
> 并在过程中调整前后端（后端 API 适配 Godot、补 Godot 缺的字段/接口）。
> Godot 现状：`Battle3D.gd` 已具备**战斗内 UI**（技能菜单/回合HUD/结束回合/战斗日志/飘字/反击），
> 通过 `api_client.gd` 连后端（login/get_battle_state/post_battle_action）。**无**主菜单/大厅/编辑器。

---

## 勾选约定
- ✅ = 要搬进 Godot
- ⬜ = 不搬（保留在 8081）
- 在每项后手写 ✅/⬜ 即可，或整体选 A/B/C/D 档。

---

## 一、战斗核心（Godot 已部分具备，重点补齐）

### 1. 战场指挥 / NewBattleView（战斗主界面）
- [ ] 六角格战场渲染（缩放/平移/等距）
- [ ] 单位选择 + 阵营面板（己方/敌方棋子列表）
- [ ] 技能菜单（移动/防御/待机 + 各携带技能按钮）
- [ ] 回合 HUD（回合/行动方/轮次）
- [ ] 结束回合按钮
- [ ] 战斗日志 + 伤害/反击/机动/姿态飘字
- [ ] 手动掷骰覆盖（dice-overlay：点击骰子→SUCCESS/FAIL→加成伤害）
- [ ] 略缩图（右下角 BattleMinimap）
- [ ] 部署模式（点击棋子→点地图放置）
- [ ] 地形图例
后端接口：`/api/combat/attack`、`/api/combat/end-turn`、`/api/combat/move`、`/api/combat/skill`、`/api/combat/state`、`/api/combat/dice-config`

### 2. 战术部署 / NewPreparationRoom（整备室·房间内）
- [ ] 房间信息卡（地图/人数/回合时限/名册锁定）
- [ ] 名册分配（身份：玩家/裁判/观战 + 席位：攻击/防守/偷袭）
- [ ] 出战棋子勾选（我的机库选棋带入）
- [ ] 房主：设置人数上限、锁定名册、开战
- [ ] 聊天
后端接口：`/api/rooms/:id`、`/api/rooms/:id/ready`、`/api/rooms/:id/start`、`/api/rooms/:id/players/:userId`、`/api/rooms/:id/players/:userId/units`、`/api/rooms/:id/lock-roster`、`/api/rooms/:id/chat`

---

## 二、准备/导航层（Godot 当前缺口）

### 3. 登录 / NewLoginView + 注册
- [ ] 账号登录（username/password → token）
- [ ] 注册
- [ ] 改密码 / 个人资料
后端接口：`/api/auth/login`、`/api/auth/register`、`/api/auth/me`、`/api/auth/profile`、`/api/auth/change-password`
> 备注：Godot 现硬编码 TEST_USER 自动登录，若要"完整搬"需加登录 UI + token 存储。

### 4. 战术部署列表 / NewBattlefieldSelector（房间大厅）
- [ ] 房间列表（我的/公开）
- [ ] 创建房间（选地图）
- [ ] 加入房间（房号）
- [ ] 返回大厅
后端接口：`/api/rooms`、`/api/rooms/by-code/:code`、`/api/rooms`(POST)、`/api/rooms/:id/join`、`/api/rooms/:id/leave`

### 5. 地图选择 / NewBattlefieldView（选地图开战）
- [ ] 地图列表浏览
- [ ] 地图详情/预览
后端接口：`/api/map/battlefields`、`/api/map/battlefields/:id`

---

## 三、编辑器/工具类（重型，优先级低）

### 6. 单位编辑器 / NewUnitEditorView
- [ ] 创建/编辑单位（属性/技能/阵营/阶位）
- [ ] 从 JSON 创建 / Excel 解析
- [ ] 单位预览图上传
后端接口：`/api/units`(CRUD)、`/api/units/generate`、`/api/units/parse-excel`、`/api/units/create-from-json`、`/api/units/upload-view`

### 7. 词条库 / GlossaryHubNew + GlossaryView
- [ ] 词条列表/详情（SkillListPanel/DetailPanel）
- [ ] 靶场测试（BattleTestPanel）
- [ ] 六段式坐标编辑器（HexCanvasEditor）
- [ ] 词条提交/审核
后端接口：`/api/glossary/*`（glossary.ts 路由组）、`/hub-config/test-skill`

### 8. 地图编辑器 / 地图审核
- [ ] 地图创建/编辑/提交
- [ ] 审核队列
后端接口：`/api/map/battlefields`(POST/PUT)、`/api/map/review-queue`、`/api/map/:id/review`

### 9. 棋子库 / UnitLibraryView + 我的投稿 / MyUnitsView
- [ ] 公开棋子浏览
- [ ] 我的投稿列表
后端接口：`/api/units/public`、`/api/units/my-submissions`

### 10. AI 素材工坊 / AssetGenPanel
- [ ] AI 生成单位/素材
后端接口：`/api/units/generate`、素材生成接口

### 11. 骰子工坊 / DiceConfigView
- [ ] 骰子参数热更（面数/暴击阈值等）
后端接口：`/api/combat/dice-config`(GET/PUT)

### 12. 尺寸工坊 / SizeConfigView
- [ ] 体型尺寸热更
后端接口：尺寸配置接口

### 13. 后台管理 / AdminPermissionsView + BugReport*
- [ ] 权限管理
- [ ] 问题反馈 / 审核
后端接口：`/api/admin/*`、`/api/bug-report/*`

---

## 四、档位建议（供快速选择）
- **A 档（最小可用）**：1 战场指挥（补掷骰/略缩图/部署）+ 3 登录 + 4 大厅 + 2 整备室
- **B 档（战斗闭环）**：A 档 + 5 地图选择
- **C 档（全功能）**：以上全部 + 6~13 编辑器/工具
- **D 档（仅战斗内）**：只补 1 的剩余项，不动导航/登录

---

## 五、前后端需要调整的点（无论选哪档都大概率要做的）
1. `api_client.gd` 现硬编码 `BASE_URL="http://106.54.197.69:8081/api"`，Web 同源应为 `"/api"`；需支持可配置 + token 存储。
2. Godot 现无"选房/选单位"流程，若搬 2/4/5 需 `api_client.gd` 补 rooms/map/units 调用。
3. 后端 `/api/combat/state` 等返回字段 Godot 已消费；若搬编辑器类需确认返回结构是否适配 Godot（JSON 直读即可，无特殊）。
4. 部署：Godot Web 导出物挂 `/godot/*`（Nginx 加 location），不动原 Vue 页面。

请在每项后填 ✅/⬜，或回复 A/B/C/D 档，我据此出实施计划。
