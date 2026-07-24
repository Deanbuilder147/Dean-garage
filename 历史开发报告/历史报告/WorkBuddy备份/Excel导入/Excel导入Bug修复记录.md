# Excel导入功能Bug修复记录

> 日期: 2026-04-15
> 模块: 棋子编辑器 - Excel导入

---

## Bug 1: VALUES问号数量不匹配

### 症状
```
创建失败: 37 values for 40 columns
```

### 原因
`create-from-json` API的INSERT语句中：
- 列名：40个字段
- VALUES问号：只有37个`?`

### 修复
```javascript
// units.js 第823行
// 修复前：37个问号
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

// 修复后：40个问号
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

---

## Bug 2: Cannot read properties of null (reading 'name')

### 症状
```
导入失败: Cannot read properties of null (reading 'name')
```

### 原因
`cleanSkills`函数没有处理技能数组中的`null`元素：
```javascript
// 修复前 - 会报错当s为null时
const cleanSkills = (skills) => {
  return skills.map(s => ({
    name: s.name === 'null' ? '' : s.name,  // s可能为null
    ...
  }));
};
```

### 修复
```javascript
// units.js 第796-805行
const cleanSkills = (skills) => {
  if (!Array.isArray(skills)) return '[]';
  return skills.map(s => ({
    name: s?.name === 'null' ? '' : (s?.name || ''),
    type: s?.type === 'null' ? '' : (s?.type || ''),
    attribute: s?.attribute === 'null' ? '实体' : (s?.attribute || '实体'),
    effect: s?.effect === 'null' ? '' : (s?.effect || ''),
    range: s?.range === 'null' ? '' : (s?.range || '')
  }));
};
```

**改动说明**：
1. 添加`if (!Array.isArray(skills))`检查
2. 使用可选链`s?.name`防止null访问
3. 提供默认值防止undefined

---

## 当前状态

| 项目 | 状态 |
|------|------|
| parse-excel API | ✅ 正常 |
| create-from-json API | ✅ 修复后待测试 |
| VALUES问号数量 | ✅ 已修复(40个) |
| cleanSkills空值处理 | ✅ 已修复 |
| 服务重启 | ✅ 已完成 |

---

## 下一步

请测试Excel导入功能，如有新问题请提供错误信息。

