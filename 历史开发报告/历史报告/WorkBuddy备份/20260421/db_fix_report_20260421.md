# Combat Service 500 错误修复报告
**日期**: 2026-04-21
**状态**: ✅ 已修复

---

## 问题现象
战斗界面 500 Internal Server Error，无法创建战斗会话

## 根因分析

### 1. 数据库重复初始化问题 (db.js)
**错误**: `prepare is not a function`
**原因**:
- 构造函数自动调用 `initializeDatabase()`
- index.js 的 startServer() 又调用一次
- 导致 adapter 状态混乱

**修复**: 在 initializeDatabase() 开头添加 adapter 检查
```javascript
async initializeDatabase() {
  if (this.adapter) {
    console.log('✅ 数据库已初始化，跳过重复初始化');
    return;
  }
  // ...
}
```

### 2. INSERT 返回 ID 问题 (battles.js)
**错误**: `result.lastInsertRowid` 为 undefined
**原因**: PostgreSQL 的 execute() 返回 rowCount，不是 lastInsertRowid

**修复**: 使用 RETURNING 子句
```javascript
// 修复前
const result = await db.execute('INSERT INTO ...');
const battle = await db.get('...', [result.lastInsertRowid]);

// 修复后
const battle = await db.get(
  'INSERT INTO ... RETURNING *',
  [params]
);
```

### 3. 验证器 Schema 问题 (battle.validators.js)
**错误**: `Cannot read properties of undefined (reading 'map')`
**原因**:
- players 字段要求必填且非空
- battlefield_id 要求 UUID 格式

**修复**: 放宽验证规则
```javascript
export const createBattleSchema = z.object({
  battlefield_id: z.union([z.number().int().positive(), uuidSchema]),
  room_id: z.union([z.number().int().positive(), uuidSchema]).optional().nullable(),
  players: z.array(...).optional().default([]),
});
```

---

## 修改的文件
1. `/services/combat-service/src/database/db.js`
2. `/services/combat-service/src/routes/battles.js`
3. `/services/combat-service/src/validators/battle.validators.js`

## 验证结果
✅ 创建战斗 API 正常返回
✅ 返回完整的 10x10 六角格战场状态
✅ 所有服务端口正常监听
