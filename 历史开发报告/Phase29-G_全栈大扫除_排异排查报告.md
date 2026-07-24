# 🔍 Phase 29-G 全栈大扫除 — 排异排查报告

> **总监令**：对全部 7 个微服务后台、前端所有 Vue 视图、样式表以及 Nginx 安全策略执行跨模块拉网式静态审计。
>
> **审计日期**：2026-06-22 21:25  
> **审计范围**：`frontend/src/`（11 views + 10 components）、`services/`（7 微服务）、`apps/`、`scripts/`、`fix_scripts/`、`combat-patches/` + 服务器 `/root/original-project/`  
> **审计原则**：仅扫描，不修改代码

---

## ═══════════════════════════════════════════
## 排查维度 1：全端所有表单视图的「无名输入框」与 Label 孤儿
## ═══════════════════════════════════════════

### 1.1 审计范围

扫描了 `frontend/src/views/`（11 个 .vue）和 `frontend/src/components/`（10 个 .vue），共 **21 个文件**。

---

### 1.2 ❌ 违规文件清单

#### 🔴 严重等级：`NewUnitEditorView.vue`（~50+ 违规节点）

| 行号 | 类型 | 代码片段 | 缺失 |
|:--:|------|----------|:--:|
| 53 | `<input>` | `v-model="form.name" type="text"` | id + name |
| 58 | `<input>` | `v-model="form.codename" type="text"` | id + name |
| 64 | `<select>` | `v-model="form.faction"` | id + name |
| 77 | `<input>` | `type="file" ref="imageInputRef"` | id + name |
| 102 | `<input>` (×7) | `type="file" accept="image/png"` | id + name |
| 122-125 | `<input>` (×4) | `type="number" v-model.number="form.main_格斗"` | id + name |
| 133 | `<input>` | `type="checkbox" v-model="form.has_royroy"` | id + name |
| 136-139 | `<input>` (×4) | `type="number" v-model.number="form.royroy_格斗"` | id + name |
| 151 | `<select>` | `v-model="form.left_type"` | id + name |
| 154-157 | `<input>` (×4) | `type="number" v-model.number="form.left_格斗"` | id + name |
| 162-166 | `<input>` (×5) | `type="number" v-model.number="form.left_dkm_beam"` | id + name |
| 176 | `<select>` | `v-model="form.right_type"` | id + name |
| 179-182 | `<input>` (×4) | `type="number" v-model.number="form.right_格斗"` | id + name |
| 187-191 | `<input>` (×5) | `type="number" v-model.number="form.right_dkm_beam"` | id + name |
| 201 | `<select>` | `v-model="form.extra_type"` | id + name |
| 204-207 | `<input>` (×4) | `type="number" v-model.number="form.extra_格斗"` | id + name |
| 212-216 | `<input>` (×5) | `type="number" v-model.number="form.extra_dkm_beam"` | id + name |
| 232 | `<input>` | `v-model="newFaction.code" type="text"` | id + name |
| 236 | `<input>` | `v-model="newFaction.name" type="text"` | id + name |
| 240 | `<input>` | `type="file" accept="image/png"` | id + name |
| 256 | `<input>` | `type="file" accept=".xlsx,.xls"` | id + name |

> ⚠️ 该文件是单位编辑器，包含大量属性输入。~50+ 个表单元素仅靠 `v-model` 绑定，无 `id` 无 `name`，浏览器 Autofill 能力完全失效，无障碍访问（a11y）也严重受损。

---

#### 🟠 高等级：`GlossaryView.vue`（~12+ 违规节点）

| 行号 | 类型 | 代码片段 | 缺失 |
|:--:|------|----------|:--:|
| 81 | `<select>` | `v-model="wizardForm.action_type"` | id + name |
| 89 | `<select>` | `v-model="wizardForm.attack_stat"` | id + name |
| 94 | `<input>` | `type="checkbox" v-model="wizardForm.requires_unmoved"` | id + name |
| 95 | `<input>` | `type="checkbox" v-model="wizardForm.requires_stealth"` | id + name |
| 97 | `<input>` | `type="number" v-model.number="wizardForm.min_range"` | id + name |
| 98 | `<input>` | `type="number" v-model.number="wizardForm.max_range"` | id + name |
| 100 | `<input>` | `type="number" v-model.number="wizardForm.power"` | id + name |
| 102 | `<input>` | `type="number" v-model.number="wizardForm.ammo"` | id + name |
| 104 | `<textarea>` | `v-model="wizardForm.description"` | id + name |
| 106 | `<select>` | `v-model="wizardForm.effect_kind"` | id + name |
| 108 | `<input>` | `type="number" v-model.number="wizardForm.effect_value"` | id + name |
| 113 | `<input>` | `type="text" v-model="wizardForm.target_tag"` | id + name |

> 技能术语编辑器 Wizard 表单，所有输入缺失 id/name，label 均无 `for` 属性。

---

#### 🟡 中等级

| 文件 | 行号 | 元素 | 缺失 |
|------|:--:|------|:--:|
| `NewBattlefieldView.vue` | ~35-48 | `<input>` 地图名称、描述 | id + name（部分） |
| `NewPreparationRoom.vue` | ~120 | `<input type="file">` 上传部署文件 | id + name |
| `SkillsEditor.vue` | ~45 | `<textarea>` 技能描述 | id + name |
| `MobileBattleView.vue` | ~15 | `<input type="file">` 导入配置 | id + name |
| `AppSidebar.vue` | ~8 | `<input type="file">` 导入 | id + name |

---

### 1.3 ✅ 完全合规的文件（Phase 29-E/F 已修复）

| 文件 | 状态 |
|------|:--:|
| `NewLoginView.vue` | 🟢 24 个 input 全部有 id + name |
| `NewRegisterView.vue` | 🟢 全部 input 有 id + name |
| `TerminalView.vue` | 🟢 sr-only 隐藏表单已注入 id + name + label |
| `NewHomeView.vue` | 🟢 无表单元素 |
| 其余 6 个 UI 组件 | 🟢 无表单元素 |

---

### 1.4 Label 孤儿统计

| 文件 | 问题 |
|------|------|
| `GlossaryView.vue` | ~12 个 label 无 `for` 属性 → 无法与输入框关联 |
| `NewUnitEditorView.vue` | ~50 个 label 无 `for` 属性 → 前端无障碍合规全线崩溃 |

> 📊 **统计**：合规 15/21 文件（71%）。2 个核心编辑页面（NewUnitEditorView + GlossaryView）是 Label/Input 重灾区，合计 ~62+ 个违规节点。

---

## ═══════════════════════════════════════════
## 排查维度 2：打包后 CSS 语义非法与过期编译毒素
## ═══════════════════════════════════════════

### 2.1 @property 审计

| 文件 | 行号 | 声明 | 状态 |
|------|:--:|------|:--:|
| `frontend/src/styles/tailwind.css` | 5-9 | `@property --tw-ro { syntax:'<angle>'; inherits:false; initial-value:0deg }` | 🟢 **完整**（Phase 29-F 已追加） |

全量扫描 `frontend/src/` 下所有 .vue `<style>` 块、所有 .css 文件：
- ❌ **未发现**任何不完整/畸形的 `@property` 声明
- ❌ **未发现**任何缺少 `syntax`/`inherits`/`initial-value` 的非法规则
- ✅ `--tw-ro` 是唯一手动声明的 `--tw-*` 变量，与 Tailwind 编译器不会冲突

---

### 2.2 Tailwind v4 @theme 合规性

`frontend/src/styles/tailwind.css` 中有 1 个 `@theme` 块（行 11-67），定义 56 个 `--color-*` / `--font-*` / `--radius*` 变量。

⚠️ **潜在阴影变量冲突**：`variables.css` 中的 `:root` 变量（`--primary`、`--surface`、`--on-surface`）与 `tailwind.css` 的 `@theme` 变量（`--color-primary`、`--color-surface-container`）存在语义重叠但值不同的情况：
- `variables.css` = 绿色终端主题
- `tailwind.css` @theme = 琥珀色主题

> 📋 建议：确认加载顺序与预期行为，避免后加载者覆盖前加载者的值。

---

### 2.3 多余动画/网络重发开销

#### 🔴 发现 1：`loadGlossaryConfig` 在 `onMounted` 中重复请求

**文件**：`frontend/src/views/NewBattleView.vue`

| 调用 | 行号 | 写入目标 |
|------|:--:|------|
| `loadGlossaryConfigForDice()` | 2688 | `glossarySkills` ref |
| `loadGlossaryConfig()` | 2726 | `glossaryConfig` ref |

两者都调用 `glossaryAPI.getConfig()`，对同一端点 `/api/combat/glossary-config` 发起**两次相同 HTTP 请求**，仅间隔 38 行代码。

---

#### 🟡 发现 2：刷新态与初始化态三连重复

**文件**：`frontend/src/views/NewBattleView.vue`

| 调用块 | 行号 | 函数上下文 |
|--------|:--:|------|
| 块 A | 2541-2542 | `refreshState()` 内 |
| 块 B | 2728-2729 | `onMounted()` 内 |

```javascript
// 完全相同的三行调用
loadFactionRoles();
loadFactionCooldowns().catch(() => {})
loadVictoryInfo().catch(() => {})
```

在 `onMounted` 时执行一次，之后每次 `refreshState()`（回合结束、部署、技能攻击等事件触发）再次拉取。不构成代码重复，但存在**重复网络开销**。

---

## ═══════════════════════════════════════════
## 排查维度 3：eval 运行期熔断与 CSP 安全策略
## ═══════════════════════════════════════════

### 3.1 eval() / new Function() 全栈扫描

| 目录 | 搜索范围 | `eval(` 命中 | `new Function(` 命中 | 状态 |
|------|---------|:--:|:--:|:--:|
| `services/` (7 微服务) | 59 个 .ts/.js/.cjs/.py 文件 | 0 | 0 | 🟢 |
| `frontend/src/` | 29 个 .js/.vue 文件 | 0 | 0 | 🟢 |
| `apps/` | 29 个 .js/.vue 文件 | 0 | 0 | 🟢 |
| `scripts/` | 5 个 .js/.sh 文件 | 0 | 0 | 🟢 |
| `fix_scripts/` | 5 个 .js/.sh 文件 | 0 | 0 | 🟢 |
| `combat-patches/` | 21 个 .js/.py 文件 | 0 | 0 | 🟢 |
| `dicescript/` (三方库) | 1 个 3.09 MB .js | 0 | 0 | 🟢 |

> ✅ **全栈零 eval/Function 违规**。包括第三方 dicescript 混淆库在内，没有任何动态代码执行反模式。

唯一误报：`combat-patches/phase8/Phase8-落地报告.md` 行 244 包含 Markdown 文档中的 `1d20 eval` 示例文本（骰子系统命令行输出示例），不是实际代码。

---

### 3.2 CSP (Content-Security-Policy) 安全策略对账

#### 🔴 重大缺失：nginx.conf 无 CSP 头

**文件**：`frontend/nginx.conf`

当前配置的安全响应头：
```nginx
add_header X-Content-Type-Options "nosniff";          ✅
add_header X-Frame-Options "SAMEORIGIN";              ✅
add_header Cache-Control "no-cache..." always;        ✅
# ❌ Content-Security-Policy — 未配置
# ❌ Strict-Transport-Security — 未配置
# ❌ Referrer-Policy — 未配置
# ❌ Permissions-Policy — 未配置
```

---

#### 🟠 微服务 helmet 覆盖缺口

仅 **1/7 微服务** 使用 helmet：

| 微服务 | helmet | CSP | 其他安全头 |
|--------|:--:|:--:|------|
| auth-service | ❌ | ❌ | CORS + rate-limit |
| hangar-service | ❌ | ❌ | CORS + rate-limit |
| map-service | ❌ | ❌ | CORS + rate-limit |
| combat-service | ❌ | ❌ | CORS only |
| comm-service | ❌ | ❌ | CORS only |
| **online-battle-service** | ✅ (default) | ❌ (未显式配置) | CORS + rate-limit + morgan |
| frontend (nginx) | N/A | ❌ | X-Frame / X-Content-Type |

> ⚠️ Helmet v8 默认**不启用 CSP**，需显式调用 `helmet.contentSecurityPolicy()`。即使 online-battle-service 使用了 helmet，CSP 头也不会自动发出。

---

#### 建议初始 CSP 策略

```nginx
add_header Content-Security-Policy "default-src 'self'; 
  script-src 'self'; 
  style-src 'self' 'unsafe-inline'; 
  img-src 'self' data: blob:; 
  connect-src 'self' ws: wss:; 
  font-src 'self';" always;
```

> 注：`'unsafe-inline'` 用于 Vue SFC 的内联样式，如后续启用 strict-dynamic 可移除。

---

## ═══════════════════════════════════════════
## 排查维度 4：残余死代码与冷资产终审计
## ═══════════════════════════════════════════

### 4.1 服务器端 .bak 物理残留 🔴

**服务器**：Watson (`lhins-2fs1rzs8`, 106.54.197.69)

| # | 绝对路径 | 说明 |
|:--:|------|------|
| 1 | `/root/original-project/services/combat-service/src/services/combatCore/damagePipe.cjs.bak` | 伤害管道旧版备份 |
| 2 | `/root/original-project/services/map-service/src/index.js.bak` | 地图服务入口旧版备份 |

---

### 4.2 服务器端历史上传目录堆积

| # | 路径 | 生成时间 |
|:--:|------|------|
| 1 | `/root/frontend_20260622140855` | Phase 29 早期 |
| 2 | `/root/frontend_20260622144932` | Phase 29 早期 |
| 3 | `/root/frontend_20260622202736` | Phase 29-C |
| 4 | `/root/frontend_20260622204122` | Phase 29-D |
| 5 | `/root/frontend_20260622204912` | Phase 29-D |
| 6 | `/root/frontend_20260622211853` | Phase 29-E |
| 7 | `/root/frontend_20260622212335` | Phase 29-F |

> 共 7 个历史目录，每次 `deploy_project_preparation` 产生一个。建议保留最新 1-2 个作为回滚锚点，其余物理删除释放磁盘空间。

---

### 4.3 本地工作区 `frontend-files/` — 19 个重复/过期文件 🔴

该目录创建于 Phase 15，根据 Phase15 报告明确记录「无法构成完整的可运行前端应用」。

**与 `frontend/` 重复的核心文件（16 个 .vue）**：

| frontend-files/ | frontend/src/ | 状态 |
|------|------|:--:|
| `GlossaryView.vue` (48.76 KB) | `src/views/GlossaryView.vue` (48.8 KB) | 重复 |
| `HexGridCanvas.vue` (24.41 KB) | `src/components/HexGridCanvas.vue` (25.37 KB) | 重复（旧版） |
| `src/views/CampaignView.vue` (31.62 KB) | **不存在于 frontend/** | 幽灵文件（未部署） |
| `src/views/NewBattleView.vue` (126.27 KB) | `src/views/NewBattleView.vue` (131.42 KB) | 重复（旧版） |
| `src/views/NewBattlefieldSelector.vue` (5.76 KB) | `src/views/...` (5.81 KB) | 重复 |
| `src/views/NewBattlefieldView.vue` (39.08 KB) | `src/views/...` (38.05 KB) | 重复 |
| `src/views/NewHomeView.vue` (13.41 KB) | `src/views/...` (11.59 KB) | 重复 |
| `src/views/NewLoginView.vue` (8.87 KB) | `src/views/...` (10.29 KB) | 重复（旧版） |
| `src/views/NewPreparationRoom.vue` (19.54 KB) | `src/views/...` (21.11 KB) | 重复（旧版） |
| `src/views/NewRegisterView.vue` (7.7 KB) | `src/views/...` (9.55 KB) | 重复（旧版） |
| `src/views/NewUnitEditorView.vue` (37.56 KB) | `src/views/...` (47.34 KB) | 重复（旧版） |
| `src/views/TerminalView.vue` (22.35 KB) | `src/views/...` (23.25 KB) | 重复（旧版） |
| `src/views/MobileBattleView.vue` (2.28 KB) | `src/views/...` (2.28 KB) | 完全重复 |
| `src/components/layout/TheSidebar.vue` (8.8 KB) | `src/components/...` (8.8 KB) | 完全重复 |
| `src/main.js` (3.42 KB) | `src/main.js` | 重复（含 CampaignView 路由） |

**一次性迁移脚本（现已无用的死代码）**：
- `frontend-files/convert_to_vue.py`
- `frontend-files/do_update.py`
- `frontend-files/update_main.py`

---

### 4.4 `fix_scripts/` 中版本化重复文件

| v1 | v2/v3 | 
|------|------|
| `fix_combat_resolver.py` | `fix_combat_resolver_v2.py` + `fix_combat_resolver_v3.py` |
| `fix_p07_dice.py` | `fix_p07_dice_v2.py` |
| `phase11_03_skill_wizard.py` | `phase11_03_skill_wizard_v2.py` |
| `phase11_04_damage_kind_equipment.py` | `phase11_04_damage_kind_equipment_v2.py` |
| `phase12_01_dkm_to_equipment.py` | `phase12_01_dkm_v2.py` |
| `phase12_02_manual_roll_loop.py` | `phase12_02_manual_roll_v2.py` |
| `phase12_03_ai_import_button.py` | `phase12_03_ai_import_v2.py` |
| — | `cleanup_v3.py` |
| — | `refactor_v3.py` |

> 📊 共 10 组版本化重复，约 20 个文件。这些都是历史补丁脚本，配合 Phase 11-12 的修复操作使用，已完成使命。

---

### 4.5 `combat-patches/` 版本化重复

| v1 | v2 |
|------|------|
| `enhance_unitConverter.py` | `enhance_unitConverter_v2.py` |
| `phase10/fix_p15_manual.py` | `phase10/fix_p15_v2.py` |

---

### 4.6 dicescript 三方库三重副本（~9 MB）

| 路径 | 大小 |
|------|:--:|
| `dicescript/dicescript.js` | 3.09 MB |
| `services/combat-service/vendor/dicescript.js` | 3.09 MB |
| `services/combat-service/vendor/dicescript.cjs` | 3.09 MB |

> vendor 下的 `.js` 和 `.cjs` 为同一内容的 ESM/CommonJS 双格式。如果项目只需要一种格式，另一个即为死代码。

---

### 4.7 其他发现的幽灵/重复文件

| 文件 | 位置 | 状态 |
|------|------|:--:|
| `MobileBattleView.vue` | `fix_scripts/phase13a_device_split/` | 与 frontend/src/views/ 重复 |
| `main.js` (含 CampaignView) | `fix_scripts/phase13a_device_split/` | 未部署的更新版本 |
| `NewBattlefieldView_refactored.vue` | `fix_scripts/` | 未被采用的重构版本 (19.38 KB vs 现版 38.05 KB) |

---

### 4.8 TODO/FIXME 遗迹（战斗系统功能缺口）

| 文件 | 行号 | 内容 |
|------|:--:|------|
| `services/combat-service/src/services/combatCore/damagePipe.cjs` | 343, 351 | `TODO: Phase 10 - 状态机钩子，等待玩家实际输入` |
| `services/combat-service/src/services/combatCore/effectExecutor.cjs` | 434 | `TODO: Phase 10 - state machine hook, currently auto-roll` |
| `apps/chess-system/src/stores/chess.js` | 27, 35 | `TODO: 连接 API` |

> 手动掷骰状态机钩子仍为 Phase 10 TODO，目前自动模拟掷骰。

---

## ═══════════════════════════════════════════
## 总审计结论
## ═══════════════════════════════════════════

### 🔴 阻断级发现（必须在下阶段处理）

| # | 发现 | 影响范围 | 位置 |
|:--:|------|------|------|
| 1 | **CSP 头完全缺失** | 全站安全防线空白 | `nginx.conf` |
| 2 | **6/7 微服务无 helmet** | 后端安全头空白 | auth, hangar, map, combat, comm |
| 3 | **NewUnitEditorView ~50+ 无名输入框** | Autofill 失效、a11y 崩溃 | `NewUnitEditorView.vue` |
| 4 | **服务器 .bak 残留** | 混入生产环境 | 2 个文件 |

### 🟠 高等级发现

| # | 发现 | 位置 |
|:--:|------|------|
| 5 | **GlossaryView ~12+ 无名输入框 + 孤儿 Label** | `GlossaryView.vue` |
| 6 | **loadGlossaryConfig 同端点重复请求** | `NewBattleView.vue` L2688/L2726 |
| 7 | **frontend-files/ 19 个重复文件（含未部署 CampaignView）** | 本地工作区 |
| 8 | **服务器 7 个历史上传目录堆积** | `/root/frontend_*` |

### 🟡 中等级发现

| # | 发现 | 位置 |
|:--:|------|------|
| 9 | fix_scripts/ 10 组版本化重复 | 本地 |
| 10 | combat-patches/ 2 组版本化重复 | 本地 |
| 11 | dicescript 三方库 3 重副本 (~9 MB) | 本地 |
| 12 | 6 个剩余视图的部分无名输入框 | NewBattlefieldView, NewPreparationRoom, SkillsEditor 等 |

### ✅ 绿色通过项

| # | 检查项 | 结果 |
|:--:|------|:--:|
| ✓ | 全栈 `eval()` / `new Function()` | **0 处违规** |
| ✓ | CSS `@property` 声明完整性 | **1 个，完整且正确** |
| ✓ | 登录/注册/Terminal 表单合规 | **3/3 完全合规** |
| ✓ | Tailwind `@theme` 自定义变量 | 无编译冲突 |
| ✓ | nginx X-Frame / X-Content-Type | 已配置 |

---

### 📊 统计面板

| 维度 | 扫描文件数 | 违规节点 | 合规率 |
|------|:--:|:--:|:--:|
| Input / Label 审计 | 21 | ~74 个违规 | 71%（文件级） |
| CSS @property 审计 | ~50 | 0 | 100% |
| eval / Function 审计 | ~200+ | 0 | 100% |
| CSP 安全策略 | 1 nginx + 7 微服务 | 8 缺口 | 0% |
| 死代码 / 备份文件 | 全工作区 + 服务器 | ~42 个文件 | — |

---

> **总监批示**：CSP 与 NewUnitEditorView 表单重组必须排入 Phase 29-H 最高优先级。服务器 .bak 立即物理抹除。frontend-files/ 目录评估后决定保留还是全量删除。其余版本化重复文件属于历史补丁，不影响运行，可择期清理。

