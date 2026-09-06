# Godot 全功能客户端 UI 设计方案（C 档 · 对齐 8081 全部功能）

> 目标：把 8081（mecha-frontend）的 13 项功能完整搬进 Godot 项目 `wggodot/alpha4.0`，
> 设计一套**统一的新 UI 界面**，并逐项调整（界面）。本文件是设计蓝图 + 架构骨架，
> 供你确认后逐文件实现。
> 设计基于**真实后端接口**（已核查 routes/*.ts）与 **Godot 现状**（`Battle3D.gd` 已具备战斗内 UI）。

---

## 一、现状基线（已核查真实代码）

### Godot 真源 `wggodot/alpha4.0` 已有
- 核心场景 `Battle3D.tscn` + `scenes/Battle3D.gd`：**完整战斗内 UI**
  - 网络 `net/api_client.gd`（BASE_URL 硬编码 `http://106.54.197.69:8081/api`、自动登录 TEST_USER、get_battle_state/post_battle_action）
  - 渲染 `render/hex_grid_renderer.gd`、实体 `entities/Unit.gd`、状态机 `core/combat_state_machine.gd`
  - UI：`UILayer`（回合HUD/EndTurnButton/StatusLabel/SkillMenu/SkillList/EnemyTurnBanner）、动态战斗日志 RichTextLabel、飘字/反击/体型横幅
- `project.godot`：run/main_scene 直奔 `Battle3D.tscn`，**无主菜单/导航/编辑器场景**。

### 缺的（C 档要新建）
主菜单、登录、房间大厅、地图选择、整备室、以及 6~13 编辑器/工具类页面 UI。

---

## 二、视觉规范（统一新 UI 基调）

对齐 8081 现有风格（深色军事战术风 + 琥珀/青色强调，见 `glossary-theme.css`）：

| 项 | 值 |
|---|---|
| 背景 | `#0d1117` 深空灰，面板 `#161b22` |
| 主强调 | `#ffb000` 琥珀（行动/选中） |
| 次强调 | `#36c5f0` 青（信息/链接） |
| 危险/反击 | `#ff4d4f` 红 |
| 防御/姿态 | `#4d9bff` 蓝 |
| 字体 | 等宽优先（UI 用 `res://ui/fonts/NotoSansMono.ttf`，导出时挂字体） |
| 面板圆角 | 6px，边框 1px `#30363d` |
| 间距 | 8/12/16 栅格 |

建立统一 UI 主题：新建 `ui/Theme.tres`（通过 `ProjectSettings.gui/theme` 全局应用），所有 Control 继承，保证逐页一致。

---

## 三、场景树架构（新导航骨架）

```
res://
├─ main_menu.tscn          # 主菜单（登录/注册/游客/进入大厅）
├─ lobby.tscn              # 房间大厅（列表/创建/加入）
├─ map_select.tscn         # 地图选择
├─ prep_room.tscn          # 整备室（房间内·名册/选棋/开战）
├─ battle.tscn             # = 现 Battle3D.tscn（战场指挥，补全掷骰/略缩图/部署）
├─ editors/
│   ├─ unit_editor.tscn     # 单位编辑器
│   ├─ glossary_studio.tscn # 词条库
│   ├─ map_editor.tscn      # 地图编辑器
│   ├─ unit_library.tscn    # 棋子库
│   ├─ asset_gen.tscn       # AI 素材工坊
│   ├─ dice_config.tscn     # 骰子工坊
│   ├─ size_config.tscn     # 尺寸工坊
│   └─ admin_panel.tscn     # 后台/反馈
└─ ui/
    ├─ Theme.tres
    ├─ components/          # 复用组件：Navbar / Card / Button / ListRow / Modal / Toast
    └─ fonts/
```

**导航流**：`main_menu → lobby → (创建→map_select→prep_room) | (加入→prep_room) → battle`
编辑类从 `main_menu` 的"工具"入口直达，与战斗流解耦。

### 全局导航栏（Navbar）
每个非战斗场景顶部挂统一 `Navbar`（返回/标题/用户态/登出）。战斗场景不挂（用原 HUD）。

---

## 四、逐项 UI 设计（13 项对照 8081）

### 1. 战场指挥（battle.tscn，补完 `Battle3D`）
- 现有已含：六角渲染/选单位/技能菜单/回合HUD/结束回合/日志/飘字。
- **新增**：①掷骰覆盖层 `DiceOverlay`（点击骰子→SUCCESS/FAIL→加成）②右下略缩图 `BattleMinimap` ③部署模式高亮（点击棋子→地图放置光标）。
- 后端已支持：`/attack /end-turn /move /skill /state`、`/combat/dice-config`。无需新增接口。

### 2. 整备室（prep_room.tscn）
- 左：房间信息卡（地图名/人数/回合时限/名册锁定态）。
- 中：我的机库列表（多选棋子带入），席位分配（玩家/裁判/观战 × 攻击/防守/偷袭）。
- 右：房主控制（人数上限/锁定名册/开战按钮）+ 聊天框。
- 接口：`GET /api/rooms/:id`、`PUT /players/:userId/units`、`PUT /players/:userId`（身份）、`POST /start`、`POST /lock-roster`、`GET/POST /chat`。

### 3. 登录（main_menu.tscn 内含 LoginPanel）
- 账号/密码输入 + 登录/注册切换 + 游客进入（游客→直接大厅，无 token）。
- 注册展开表单（username/password/confirm）。
- 成功后存 token（见第五节 `api_client` 改造）。
- 接口：`POST /auth/login`、`POST /auth/register`、`GET /auth/me`。

### 4. 房间大厅（lobby.tscn）
- 顶部：创建房间（名称+地图下拉）→ `POST /api/rooms`。
- 列表：我的房间 + 公开房间（房间号/地图/人数/状态），行内"加入"→ `POST /:id/join`。
- 房间号快速加入输入框 → `GET /by-code/:code`。
- 接口：`GET /api/rooms`、`POST /api/rooms`、`GET /by-code/:code`、`POST /:id/join`、`POST /:id/leave`。

### 5. 地图选择（map_select.tscn）
- 网格卡片列表（缩略图/名称/尺寸/作者），点击选中→带入创建房间或预览。
- 接口：`GET /api/map/battlefields`、`GET /api/map/battlefields/:id`。

### 6. 单位编辑器（unit_editor.tscn）
- 表单：名称/阵营(factions)/阶位/属性(HP/ATK/DEF/MOB)/技能(JSON或可视化)/预览图上传。
- 操作：保存 `POST /api/units`、从 JSON `POST /create-from-json`、Excel `POST /parse-excel`、预览图 `POST /upload-view`。
- 列表侧栏：我的单位 `GET /api/units/my-submissions`。

### 7. 词条库（glossary_studio.tscn）
- 三栏：SkillListPanel（词条列表）/ DetailPanel（详情+六段式 HexCanvasEditor）/ BattleTestPanel（靶场 `POST /hub-config/test-skill`）。
- 接口：`/api/glossary/*`、`/hub-config/test-skill`。

### 8. 地图编辑器（map_editor.tscn）
- 画布放置地形格 + 提交审核。
- 接口：`POST /api/map/battlefields`、`PUT /:id`、`GET /review-queue`、`POST /:mapId/review`。

### 9. 棋子库（unit_library.tscn）
- 公开棋子卡片浏览 `GET /api/units/public`；"我的投稿"标签 `GET /api/units/my-submissions`。

### 10. AI 素材工坊（asset_gen.tscn）
- 输入描述→生成 `POST /api/units/generate`，结果预览/采纳入库。

### 11. 骰子工坊（dice_config.tscn）
- 表单热更面数/暴击阈值/倍率 → `PUT /api/combat/dice-config`，实时回显 `GET`。

### 12. 尺寸工坊（size_config.tscn）
- 体型 S/M/L/XL 盒子尺寸/受击系数热更，GET/PUT 尺寸配置接口。

### 13. 后台/反馈（admin_panel.tscn）
- 权限管理 `GET /api/admin/*`；问题反馈 `POST /api/bug-report/*` + 审核队列。

---

## 五、前后端适配（必须做的改造）

### A. `net/api_client.gd` 重构（关键）
当前硬编码 + 自动登录，需升级为：
- `BASE_URL` 可配置：编辑器内默认 `http://106.54.197.69:8081/api`，**Web 导出改为 `"/api"`**（同源，避免 CSP 跨域）。
- `token` 持久化：`user://auth_token.cfg`（Godot 用户目录），请求头带 `Authorization: Bearer <token>`。
- 新增方法覆盖全部接口：auth(login/register/me)、rooms(列表/创建/加入/离开/就绪/开战/聊天/名册/设置)、map(列表/详情/提交/审核)、units(CRUD/生成/解析/预览图)、glossary、dice-config、size-config、admin、bug-report。
- 错误统一回调（Toast 显示）。

### B. 后端是否需改
- 后端接口已基本齐全，**无需大规模改动**。
- 唯一潜在项：Godot Web 走同源 `/api`，需确认网关 CORS 对 `http://106.54.197.69:8081` 已放行（8081 是前端域名，同源无跨域问题）。
- 文件上传（单位预览图/Excel）：Godot `HTTPClient` 需 `multipart/form-data` 支持——`api_client.gd` 需用 `multipart` 构造 body（Godot 4 的 `HTTPClient` 需手动拼 boundary）。这是编辑器类的技术债，实现时单独处理。

### C. 部署
Godot Web 导出物挂 `frontend/public/godot/`，Nginx 加 `/godot/` location（MIME=wasm/js，CSP 放开 worker/blob）。**原 Vue 页面零影响**。

---

## 六、实施顺序（建议，便于你逐项验收）
1. 视觉规范 + `Theme.tres` + `ui/components/` 复用组件
2. `api_client.gd` 重构（token/可配置/全接口）
3. main_menu + 登录（3）
4. lobby + map_select + prep_room（4/5/2）
5. battle 补完掷骰/略缩图/部署（1）
6. 编辑器类：unit_editor / glossary_studio / map_editor / unit_library / asset_gen / dice_config / size_config / admin_panel（6~13）
7. Web 导出 + Nginx + 部署验证

---

## 七、待你确认
- [ ] 视觉基调（琥珀+青深空）是否采纳？或要别的配色
- [ ] 复用组件粒度（Navbar/Card/Modal/Toast 是否够）
- [ ] 是否接受"编辑器类文件上传用 multipart 手拼"（技术债）
- [ ] 确认后我从「第六步-1 视觉规范+组件」开始逐文件实现

> 注：C 档 13 页全做体量很大，我会按第六节顺序**逐场景、逐项提交可运行代码**，每完成一块同步 rsync 回桌面真源并说明如何验证。
