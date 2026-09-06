# 六段式词条编辑器可用性测试报告 — 2026-09-04

## 测试目的
模拟真实玩家在前端 `http://106.54.197.69:8081/glossary-studio` 对《扫射》(sweep) 词条进行编辑，验证六段式词条编辑器是否可用。

> 说明：本次仅为**可用性测试**，不修改任何代码/配置，也不对编辑器做修复。

## 环境
- URL: `http://106.54.197.69:8081/glossary-studio`
- 账号: `deantest` / `7654321`
- 浏览器: `agent-browser 0.22.3` (Chromium)
- 部署状态: 中英双语化已上线 8081（HTTP 200）

## 测试步骤（模拟玩家真实操作）
1. 登录并进入 `/glossary-studio`。
2. 在左侧词条列表点击《扫射 sweep》（玩家编辑已有词条的第一动作）。
3. 顶部切到「六段式 · Six-Phase」tab。
4. 点击「保存 / 编辑 · Save / Edit」进入编辑模式，尝试对画布进行编辑。
5. 交叉验证点击其他词条（如《格挡 block》）。

## 实际结果
- 步骤 2 即失败：点击《扫射》后，左侧列表中《扫射》**无任何选中/高亮反馈**（列表中仍只有《格挡 block》保持高亮/默认选中），六段式画布仍显示占位文案：
  > 请先在左侧词条列表中选择一个词条 / Select an entry from the left list first
- 右下「当前词条属性（只读）」面板显示「请选择一个词条」。
- 因词条从未被加载进画布，步骤 4 的“编辑画布”无从进行——画布为空，无可编辑的原子 / 段。
- 多个词条（扫射、格挡）均如此，非单个词条数据问题。

## 测试结论
**六段式词条编辑器当前不可用。** 阻塞点在于：作为玩家，无法将已有词条（如《扫射》）选中并加载进六段式画布，因此无法对其执行任何编辑。编辑器的“载入已有词条 → 编辑”核心路径断裂。

## 根因方向（仅作后续排查参考，本次未修复）
左侧列表项的 click 事件似乎完全没有生效（连本地选中态都未更新），可能原因：
1. 列表项 `@click` 未绑定 handler，或 handler 为空 / 静默报错。
2. `selectSkill` 等 handler 内部逻辑丢失，只渲染了列表项而未连接事件。
3. `ref` 运行时指向与 snapshot 定位元素不一致（事件委托失效）。
4. 与本次双语化改动无关（未触碰词条加载逻辑），属既有问题。

## 证据截图
- [点击扫射后列表无变化（格挡仍高亮，扫射无选中）](./glossary-studio-click-sweep-no-effect.png)
- [格挡高亮但六段式画布仍提示“请选择一个词条”](./glossary-studio-block-selected-no-load.png)

## 后续建议（若需使其可用）
- 检查 `GlossaryStudio.vue` 左侧列表项 `@click` 绑定与 `selectedSkillKey` / `currentEntry` 状态流转，确保点击能加载词条进六段式画布。

## 《扫射》词条的六段式编写规范（期望的填写方式）

基于存储配置 `glossary-skill-config.json` 的 `sweep` 词条，正确的六段式应如下填写（段式顺序：WHEN → IF → ROLL → DO → AFTER → COST，WHO 并入 DO 段首原子）：

| 段式 | 应插入的原子（面板真实 key / label） | 说明 |
|------|---------------------|------|
| **WHEN** | `manual`（A13 手动释放，effectType `trigger`，字段 `phase` 默认 `any`） | 玩家主动释放；`phase=any` 表示任意相位可释放；⚠ 面板**无 `active` 原子**，组 A 只有触发时机类（on_* / manual），故用 `manual` 代替原配置 tree 的 `active` |
| **IF** | （空 / 无条件） | 配置 `conditions: []`，无需条件原子 |
| **ROLL** | `roll_segments`（C2 单数值二分，effectType `roll_segment`，method=dice，sides=6） | 掷 1d6；**两个 Segment 分桶映射 DO 两条路径**：Segment A=1–3 走「单体精准」，Segment B=4–6 走「范围均摊」 |
| **DO** | Segment A（对应 ROLL 1–3）：`direct_damage`（D1 伤害加减值，effectType `direct_damage`，damage_mode=override，flat_value=-2） | 精准命中**单体**；目标在编辑器内通过目标选定步骤指定（D1 无 target_scope 字段，不靠原子设置） |
|  | Segment B（对应 ROLL 4–6）：`direct_damage_split`（D3 伤害均摊，effectType `direct_damage_split`，total_damage=-6，split=equally，target_scope=area） | 对全体敌人总伤 -6 均摊；⚠ 均摊是**独立原子 D3**，非 D1 加 split_mode |
|  | Segment B（对应 ROLL 4–6，附加减益）：`modify_stat`（F1 属性增减益，effectType `modify_stat`，target_stat=mobility，value=-5，duration=1） | 本回合机动值 -5；⚠ F1 **无 scope 字段**，减益目标跟随所在 Segment B 的 DO 上下文（与 D3 同 `target_scope=area`，即全体被命中敌人），`duration=1` 表示持续至本回合结束 |
| **AFTER** | （空） | 配置无 AFTER 原子 |
| **COST** | `cost_ap`（E4 AP 代价，effectType `cost_ap`，amount=1） | AP 1 |

### 原子面板核对结论（vs `atomGroups.js` 真相源）
| 报告原写法 | 面板是否存在 | 修正为 |
|------|------|------|
| WHEN `active` | ❌ 不存在 | → `manual`（A13 手动释放） |
| ROLL `roll 1d6` | ✅ 存在 | `roll_segments`（C2） |
| DO `damage` -2（SINGLE_ENEMY / override / none） | ⚠ 字段不符 | → `direct_damage`（D1），作用域由目标选定决定 |
| DO `damage` -6（AREA_ENEMY / override / equal） | ⚠ 均摊非字段 | → `direct_damage_split`（D3，独立原子） |
| DO `mobility` -5 本回合 | ✅ 存在 | `modify_stat`（F1，target_stat=mobility） |
| COST `cost` AP1 | ✅ 存在 | `cost_ap`（E4） |

> 结论：除 WHEN 原写的 `active` 在面板缺位需改用 `manual`、DO 段伤害原子应拆成面板真实的 `D1`/`D3` 两个原子外，其余（`roll_segments` / `modify_stat` / `cost_ap`）均在原子面板中存在。这进一步说明：即使列表选中 bug 修好，编辑器要完整还原《扫射》也需正确处理 `manual` 触发与「D1 单体 + D3 均摊」两原子拆分。

要点：
- 伤害全部由 `roll.segments[].effects` 经 effectExecutor 结算（纯 Segment 模型，`engine_meta.model: pure_segment`），顶层 `base_damage: 0`、`effects: []`。
- 射程 1–3 格（`max_range: 3`），动能伤害（`damage_kind: kinetic`），`action_type: passive` 仅作谓语承载、不重复扣血。
- 当前存储的 `tree` 仅显式存了 `WHEN(active)` 与 `DO(两个 damage 原子)`，而 ROLL（掷骰 + Segment）与 COST（AP1）走的是顶层 `roll` / `cost` 字段——编辑器需把这两部分也正确还原进对应段式，才是完整的六段式呈现。

> 以上为《扫射》在六段式编辑器中的**期望填写方式**参照；因本次测试发现列表选中失效，玩家目前无法在画布上实际填入上述内容（见「测试结论」）。

