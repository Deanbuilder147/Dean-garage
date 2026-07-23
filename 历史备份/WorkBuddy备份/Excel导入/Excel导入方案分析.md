# Excel导入功能改进方案分析

> 分析时间: 2026-04-15
> 问题: "其它"技能属性未导入，用户体验需要优化

---

## 一、现状问题诊断

### 🔴 当前Excel导入流程

```
用户选择文件 → 立即上传 → 后台解析Excel → 直接入库 → 返回数据
```

### ❌ 存在的问题

| 问题 | 描述 | 影响 |
|------|------|------|
| **无预览确认** | 文件上传后立即处理，没有给用户确认机会 | 误操作无法撤销 |
| **规则检查过早** | 导入时立即验证规则，不灵活 | 用户想先填数据再调整 |
| **"若为空则可填空"丢失** | Excel中的空值被忽略，没有提示 | 用户不知道哪里可以填空 |
| **技能丢失** | 第333行 `if (!skillName) continue;` 跳过空技能名 | "其它"技能可能因此被跳过 |
| **列号映射硬编码** | 依赖特定列号(C/G等)，不够健壮 | 模板微小变化导致解析失败 |

### 📋 当前Excel读取范围

根据代码分析 (units.js 第254-305行):

**基础信息区 (A2:G9)**
- C2: 棋子名称
- F2: 代号
- I2: 阵营
- 行4-8: 主机体、跟随、左手、右手、其它的属性

**技能表区 (A11:G22)**
- 行12-14: 主机体技能(3个)
- 行15-16: Royroy技能(2个)
- 行17-18: 右手技能(2个)
- 行19-20: 左手技能(2个)
- 行21-22: 其它技能(2个) ⬅️ 问题可能在这里

---

## 二、方案一：前端预览+保存时验证

### 📐 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Vue3)                           │
├─────────────────────────────────────────────────────────────┤
│  1. 选择Excel文件                                           │
│  2. 前端解析Excel (xlsx库)                                   │
│  3. 显示预览界面（表单预填充，可编辑）                        │
│  4. 用户确认/修改                                           │
│  5. 点击"保存" → 发送到后端                                   │
│  6. 后端仅做宽松验证（数值非负等基础检查）                    │
│  7. 入库完成                                                │
└─────────────────────────────────────────────────────────────┘
```

### ✅ 优点

| 优点 | 说明 |
|------|------|
| **用户体验好** | 先预览再保存，有反悔机会 |
| **"若为空可填空"实现** | 空值保留占位符，用户可后续填写 |
| **规则检查后置** | 只在最终保存时检查，灵活性高 |
| **减少无效请求** | 避免误导入产生脏数据 |
| **支持增量编辑** | 可多次修改后再保存 |

### ❌ 缺点

| 缺点 | 说明 |
|------|------|
| **增加前端复杂度** | 需要在前端实现Excel解析 |
| **数据安全风险** | 规则检查前置能拦截错误数据 |
| **开发工作量** | 需要新建预览组件和流程 |

### 🔧 技术实现要点

**前端新增依赖:**
```bash
npm install xlsx  # Excel解析库
```

**关键代码示例:**
```javascript
// 前端Excel解析
import XLSX from 'xlsx';

function parseExcelPreview(file) {
  const workbook = XLSX.read(file, { type: 'binary' });
  const worksheet = workbook.Sheets['设定器'];
  
  // 读取A2:G9基础信息
  const name = worksheet['C2']?.v || '';
  const codename = worksheet['F2']?.v || '';
  // ... 读取各部位属性
  
  // 读取A11:G22技能表
  // 保留空值作为可填空标记
  const extra_skills = [];
  for (let row = 21; row <= 22; row++) {
    const skillName = worksheet['C' + row]?.v || ''; // 空字符串保留
    if (skillName) {
      extra_skills.push({
        name: skillName,
        type: worksheet['D' + row]?.v || '',
        attribute: worksheet['E' + row]?.v || '',
        effect: worksheet['F' + row]?.v || '',
        range: worksheet['G' + row]?.v || ''
      });
    }
  }
  
  return { name, codename, extra_skills, ... };
}

// 预览表单（可编辑）
const previewData = reactive({
  name: '',
  codename: '',
  extra_skills: [], // 可能为空数组，表示待填写
  // ...
});
```

**后端调整:**
```javascript
// 新API: /api/hangar/units/import-preview
// 仅接收JSON数据，不解析Excel
// 宽松验证：只检查数值非负
router.post('/import-preview', auth, (req, res) => {
  const data = req.body;
  // 宽松验证
  const errors = [];
  if (data.main_格斗 < 0) errors.push('格斗不能为负数');
  // ...
  
  // 保存到数据库
  // ...
});
```

---

## 三、方案二：后台中转JSON格式

### 📐 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Vue3)                           │
├─────────────────────────────────────────────────────────────┤
│  1. 选择Excel文件                                           │
│  2. 上传到后端 /api/units/parse-excel                       │
│  3. 后端解析为JSON，返回预览数据                             │
│  4. 显示预览界面（表单预填充，可编辑）                        │
│  5. 用户确认后点击"确认上传"                                 │
│  6. 发送JSON到 /api/units/create-from-json                  │
│  7. 后端宽松验证后入库                                       │
└─────────────────────────────────────────────────────────────┘
```

### ✅ 优点

| 优点 | 说明 |
|------|------|
| **前端简单** | 不需要引入Excel解析库 |
| **Excel解析集中** | 后端统一处理Excel格式，好维护 |
| **支持复杂逻辑** | 后端可以做更复杂的转换和验证 |
| **安全性好** | 敏感计算都在后端完成 |

### ❌ 缺点

| 缺点 | 说明 |
|------|------|
| **两次请求** | 解析一次 + 保存一次，网络开销大 |
| **延迟较高** | 需要等待服务器响应才能预览 |
| **依赖网络** | 离线情况下无法使用 |

### 🔧 技术实现要点

**新增API端点:**
```javascript
// 1. 解析Excel为JSON (不保存)
router.post('/parse-excel', auth, upload.single('file'), (req, res) => {
  const workbook = XLSX.readFile(req.file.path);
  const data = parseWorkbook(workbook); // 解析逻辑复用现有代码
  fs.unlinkSync(req.file.path); // 删除临时文件
  
  res.json({
    success: true,
    preview: data, // 返回JSON预览数据
    warnings: [],  // 可包含警告信息
    emptyFields: ['extra_skills'] // 标记可填空字段
  });
});

// 2. 从JSON创建棋子
router.post('/create-from-json', auth, (req, res) => {
  const data = req.body;
  // 宽松验证
  // 保存到数据库
  // 返回结果
});
```

**前端流程:**
```javascript
// 步骤1: 上传并解析
async function uploadAndParse(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch('/api/hangar/units/parse-excel', {
    method: 'POST',
    body: formData
  });
  const { preview, warnings, emptyFields } = await res.json();
  
  // 显示预览界面
  showPreviewDialog(preview, warnings, emptyFields);
}

// 步骤2: 确认保存
async function confirmSave(previewData) {
  const res = await fetch('/api/hangar/units/create-from-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(previewData)
  });
  // 处理结果
}
```

---

## 四、方案对比

| 维度 | 方案一：前端预览 | 方案二：后台中转 |
|------|------------------|------------------|
| **用户体验** | ⭐⭐⭐⭐⭐ 即时预览，无延迟 | ⭐⭐⭐⭐ 需等待服务器响应 |
| **开发复杂度** | ⭐⭐⭐ 前端需要增加解析逻辑 | ⭐⭐ 前后端各增一个接口 |
| **网络开销** | ⭐⭐⭐⭐⭐ 一次请求 | ⭐⭐⭐ 两次请求 |
| **维护成本** | ⭐⭐⭐ 前端解析逻辑需维护 | ⭐⭐⭐⭐ 后端集中处理 |
| **灵活性** | ⭐⭐⭐⭐⭐ 支持离线预览 | ⭐⭐⭐ 必须联网 |
| **安全性** | ⭐⭐⭐ 前端可被绕过 | ⭐⭐⭐⭐⭐ 后端完全控制 |

---

## 五、推荐方案

### 🏆 推荐：方案二（后台中转JSON）

**理由:**

1. **更符合现有架构** - 当前Excel解析逻辑已在后端，改动最小
2. **维护简单** - Excel格式变化时只需改后端一处
3. **可渐进增强** - 先实现基础功能，后续可添加前端解析优化
4. **数据安全** - 关键业务逻辑始终在后端

### 📝 实施计划

**Phase 1: 基础功能（2-3小时）**
- [ ] 新增 `/api/units/parse-excel` 接口
- [ ] 新增 `/api/units/create-from-json` 接口
- [ ] 前端修改：上传→预览→确认流程
- [ ] 修复"其它"技能丢失问题（检查第333行）

**Phase 2: 体验优化（1-2小时）**
- [ ] 预览界面高亮"可填空"字段
- [ ] 显示警告信息（如"左手属性为空，可后续填写"）
- [ ] 支持在预览界面直接编辑

**Phase 3: 可选增强（后续）**
- [ ] 前端本地缓存预览数据
- [ ] 支持Excel模板下载
- [ ] 批量导入多个棋子

---

## 六、"其它"技能丢失的具体修复

### 🔍 问题定位

当前代码 (units.js 第333行):
```javascript
if (!skillName) continue;  // 空技能名被跳过
```

当Excel中"其它"技能的技能名称为空时，整条技能记录被跳过。

### ✅ 修复方案

**方案A: 保留空技能名记录**
```javascript
// 修改为允许空技能名，但标记为待填写
const skill = {
  name: skillName || '',  // 空字符串保留
  type: skillType || '',
  attribute: skillAttr || '',
  // ...
};

// 只有完全为空才跳过（整行无数据）
if (!skillName && !skillType && !skillAttr && !skillEffect) {
  continue;
}

// 添加到数组，前端会显示为"可填空"
extra_skills.push(skill);
```

**方案B: 预览时标记可填空**
```javascript
// 解析时返回空字段标记
const emptyFields = [];
if (!extra_skills.length) {
  emptyFields.push({ field: 'extra_skills', message: '其它技能未填写，可在预览界面添加' });
}

res.json({
  preview: data,
  emptyFields  // 前端据此高亮显示
});
```

---

## 七、决策建议

### 请Dean确认以下问题：

1. **是否接受两次请求的设计？** 
   - 方案二需要"上传→解析"和"确认保存"两次API调用

2. **"若为空则可填空"的具体表现？**
   - A: 预览界面显示"(可填空)"占位符
   - B: 高亮显示空字段
   - C: 列出"待填写清单"

3. **是否需要保留"规则检查"环节？**
   - A: 完全舍弃，只检查基础数值
   - B: 移到保存时进行
   - C: 保留现有逻辑（宽松模式）

4. **优先级**
   - 先修复"其它"技能丢失的bug？
   - 还是先实现新流程？

---

*分析报告生成时间: 2026-04-15*
