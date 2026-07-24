# 棋子编辑器字段与Excel设定器页单元格坐标映射表

> ⚠️ **版本状态（2026-07-21 更新）**
> - **【旧版 v1 · 2026-04-15 · 已废弃】**：本文档原始设计。基于**固定类型列位置**判定单位（`B4`=主机体类型、`B5`=跟随类型…），单位为预设 5 槽（主机体/跟随/右手/左手/其它），由 `.type` 列直接判定。对应旧 `hangar-service`(port 3002) 解析器，**现已退役**。下方「一～十一」节均为旧版描述，仅供对照。
> - **【新版 v2.1 · 2026-07-21 · 现行有效】**：单位归属改为 **A 列内容驱动**（`resolveUnitKey` 命中别名→标准 key，否则存原文）。校验 `required=['主机体']`，错误信息自解释。详见本文档末尾「**新版 v2.1 设计（现行有效）**」一节，及 `历史报告/2026-07-21_项目进程报告归档/Excel导入与单位编辑器/Excel导入链路诊断报告.md`。
>
> 数据源（旧版）：`weirdnova.xlsx` 或 `作品设定器beta1.xlsx` 的"设定器"工作表
> 创建时间：2026-04-15

---
> 📌 **阅读提示**：正文「一～十一」为旧版 v1 设计；新版改造要点集中在文末「新版 v2.1 设计（现行有效）」与「旧版 vs 新版 对照表」。

---

## 一、基础信息区（Row 1）

| 棋子编辑器字段 | Excel单元格坐标 | 示例值 | 说明 |
|--------------|----------------|--------|------|
| `name` (机体番号) | **C2** | bEXM-21(W) WeirdNova | 机体型号/编号 |
| `codename` (行动代号) | **F2** | 加坦杰厄 | 机体名称/代号 |
| `faction` (所属阵营) | **I2** | 拜隆军 | 阵营归属 |

---

## 二、主机体属性区（Row 3）

| 棋子编辑器字段 | Excel单元格坐标 | 示例值 | 说明 |
|--------------|----------------|--------|------|
| `main_type` (主机体类型) | **B4** | 机体 | 固定值"机体" |
| `main_格斗` | **D4** | 15 | 格斗属性值 |
| `main_射击` | **E4** | 0 | 射击属性值 |
| `main_结构` | **F4** | 15 | 结构属性值(HP基础) |
| `main_机动` | **G4** | 10 | 机动属性值 |
| `main_skills` (技能槽数量) | **H4** | 3 | 主机体技能槽数 |

**注：** `main_image_url` 从首页获取（见下方）

---

## 三、跟随机体(Royroy)属性区（Row 4）

| 棋子编辑器字段 | Excel单元格坐标 | 示例值 | 说明 |
|--------------|----------------|--------|------|
| `has_royroy` (有无跟随) | **B5**非空判断 | Royroy | 若B5有值则为true |
| `royroy_type` (跟随类型) | **B5** | Royroy | 固定值"Royroy" |
| `royroy_格斗` | **D5** | 0 | 格斗属性值 |
| `royroy_射击` | **E5** | 20 | 射击属性值 |
| `royroy_结构` | **F5** | 5 | 结构属性值 |
| `royroy_机动` | **G5** | 0 | 机动属性值 |
| `royroy_skills` (技能槽数量) | **H5** | 2 | 跟随机体技能槽数 |

**注：** `royroy_name` 和 `royroy_image_url` 需要从其他来源获取

---

## 四、右手装备属性区（Row 5）

| 棋子编辑器字段 | Excel单元格坐标 | 示例值 | 说明 |
|--------------|----------------|--------|------|
| `right_type` (右手类型) | **B6** | 武器 | 装备类型 |
| `right_格斗` | **D6** | 0 | 格斗属性值 |
| `right_射击` | **E6** | 14 | 射击属性值 |
| `right_结构` | **F6** | 1 | 结构属性值(耐久度) |
| `right_机动` | **G6** | 0 | 机动属性值 |
| `right_skills` (技能槽数量) | **H6** | 1 | 右手技能槽数 |

---

## 五、左手装备属性区（Row 6）

| 棋子编辑器字段 | Excel单元格坐标 | 示例值 | 说明 |
|--------------|----------------|--------|------|
| `left_type` (左手类型) | **B7** | 武器 | 装备类型 |
| `left_格斗` | **D7** | 0 | 格斗属性值 |
| `left_射击` | **E7** | 14 | 射击属性值 |
| `left_结构` | **F7** | 1 | 结构属性值(耐久度) |
| `left_机动` | **G7** | 0 | 机动属性值 |
| `left_skills` (技能槽数量) | **H7** | 1 | 左手技能槽数 |

---

## 六、其他装备属性区（Row 7）

| 棋子编辑器字段 | Excel单元格坐标 | 示例值 | 说明 |
|--------------|----------------|--------|------|
| `extra_type` (其他类型) | **B8** | 载具 | 装备类型(载具/防具/背包) |
| `extra_格斗` | **D8** | 3 | 格斗属性值 |
| `extra_射击` | **E8** | 0 | 射击属性值 |
| `extra_结构` | **F8** | 2 | 结构属性值 |
| `extra_机动` | **G8** | 10 | 机动属性值 |
| `extra_skills` (技能槽数量) | **H8** | 2 | 其他装备技能槽数 |

---

## 七、技能详情区（Row 11-21）

### 7.1 主机体技能（Row 11-13）

| 技能槽 | 棋子编辑器字段 | Excel单元格坐标 | 示例值 |
|--------|--------------|----------------|--------|
| 技能1 | `main_skill_1_name` | **C12** | 撕裂 |
| | `main_skill_1_type` | **D12** | 近战 |
| | `main_skill_1_attr` | **E12** | 实体 |
| | `main_skill_1_effect` | **F12** | 长柄 |
| 技能2 | `main_skill_2_name` | **C13** | 诱捕 |
| | `main_skill_2_type` | **D13** | 近战 |
| | `main_skill_2_attr` | **E13** | 实体 |
| | `main_skill_2_effect` | **F13** | 反击 |
| 技能3 | `main_skill_3_name` | **C14** | D-field |
| | `main_skill_3_type` | **D14** | 自动化 |
| | `main_skill_3_attr` | **E14** | 光束 |
| | `main_skill_3_effect` | **F14** | 守护 |

### 7.2 跟随机体技能（Row 14-15）

| 技能槽 | 棋子编辑器字段 | Excel单元格坐标 | 示例值 |
|--------|--------------|----------------|--------|
| 技能1 | `royroy_skill_1_name` | **C15** | mega收束炮击 |
| | `royroy_skill_1_type` | **D15** | 远程 |
| | `royroy_skill_1_attr` | **E15** | 光束 |
| | `royroy_skill_1_effect` | **F15** | 稳定 |
| 技能2 | `royroy_skill_2_name` | **C16** | mega扩散炮击 |
| | `royroy_skill_2_type` | **D16** | 远程 |
| | `royroy_skill_2_attr` | **E16** | 光束 |
| | `royroy_skill_2_effect` | **F16** | 扫射 |

### 7.3 右手技能（Row 16）

| 技能槽 | 棋子编辑器字段 | Excel单元格坐标 | 示例值 |
|--------|--------------|----------------|--------|
| 技能1 | `right_skill_1_name` | **C17** | 有线式双发炮 |
| | `right_skill_1_type` | **D17** | 自动化 |
| | `right_skill_1_attr` | **E17** | 光束 |
| | `right_skill_1_effect` | **F17** | 助攻 |

### 7.4 左手技能（Row 18）

| 技能槽 | 棋子编辑器字段 | Excel单元格坐标 | 示例值 |
|--------|--------------|----------------|--------|
| 技能1 | `left_skill_1_name` | **C19** | 有线式双发炮 |
| | `left_skill_1_type` | **D19** | 自动化 |
| | `left_skill_1_attr` | **E19** | 光束 |
| | `left_skill_1_effect` | **F19** | 阻碍 |

### 7.5 其他装备技能（Row 20-21）

| 技能槽 | 棋子编辑器字段 | Excel单元格坐标 | 示例值 |
|--------|--------------|----------------|--------|
| 技能1 | `extra_skill_1_name` | **C21** | 移动补给单元 |
| | `extra_skill_1_type` | **D21** | 近战 |
| | `extra_skill_1_attr` | **E21** | 光束 |增加
| | `extra_skill_1_effect` | **F21** | 补给（双槽） |
| 技能2 | `extra_skill_2_name` | **C22** | 移动补给单元 |
| | `extra_skill_2_type` | **D22** | 近战 |
| | `extra_skill_2_attr` | **E22** | 光束 |增加
| | `extra_skill_2_effect` | **F22** | 补给（双槽） |

---

## 八、图片URL区（首页工作表）不要了

从"首页"工作表获取图片信息：

| 棋子编辑器字段 | Excel工作表 | Excel单元格坐标 | 说明 |
|--------------|------------|----------------|------|
| `main_image_url` | 首页 | **A1** | 主机体图片（DISPIMG公式） |
| `royroy_image_url` | 首页 | **E2** | Royroy图片（DISPIMG公式） |

---

## 九、字段统计汇总

### 9.1 基础属性字段（15个）
- 基础信息：3个（name, codename, faction）
- 主机体属性：6个（type + 4属性 + skills）
- 跟随机体属性：7个（has_royroy + type + 4属性 + skills）
- 右手属性：6个（type + 4属性 + skills）
- 左手属性：6个（type + 4属性 + skills）
- 其他装备属性：6个（type + 4属性 + skills）

### 9.2 技能字段（动态，最多约20个）
- 主机体技能：3槽 × 4字段 = 12个
- 跟随机体技能：2槽 × 4字段 = 8个
- 右手技能：1槽 × 4字段 = 4个
- 左手技能：1槽 × 4字段 = 4个
- 其他装备技能：2槽 × 4字段 = 8个

### 9.3 图片字段（2个）
- main_image_url
- royroy_image_url

**总计：约35-40个字段**

---

## 十、读取代码示例

```javascript
// Excel单元格坐标映射配置
const EXCEL_MAPPING = {
  // 基础信息 (Row 1, 索引从0开始所以是Row 0)
  name: { row: 1, col: 2 },        // C2
  codename: { row: 1, col: 5 },    // F2
  faction: { row: 1, col: 8 },     // I2
  
  // 主机体 (Row 3, 索引是Row 2)
  main_type: { row: 3, col: 1 },      // B4
  main_格斗: { row: 3, col: 3 },      // D4
  main_射击: { row: 3, col: 4 },      // E4
  main_结构: { row: 3, col: 5 },      // F4
  main_机动: { row: 3, col: 6 },      // G4
  main_skills: { row: 3, col: 7 },    // H4
  
  // 跟随机体 (Row 4, 索引是Row 3)
  royroy_type: { row: 4, col: 1 },    // B5
  royroy_格斗: { row: 4, col: 3 },    // D5
  royroy_射击: { row: 4, col: 4 },    // E5
  royroy_结构: { row: 4, col: 5 },    // F5
  royroy_机动: { row: 4, col: 6 },    // G5
  royroy_skills: { row: 4, col: 7 },  // H5
  
  // 右手 (Row 5, 索引是Row 4)
  right_type: { row: 5, col: 1 },     // B6
  right_格斗: { row: 5, col: 3 },     // D6
  right_射击: { row: 5, col: 4 },     // E6
  right_结构: { row: 5, col: 5 },     // F6
  right_机动: { row: 5, col: 6 },     // G6
  right_skills: { row: 5, col: 7 },   // H6
  
  // 左手 (Row 6, 索引是Row 5)
  left_type: { row: 6, col: 1 },      // B7
  left_格斗: { row: 6, col: 3 },      // D7
  left_射击: { row: 6, col: 4 },      // E7
  left_结构: { row: 6, col: 5 },      // F7
  left_机动: { row: 6, col: 6 },      // G7
  left_skills: { row: 6, col: 7 },    // H7
  
  // 其他 (Row 7, 索引是Row 6)
  extra_type: { row: 7, col: 1 },     // B8
  extra_格斗: { row: 7, col: 3 },     // D8
  extra_射击: { row: 7, col: 4 },     // E8
  extra_结构: { row: 7, col: 5 },     // F8
  extra_机动: { row: 7, col: 6 },     // G8
  extra_skills: { row: 7, col: 7 },   // H8
};

// 读取函数示例（使用xlsx库）
function readCell(worksheet, row, col) {
  const cell = worksheet[XLSX.utils.encode_cell({r: row, c: col})];
  return cell ? cell.v : null;
}
```

---

## 十一、注意事项

1. **行索引说明**：Excel行号从1开始，但代码库（如xlsx.js）通常从0开始索引
   - Excel Row 1 → 代码索引 0
   - Excel Row 4 → 代码索引 3

2. **列索引说明**：Excel列号用字母，代码库用数字索引
   - Excel Col A → 代码索引 0
   - Excel Col C → 代码索引 2

3. **技能读取逻辑**：
   - 先读取技能槽数量（如H4=3）
   - 根据数量读取对应行的技能详情
   - 主机体技能从Row 12开始（代码索引11）

4. **图片URL限制**：
   - Excel中的`=DISPIMG(...)`公式需要特殊处理
   - 可能需要从"首页"工作表单独提取图片数据

5. **空值处理**：
   - 某些单元格可能为空（如 royroy_name）
   - 需要设置默认值或标记为可选字段

---
---

# 新版 v2.1 设计（现行有效 · 2026-07-21）

> 本节为 Phase29 大一统改造后、经 2026-07-21 `VALIDATION_ERROR` 诊断再次增强的**现行设计**。旧版 v1 见上文「一～十一」。

## 十二、新版核心变化（相对旧版 v1）

| 维度 | 旧版 v1（2026-04-15，已废弃） | 新版 v2.1（2026-07-21，现行） |
|---|---|---|
| 单位归属判定 | **固定行 + 类型列**：`B4`=主机体类型、`B5`=跟随类型、`B6`=右手类型、`B7`=左手类型、`B8`=其它类型（行号硬编码） | **A 列内容驱动**：`A4`~`A8` 填单位名，`resolveUnitKey` 命中别名→标准 key，否则存原文 |
| 单位 key | `main`/`royroy`/`right`/`left`/`extra`（代码内写死） | `主机体`/`跟随`/`右手`/`左手`/`其它`（中文标准 key） |
| 解析器位置 | 旧 `hangar-service`(port 3002) `excel-parser.js`（已退役） | 网关 `backend-gateway/src/services/excel-parser.ts`（v2.1） |
| 校验 required | 旧 hangar 自有逻辑 | `ExcelValidator`：`required=['主机体']` ← 400 直接来源 |
| 缺单位错误 | 无 / 模糊 | **自解释**：列出「已识别单位=[...]」并提示 A4-A8 填"主机体"或其别名 |
| 失败日志 | 无 | `validate()` 在 `valid=false` 时打印实际单位 key + `basic.name` |
| 枚举范围 | 旧枚举 | 已补 `Royroy`/`载具`（单位类型）、`近战`/`远程`（技能类型），消除误导 warning |
| 部署形态 | 独立 hangar 容器 | 统一进网关镜像 `mecha-universe-engine-mecha-gateway` |

## 十三、新版 A 列驱动单位归属（★核心）

单位不再由 `.type` 列判定，而由 **A 列文字**决定。解析器 `parseUnits` 逻辑：

```ts
const nameCell = sheet['A' + row];          // A4~A8
const aText = String(nameCell?.v ?? '').trim();
if (!aText) continue;                         // ★ A 列为空 → 整行跳过（缺主机体→400）
const unitKey = resolveUnitKey(aText) || aText;  // 命中别名→标准key；未命中→存原文
```

`resolveUnitKey` 别名归一表（**改动点**）：

| 标准 key | 命中别名（精确 + 包含兜底） |
|---|---|
| `主机体` | 主机体 / 主机 / 本体 / 主体 / main / mech / 机体 |
| `跟随` | 跟随 / 随从 / 辅机 / 支援机 / royroy / sub |
| `右手` | 右手 / 右臂 / 右武器 / right / r |
| `左手` | 左手 / 左臂 / 左武器 / left / l |
| `其它` | 其它 / 其他 / 配件 / 装备 / extra |

> ⚠️ **踩坑点（本次 400 根因）**：若 A4 填了自定义名（如"主角机""单位1"）或留空，`resolveUnitKey` 返回 `null` → 存原文 → `units['主机体']` 不存在 → `required` 校验失败 → `400 VALIDATION_ERROR`。
> ✅ **正确填法**：A4 精确填 `主机体`（或别名 `主机`/`本体`/`主体`/`机体`）。

## 十四、新版单元格坐标（属性列不变，归属列改为 A）

| 区块 | 旧版 v1 类型列 | 新版 v2.1 归属列(A) + 属性列 |
|---|---|---|
| 主机体 | `B4`=类型 | **`A4`=主机体**（别名亦可）→ `B`类型/`D`格斗/`E`射击/`F`结构/`G`机动/`H`技能槽 |
| 跟随 | `B5`=类型 | **`A5`=跟随** → 同上列 |
| 右手 | `B6`=类型 | **`A6`=右手** → 同上列 |
| 左手 | `B7`=类型 | **`A7`=左手** → 同上列 |
| 其它 | `B8`=类型 | **`A8`=其它** → 同上列 |

基础信息区坐标两版一致：`C2`=机体番号、`F2`=行动代号、`I2`=阵营。
技能区坐标两版一致：`C12~C22` 技能名，`D`类型/`E`属性/`F`效果，按行号范围归属（12-14 主机体 / 15-16 跟随 / 17-18 右手 / 19-20 左手 / 21-22 其它）。

## 十五、新版校验失败分支（即 400 VALIDATION_ERROR）

```ts
// excel-validator.ts validateUnits()
const required = ['主机体'];
const actualKeys = Object.keys(units);
for (const name of required) {
  if (!units[name]) {
    this.errors.push({
      field: `units.${name}`,
      message: `${name}数据缺失 (期望在第 ${this.getUnitRow(name)} 行)。`
        + `已识别单位=[${actualKeys.join(', ') || '无'}]；`
        + `请确认「设定器」sheet 的 A4-A8 填写了"${name}"或其别名(主机/本体/主体/机体)`,
    });
  }
}
```

两类 `error` 会触发 400：① `units['主机体']` 缺失（A 列问题，最常见）；② `basic.name` 为空（C2 未填）。

## 十六、修改内容归属速查

- **旧版修改内容（2026-04-15 及之前）**：建立固定位置映射表、设定器模板初版、预设 5 槽单位结构。→ 见「一～十一」。
- **新版修改内容（2026-06-24 Phase29 起 → 2026-07-21 增强）**：
  1. Excel 导入从退役的 `hangar-service` 迁移至网关 `units.ts`（新增 `POST /api/units/parse-excel`、`create-from-json`）；
  2. 解析器 TypeScript 化（v2.1），**A 列驱动单位归属**（替代固定 `.type` 列）；
  3. 校验器 `required=['主机体']` + 自解释错误 + 失败诊断日志；
  4. 枚举补 `Royroy`/`载具`/`近战`/`远程` 消除误导 warning；
  5. 修复 `validate()` 内 `units` 作用域 bug（应为 `data.units`），重建网关镜像。
  → 详见 `历史报告/2026-07-21_项目进程报告归档/Excel导入与单位编辑器/Excel导入链路诊断报告.md`。

