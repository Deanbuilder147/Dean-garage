# Excel 导入链路诊断报告

> 生成时间：2026-07-21
> 环境：macOS 本地 / 服务器 `106.54.197.69`（网关容器 `mecha-gateway`，镜像 `mecha-universe-engine-mecha-gateway`）
> 现象：浏览器控制台 `POST /api/units/parse-excel` → **400 Bad Request**；网页弹窗：`解析失败: VALIDATION_ERROR`

---

## 一、现象与确认

| 现象 | 含义 |
|---|---|
| 控制台 `parse-excel` 状态 400 | 请求**成功到达后端**并进入业务逻辑（非网络错误、非 CORS、非 404 路由缺失） |
| 弹窗 `解析失败: VALIDATION_ERROR` | 前端 `d.error === 'VALIDATION_ERROR'`，来自网关 `/api/units/parse-excel` 的**校验失败分支**（而非解析异常） |
| 非 `解析失败: 401` | 说明已带登录 token，鉴权通过，卡在数据校验 |
| 非 `解析失败: Network Error` | 排除 vite proxy 主机名问题（上一轮已修复 `online` 默认 `localhost`） |

**结论**：请求链路完全通畅，失败点在**数据校验环节**——`ExcelValidator.validate()` 返回 `valid:false`，网关回 `400 VALIDATION_ERROR`。

---

## 二、完整链路流程图

```
[浏览器] NewUnitEditorView.vue
   └─ <input type=file @change=handleFileSelect>
        │  fd.append('file', file)
        ▼
[前端 API] client.js : hangarAPI.parseExcel(fd)
   └─ apiClient.post('/units/parse-excel', fd)   ← 经 vite proxy / nginx 反代
        ▼
[网关] nginx (8081) → mecha-gateway (3006)  location /api/* → gateway:3006
        ▼
[网关路由] units.ts : router.post('/parse-excel', authenticate, upload.single('file'))
   ├─ 无文件 → 400 FILE_REQUIRED
   ├─ ExcelParser.parse(buffer)
   │     ├─ selectSheet()        优先"设定器"sheet
   │     ├─ parseBasic()         C2/F2/I2
   │     ├─ parseUnits()         ★ A列内容决定单位归属(resolveUnitKey)
   │     └─ parseSkills()        行号范围分配 owner
   ├─ ExcelValidator.validate(parsed)
   │     ├─ validateBasic()      name(C2) 必填
   │     ├─ validateUnits()      ★ required=['主机体']  ← 400 来源
   │     └─ validateSkills()
   ├─ valid=false → 400 VALIDATION_ERROR { errors, warnings }   ★ 用户命中此分支
   └─ valid=true  → normalizeParsedData() → 200 { preview, normalized }
        ▼
[前端] handleFileSelect catch → alert("解析失败: "+d.error+"\n缺失项:\n"+...)
```

---

## 三、逐环节代码

### 3.1 前端触发 — `frontend/src/views/NewUnitEditorView.vue` (L587-603)

```vue
<script setup lang="ts">
// 步骤1 弹窗：<input id="excel-import-field" @change="handleFileSelect" accept=".xlsx,.xls">
// 步骤2 预览：showImportDialog && previewData

async function handleFileSelect(e) {
  const file = e.target.files[0]; if (!file) return
  importFileName.value = file.name
  importing.value = true
  const fd = new FormData(); fd.append('file', file)   // ← 字段名 file 与后端 multer.single('file') 对齐
  try {
    const { data } = await hangarAPI.parseExcel(fd)
    previewData.value = data.preview; previewWarnings.value = data.warnings || []; importing.value = false
  } catch (e) {
    importing.value = false
    const d = e.response?.data
    let msg = '解析失败: ' + (d?.error || e.message)
    if (d?.errors?.length) msg += '\n\n缺失项:\n' + d.errors.map(x => `• ${x.field}: ${x.message}`).join('\n')
    if (d?.warnings?.length) msg += '\n\n警告:\n' + d.warnings.map(x => `• ${x.message}`).join('\n')
    alert(msg)   // ← 用户看到的"解析失败: VALIDATION_ERROR"
  }
}
</script>
```

### 3.2 前端 API — `frontend/src/api/client.js` (L106)

```js
// hangarAPI 对象内
parseExcel: (data) => apiClient.post('/units/parse-excel', data),
createFromJson: (data) => apiClient.post('/units/create-from-json', data),
```

> `apiClient` 基址为 `/api`（vite proxy / nginx 反代 → 网关 3006）。两个端点都在 `units.ts` 的 `router`（挂载于 `/api/units`）。

### 3.3 网关路由 — `backend-gateway/src/routes/units.ts` (L260-304)

```ts
router.post('/parse-excel', authenticate, upload.single('file'), (req, res) => {
  try {
    console.log('[Units/Excel] 收到文件:', req.file?.originalname);

    // ① 文件缺失分支 → 400 FILE_REQUIRED（与 VALIDATION_ERROR 不同）
    if (!req.file) {
      return res.status(400).json({
        error: ErrorCode.FILE_REQUIRED,
        message: '请上传 Excel 文件',
      });
    }

    const buffer = req.file.buffer;
    const parser = new ExcelParser();
    const parsed = parser.parse(buffer);

    const validator = new ExcelValidator();
    const validation = validator.validate(parsed);

    // ② 校验失败分支 → 400 VALIDATION_ERROR  ★ 用户命中此处
    if (!validation.valid) {
      console.log(`[Units/Excel] 验证失败: ${validation.errors.length} 个错误`);
      return res.status(400).json({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Excel 数据验证失败',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // ③ 校验通过 → 归一化 → 200
    const normalized = normalizeParsedData(parsed);
    console.log(`[Units/Excel] 解析并验证成功: ${parsed.basic.name}`);
    return res.json({
      success: true,
      preview: normalized.legacy,
      normalized: normalized.normalized,
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error('[Units/Excel] 解析异常:', error);
    return res.status(500).json({ error: ErrorCode.PARSE_ERROR, message: 'Excel 解析失败' });
  }
});
```

> `ErrorCode` 来自 `@mecha/shared-kernel`：`FILE_REQUIRED` / `VALIDATION_ERROR` / `PARSE_ERROR`。`authenticate` 为 JWT 中间件（无 token → 401，已被排除）。`upload = multer({ storage: memoryStorage() })`，文件不落盘（故服务器无新上传文件，诊断需用真实样本 `weirdnova.xlsx`）。

### 3.4 解析器 — `backend-gateway/src/services/excel-parser.ts`

**入口 `parse` (L70-109)**
```ts
parse(buffer: Buffer): ParsedResult {
  console.log('[ExcelParser v2.1] 开始解析 Excel 文件...');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  console.log(`[ExcelParser v2.1] 工作表: ${workbook.SheetNames.join(', ')}`);
  const sheetName = this.selectSheet(workbook);          // 优先"设定器"
  const sheet = workbook.Sheets[sheetName];
  console.log(`[ExcelParser v2.1] 使用工作表: "${sheetName}"`);
  const result: ParsedResult = {
    basic: { name: '', codename: null, faction: 'earth', totalPoints: null },
    units: {}, skills: [],
    metadata: { sheetName, parsedAt: new Date().toISOString(), version: this.template.version },
  };
  try {
    result.basic = this.parseBasic(sheet);
    console.log('[ExcelParser v2.1] 基本信息:', JSON.stringify(result.basic));
    result.units = this.parseUnits(sheet);
    console.log('[ExcelParser v2.1] 单位数量:', Object.keys(result.units).length);
    result.skills = this.parseSkills(sheet);
    console.log('[ExcelParser v2.1] 技能数量:', result.skills.length);
    console.log('[ExcelParser v2.1] 解析完成');
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ExcelParser v2.1] 解析失败:', msg);
    throw error;
  }
}
```

**`selectSheet` (L114-126)**
```ts
private selectSheet(workbook: XLSX.WorkBook): string {
  if (workbook.Sheets['设定器']) return '设定器';     // 优先"设定器"
  const first = workbook.SheetNames[0];
  if (!first) throw new Error('Excel 文件中没有找到工作表');
  console.warn(`[ExcelParser v2.1] 未找到"设定器"工作表，使用第一个: "${first}"`);
  return first;
}
```

**`parseBasic` (L131-173)** — 坐标 `C2=番号 / F2=代号 / I2=阵营`
```ts
private parseBasic(sheet: XLSX.WorkSheet): ParsedBasic {
  const basic: ParsedBasic = { name: '', codename: null, faction: 'earth', totalPoints: null };
  for (const field of this.template.sheets.basic.fields) {
    const cell = sheet[field.cell];
    const val = this.convertValue(cell?.v, field.type);
    if (field.key === 'name') basic.name = String(val ?? '').trim();
    else if (field.key === 'codename') basic.codename = val ? String(val).trim() : null;
    else if (field.key === 'faction') {
      const raw = String(val ?? 'earth').trim();
      basic.faction = FACTION_MAP[raw] || raw.toLowerCase() || 'earth';
    } else if (field.key === 'totalPoints') basic.totalPoints = typeof val === 'number' ? val : null;
  }
  // 兜底: 如果 C2 为空，尝试 A2 的 "番号 (代号)" 格式
  if (!basic.name) {
    const fallbackCell = sheet['A2'];
    if (fallbackCell?.v) {
      const nameStr = String(fallbackCell.v).trim();
      const match = nameStr.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) { basic.name = match[1].trim(); basic.codename = match[2].trim(); }
      else basic.name = nameStr;
    }
  }
  return basic;
}
```

**`parseUnits` + `resolveUnitKey` (L185-259)** — ★ 单位归属由 A 列内容决定
```ts
private parseUnits(sheet: XLSX.WorkSheet): Record<string, ParsedUnit> {
  const units: Record<string, ParsedUnit> = {};
  const unitsConfig = this.template.sheets.units;
  const columns = unitsConfig.columns;

  for (const rowConfig of unitsConfig.rows) {
    // A 列内容 = 单位归属来源
    const nameCell = sheet[columns.name + String(rowConfig.row)];
    const aText = nameCell?.v ? String(nameCell.v).trim() : '';
    if (!aText) continue;                       // ★ A 列为空 → 跳过整行

    const unitKey = this.resolveUnitKey(aText) || aText;   // ★ 命中别名→标准key，否则存原文
    if (units[unitKey]) {
      console.warn(`[ExcelParser v2.1] 单位 "${unitKey}" 在行 ${rowConfig.row} 重复出现，后者覆盖前者`);
    }
    const unitData: ParsedUnit = {
      name: aText, type: 'none',
      格斗: 0, 射击: 0, 结构: 0, 机动: 0, skillSlots: 0,
    };
    for (const field of rowConfig.fields) {
      if (field === 'name') continue;           // name 已取自 A 列
      const col = columns[field]; if (!col) continue;
      const cellRef = col + String(rowConfig.row);
      const cell = sheet[cellRef];
      const val = cell?.v;
      if (field === 'type') unitData.type = val ? String(val).trim() : 'none';
      else if (field === 'skillSlots') unitData.skillSlots = this.parseNumber(val);
      else (unitData as any)[field] = this.parseNumber(val);
    }
    units[unitKey] = unitData;
    console.log(`[ExcelParser v2.1] 行 ${rowConfig.row}: A="${aText}" → key="${unitKey}"`);
  }
  return units;
}

// 将 A 列单位名归一为标准 key；未命中返回 null（调用方存原文）
private resolveUnitKey(aText: string): string | null {
  const ALIASES: Record<string, string[]> = {
    '主机体': ['主机体', '主机', '本体', '主体', 'main', 'mech', '机体'],
    '跟随':   ['跟随', '随从', '辅机', '支援机', 'royroy', 'sub'],
    '左手':   ['左手', '左臂', '左武器', 'left', 'l'],
    '右手':   ['右手', '右臂', '右武器', 'right', 'r'],
    '其它':   ['其它', '其他', '配件', '装备', 'extra'],
  };
  const norm = aText.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(ALIASES)) {       // 1) 精确匹配
    if (key.toLowerCase() === norm) return key;
    if (aliases.some((a) => a.toLowerCase() === norm)) return key;
  }
  for (const [key, aliases] of Object.entries(ALIASES)) {       // 2) 包含匹配兜底
    if (aliases.some((a) => norm.includes(a.toLowerCase()))) return key;
  }
  return null;   // ★ 未识别 → 存 A 列原文 → 可能导致 required 校验失败
}
```

**`parseSkills` + `getSkillOwnerByRow` (L272-333)** — 技能归属按行号范围硬编码
```ts
private parseSkills(sheet: XLSX.WorkSheet): ParsedSkill[] {
  const skills: ParsedSkill[] = [];
  const { startRow, maxRows, fields } = this.template.sheets.skills;
  for (let row = startRow; row < startRow + maxRows; row++) {
    const skill: ParsedSkill = { row, name: '', type: '', attribute: '', effect: '', range: '', special: '', owner: null };
    let hasData = false;
    for (const field of fields) {
      const cellRef = field.cell + String(row);
      const cell = sheet[cellRef];
      if (cell?.v) hasData = true;
      const val = this.convertValue(cell?.v, field.type);
      if (val !== null && val !== undefined) (skill as any)[field.key] = String(val).trim();
    }
    if (hasData && skill.name) {            // 仅保留有技能名的行
      skill.owner = this.getSkillOwnerByRow(row);   // 按行号范围确定归属
      skills.push(skill);
    }
  }
  return skills;
}
// 行 12-14→主机体, 15-16→跟随, 17-18→右手, 19-20→左手, 21-22→其它
private getSkillOwnerByRow(row: number): string | null {
  const ranges = this.template.sheets.skills.rowRanges;
  if (!ranges) return null;
  for (const [owner, [start, end]] of Object.entries(ranges)) {
    if (row >= start && row <= end) {
      const ownerMap: Record<string, string> = { main: '主机体', royroy: '跟随', right: '右手', left: '左手', extra: '其它' };
      return ownerMap[owner] || owner;
    }
  }
  return null;
}
```

### 3.5 模板坐标 — `backend-gateway/src/services/excel-template.ts` (L69-135)

```ts
export const EXCEL_TEMPLATE: ExcelTemplate = {
  version: '2.1',
  description: '机甲战棋棋子Excel导入模板 (兼容旧版设定器格式 v2.1)',
  sheets: {
    basic: {
      name: '基本信息',
      fields: [
        { key: 'name', cell: 'C2', label: '机体番号', required: true },
        { key: 'codename', cell: 'F2', label: '行动代号' },
        { key: 'faction', cell: 'I2', label: '所属阵营', type: 'select', options: ['earth', 'balon', 'maxion'] },
      ],
    },
    units: {
      name: '单位属性',
      // ★ 单位归属由 A 列内容判定 (resolveUnitKey)，rows[].name 仅占位
      rows: [
        { name: '主机体', row: 4, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '跟随', row: 5, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '左手', row: 6, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '右手', row: 7, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
        { name: '其它', row: 8, fields: ['type', '格斗', '射击', '结构', '机动', 'skillSlots'] },
      ],
      columns: {
        name: 'A', type: 'B', 格斗: 'D', 射击: 'E', 结构: 'F', 机动: 'G', skillSlots: 'H',
      },
    },
    skills: {
      name: '技能列表', startRow: 12, maxRows: 11,
      fields: [
        { key: 'name', cell: 'C', label: '技能名称' },
        { key: 'type', cell: 'D', label: '类型' },
        { key: 'attribute', cell: 'E', label: '攻击属性' },
        { key: 'effect', cell: 'F', label: '技能效果' },
        { key: 'range', cell: 'G', label: '射程' },
        { key: 'special', cell: 'H', label: '特殊效果' },
      ],
      rowRanges: { main: [12,14], royroy: [15,16], right: [17,18], left: [19,20], extra: [21,22] },
    },
  },
  validation: {
    ranges: { 格斗: { min: 0, max: 99 }, 射击: { min: 0, max: 99 }, 结构: { min: 0, max: 99 }, 机动: { min: 0, max: 99 } },
    required: ['主机体'],
    factions: ['earth', 'balon', 'maxion'],
    unitTypes: ['机体', '装甲', '推进器', '武器', '盾牌', '辅助', 'none', 'Royroy', '载具'],  // ★ 已补 Royroy/载具
  },
};
```

### 3.6 数据校验器 — `backend-gateway/src/services/excel-validator.ts`

**`validate` (L35-64)**
```ts
validate(data: ParsedResult): ValidationResult {
  this.errors = []; this.warnings = [];
  console.log('[ExcelValidator v2.1] 开始验证数据...');
  this.validateBasic(data.basic);
  this.validateUnits(data.units);
  this.validateSkills(data.skills);
  const result: ValidationResult = { valid: this.errors.length === 0, errors: this.errors, warnings: this.warnings };
  console.log(`[ExcelValidator v2.1] 验证完成: ${result.valid ? '通过' : '失败'}, 错误=${this.errors.length}, 警告=${this.warnings.length}`);
  if (!result.valid) {   // ★ 失败诊断日志（本次新增）
    console.log(`[ExcelValidator] 失败诊断: 实际单位key=[${data.units ? Object.keys(data.units).join(', ') : '无'}] basic.name=${data.basic?.name || '(空)'}`);
  }
  return result;
}
```

**`validateBasic` (L69-84)**
```ts
private validateBasic(basic): void {
  if (!basic) { this.errors.push({ field: 'basic', message: '基本信息缺失' }); return; }
  if (!basic.name || basic.name.trim() === '') {
    this.errors.push({ field: 'name', message: '机体番号不能为空 (期望在 C2 单元格)' });  // ★ 另一类 400 来源
  } else if (basic.name.length > 100) {
    this.errors.push({ field: 'name', message: '机体番号不能超过100个字符' });
  }
  if (!basic.faction || basic.faction.trim() === '') {
    this.warnings.push({ field: 'faction', message: '阵营未填写 (期望在 I2)，将使用默认值 earth' });
  }
}
```

**`validateUnits` (L89-114)** — ★ `required=['主机体']` 是本次 400 的直接来源
```ts
private validateUnits(units): void {
  if (!units) { this.errors.push({ field: 'units', message: '单位属性数据缺失' }); return; }
  const required = ['主机体'];
  const actualKeys = Object.keys(units);
  for (const name of required) {
    if (!units[name]) {
      this.errors.push({
        field: `units.${name}`,
        message:
          `${name}数据缺失 (期望在第 ${this.getUnitRow(name)} 行)。` +
          `已识别单位=[${actualKeys.join(', ') || '无'}]；` +     // ★ 自解释：列出实际识别到的单位
          `请确认「设定器」sheet 的 A4-A8 填写了"${name}"或其别名(主机/本体/主体/机体)`,
      });
    }
  }
  for (const [name, unit] of Object.entries(units)) this.validateUnit(name, unit);
}
```

> 单个单位检查 `validateUnit`（L129-157）仅产生 **warning**（未知类型、负数数值），不会阻断。

**`validateSkills` (L162-217)** — 仅产生 warning（数量超限、未知技能类型），不阻断。

### 3.7 Schema 归一化 — `backend-gateway/src/services/excel-schema-normalizer.ts` (L69-131)

> 仅在 `validate` 通过后调用。再次强依赖 `主机体` 存在：

```ts
export function normalizeParsedData(parsed: ParsedResult): NormalizedPreview {
  console.log('[SchemaNormalizer] 开始 Schema 归一化...');
  const mainUnit = parsed.units['主机体'];
  if (!mainUnit) {
    throw new Error('主机体数据缺失，无法完成归一化');   // 理论上校验已挡住，此处双保险
  }
  // 累加所有部件四维修正 → UnitStats（hp=结构*5+20, attack=格斗*2+5, ...）
  const totalMelee = sumPartStat(parsed.units, '格斗');
  // ... mapToUnitStats / mapSkills / buildAttributes ...
  const normalized = { name: parsed.basic.name || '未命名机体', faction: parsed.basic.faction || 'earth', category, tier: 1, sprite_key: null, stats, skills, totalPoints: parsed.basic.totalPoints ?? 0, attributes, rawParts: parsed.units, rawSkills: parsed.skills };
  const legacy = { name: parsed.basic.name || '', codename: parsed.basic.codename, faction: parsed.basic.faction || 'earth', totalPoints: parsed.basic.totalPoints, main_格斗: mainUnit.格斗, main_射击: mainUnit.射击, main_结构: mainUnit.结构, main_机动: mainUnit.机动, units: parsed.units, skills: parsed.skills };
  return { normalized, legacy };
}
```

---

## 四、根因分析（容器内真实复现）

用服务器样本 `/tmp/weirdnova.xlsx`（真实文件，原可 `VALID:true`）在容器内逐一改写 A4，跑 `ExcelParser.parse` + `ExcelValidator.validate`：

| 场景 | A4 内容 | 识别到的单位 key | 结果 |
|---|---|---|---|
| ① A4=主角机 | 非标准名 | `[主角机, 跟随, 右手, 左手, 其它]` | ❌ 失败 errors=1 |
| ② A4=单位1 | 自定义名 | `[单位1, 跟随, 右手, 左手, 其它]` | ❌ 失败 errors=1 |
| ③ A4=空 | 整行跳过 | `[跟随, 右手, 左手, 其它]` | ❌ 失败 errors=1 |
| ④ A4=主机 | 合法别名 | `[主机体, 跟随, 右手, 左手, 其它]` | ✅ VALID:true |

**场景①失败日志（增强后自解释）**：
```
[ExcelValidator v2.1] 验证完成: 失败, 错误=1, 警告=0
[ExcelValidator] 失败诊断: 实际单位key=[主角机, 跟随, 右手, 左手, 其它] basic.name=bEXM-21(W) WeirdNova
ERRORS = [{
  "field": "units.主机体",
  "message": "主机体数据缺失 (期望在第 4 行)。已识别单位=[主角机, 跟随, 右手, 左手, 其它]；请确认「设定器」sheet 的 A4-A8 填写了\"主机体\"或其别名(主机/本体/主体/机体)"
}]
```

### 根因结论

**你的 Excel 文件中，「设定器」sheet 的 A4 单元格没有填写"主机体"三个字（或其别名）**。可能情形：
1. A4 填了自定义名（如"主角机""单位1""我的机体"）→ `resolveUnitKey` 未命中 → 存原文 → `units['主机体']` 不存在 → `required` 校验失败；
2. A4 单元格为空 → 整行被跳过 → 缺 `主机体`；
3. （次要）C2 为空 → `basic.name` 为空 → 另一类 400（`机体番号不能为空`）。

> 附带确认：样本 `weirdnova.xlsx` 本身（A4 正确填"主机体"）在新解析器下 `VALID:true, ERRORS:0, WARNINGS:0`。所以你报错的**不是**这份文件，而是另一份 A 列填法不符的表。

---

## 五、已落地的修复 / 增强（已部署到线上网关）

1. **错误信息自解释**（`excel-validator.ts` `validateUnits`）：缺 `主机体` 时列出「已识别单位=[...]」并提示 A4-A8 应填"主机体"或其别名，前端弹窗「缺失项」会直接显示，定位一目了然。
2. **失败诊断日志**：`validate()` 在 `valid=false` 时打印实际单位 key 与 `basic.name`，便于服务器侧快速定位。
3. **消除误导 warning**（`excel-template.ts` / `excel-validator.ts`）：把真实文件中出现的 `Royroy`/`载具`（单位类型）、`近战`/`远程`（技能类型）补进合法枚举 —— 这类值不再误报 warning。
4. 重新构建网关镜像（`mecha-universe-engine-mecha-gateway`），已完成 `tsc` 编译校验（`data.units` 作用域 bug 已修）。

---

## 六、用户操作建议

**立即解决**（不改代码）：打开你的 Excel，确认「设定器」sheet：
- **A4** 单元格精确填写 **`主机体`**（或别名 `主机`/`本体`/`主体`/`机体`，勿带多余空格/换行/后缀如"主角机"）；
- **C2** 填写机体番号（不可空）；
- A5–A8 依次填 `跟随`/`左手`/`右手`/`其它`（或对应别名）；
- 保存为 `.xlsx` 后重新导入。

**自检**：浏览器导入报错后，弹窗「缺失项」会列出 `• units.主机体: 主机体数据缺失...已识别单位=[...]`，据此即可看出 A 列实际填成了什么。

**若仍在本地 dev 导入**：本地网关需用当前源码重新编译（`cd backend-gateway && npx tsc`）后重启，否则跑的是旧校验逻辑。

---

## 七、关键文件清单

| 角色 | 文件 |
|---|---|
| 前端触发 | `frontend/src/views/NewUnitEditorView.vue` (handleFileSelect L587) |
| 前端 API | `frontend/src/api/client.js` (parseExcel L106) |
| 网关路由 | `backend-gateway/src/routes/units.ts` (parse-excel L260) |
| 解析器 | `backend-gateway/src/services/excel-parser.ts` |
| 模板坐标 | `backend-gateway/src/services/excel-template.ts` |
| 校验器 | `backend-gateway/src/services/excel-validator.ts` |
| 归一化 | `backend-gateway/src/services/excel-schema-normalizer.ts` |
| 错误码 | `@mecha/shared-kernel` (`ErrorCode.VALIDATION_ERROR` 等) |

---

*注：本报告基于当前部署的网关镜像（`mecha-universe-engine-mecha-gateway`）源码整理，复现脚本运行于容器 `mecha-gateway` 内。*
