# 数据库API修复报告

生成时间: 2026-04-20
检查范围: /home/agentuser/Dean-garage/services/

## 问题概述

combat-service 的 routes/battles.js 使用了 SQLite 风格的 API，但实际数据库是 PostgreSQL。

## 错误写法 vs 正确写法

| 错误 | 正确 |
|------|------|
| db.prepare('...').all() | await db.all('...') |
| db.prepare('...').get(id) | await db.get('...', [id]) |
| db.prepare('...').run(...) | await db.execute('...', [...]) |

## CombatDatabase API

- db.all(sql, params) - 查询多条
- db.get(sql, params) - 查询单条
- db.execute(sql, params) - INSERT/UPDATE/DELETE
- db.insert(sql, params) - 插入并返回ID
- db.query(sql, params) - 原始查询
- db.transaction(fn) - 事务

## 修复文件

combat-service/src/routes/battles.js - 约20+处需要修改

## 验证命令

curl -s http://localhost:3004/api/combat -H "Authorization: Bearer $TOKEN"
