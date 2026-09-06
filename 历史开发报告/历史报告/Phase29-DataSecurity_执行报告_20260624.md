# Phase 29-DataSecurity 执行报告

**日期**: 2026-06-24
**状态**: ✅ 全量通过 (8/8)
**时间**: 13:20 – 13:46

---

## 一、工序概述

| 工序 | 内容 | 结果 |
|---|---|---|
| 步骤一 | 复活老账号 — PostgreSQL 双源桥接 | ✅ |
| 步骤二 | 立规矩 — is_public / review_status 审核状态机 | ✅ |
| 步骤三 | 全量拉闸 — 词条库四级只读公开 | ✅ |

---

## 二、步骤一：PostgreSQL 双源对账

### 修改文件
1. **`backend-gateway/src/db/postgres.ts`** (🆕) — PostgreSQL 连接池模块
   - 延迟初始化 `pg.Pool` → mecha-battle-db:5432
   - `pgQuery` / `pgGetOne` / `pgExecute` 安全查询封装
   - `pgHealthCheck` 连通性检测

2. **`backend-gateway/src/config.ts`** — 追加 `postgres` 配置节
   - PG_HOST/PG_PORT/PG_DATABASE/PG_USER/PG_PASSWORD 环境变量注入

3. **`backend-gateway/src/routes/auth.ts`** — 双源登录管线
   - 第一源 SQLite 检索 → 未命中时触发第二源 PG
   - Bcrypt 哈希无缝对账
   - 登录成功 → `migrateLegacyAssets()` 自动平移用户/单位/地图到 SQLite
   - JWT 荷载含 `pg_migrated` 标记

4. **`backend-gateway/package.json`** — 添加 `pg` 依赖
5. **`backend-gateway/Dockerfile`** — `apk add libpq`
6. **`docker-compose.yml`** — 追加 `mecha-battle-db` PostgreSQL 容器

### 验证
- PG 连通性: ✅ CONNECTED
- 老账号 `oldveteran` PostgreSQL 登录: ✅ 200 + JWT (role=user, faction=maxion, credits=100)
- 用户平移至 SQLite: ✅ 自动迁移
- 网关日志: `[Auth] PostgreSQL 旧库命中 oldveteran，执行资产平移... 资产平移完成`

---

## 三、步骤二：is_public / review_status 审核状态机

### 修改文件
1. **`shared-kernel/src/tokens.ts`** — 新增 `ReviewStatus` 枚举 (pending/approved/rejected)
2. **`shared-kernel/src/types.ts`** — `EntityMatrix` + `BattlefieldMap` 追加 `is_public: boolean` 和 `review_status: ReviewStatus`
3. **`shared-kernel/src/index.ts`** — 导出 `ReviewStatus`
4. **`backend-gateway/src/db/sqlite.ts`** — schema 迁移: units/maps 表追加 `is_public`/`review_status` 列
5. **`backend-gateway/src/routes/units.ts`** — 写入前置拦截
   - admin/dominator: `is_public` 自由设置, `review_status=approved`
   - user/referee: `is_public` 锁死 0, `review_status=pending`
6. **`backend-gateway/src/routes/maps.ts`** — 同上审核卡口 + 游客仅见 approved 公开地图

### 权限矩阵

| 角色 | is_public 设置 | review_status |
|---|---|---|
| admin / dominator | 自由 (0/1) | approved |
| user / referee / guest | 强制 0 | pending |

### 验证
| 测试 | 用户 | 结果 |
|---|---|---|
| 管理员创建单位 is_public=true | testadmin (admin) | ✅ is_public=1, approved |
| 管理员创建地图 is_public=true | testadmin (admin) | ✅ is_public=1, approved |
| 普通玩家创建单位 is_public=true | testplayer (user) | ✅ is_public=0, pending |
| 普通玩家创建地图 is_public=true | testplayer (user) | ✅ is_public=0, pending |
| SQLite 库内对账 | — | ✅ 4/4 数据正确 |

---

## 四、步骤三：词条库四级只读公开

### 修改文件
1. **`backend-gateway/src/routes/glossary.ts`** — 全量重构
   - 5 个核心系统技能硬编码锁死 `is_public: true, review_status: approved`
   - GET: 无认证中间件，100% 只读广播（游客/任何人无条件放行）
   - POST: authenticate → role 校验, user → 403 "普通玩家词条需经管理员审核方可公开"
   - 核心技能不可删除/覆盖
2. **`backend-gateway/src/middleware/auth.ts`** — 移除 glossary 白名单（GET 无中间件体系放行，POST 内置 auth）

### 验证
| 测试 | 用户 | 结果 |
|---|---|---|
| 游客 GET glossary | guest | ✅ 200, 5 核心技能, is_public=true |
| 普通玩家 POST glossary | testplayer | ✅ 403 "权限不足" |
| 管理员 POST glossary | testadmin | ✅ 200, version=42.0 |
| 外网公开访问 | HTTPS | ✅ 200, 全量技能曝光 |

---

## 五、基础设施变更

- PostgreSQL 容器 (`mecha-battle-db`): postgres:14-alpine
- PG 表结构: users, units, maps (与 SQLite 对等)
- 环境变量: PG_HOST/PG_PORT/PG_DATABASE/PG_USER/PG_PASSWORD
- Docker 卷: pg_data (PostgreSQL 持久化) + gateway_data (SQLite 持久化)

---

## 六、修改文件清单

| # | 文件 | 类型 |
|---|---|---|
| 1 | `shared-kernel/src/tokens.ts` | 修改 (ReviewStatus 枚举) |
| 2 | `shared-kernel/src/types.ts` | 修改 (is_public, review_status) |
| 3 | `shared-kernel/src/index.ts` | 修改 (导出 ReviewStatus) |
| 4 | `backend-gateway/src/db/postgres.ts` | 🆕 (PG 连接模块) |
| 5 | `backend-gateway/src/db/sqlite.ts` | 修改 (schema 迁移) |
| 6 | `backend-gateway/src/config.ts` | 修改 (PG 配置) |
| 7 | `backend-gateway/src/routes/auth.ts` | 修改 (双源登录) |
| 8 | `backend-gateway/src/routes/units.ts` | 修改 (审核状态机) |
| 9 | `backend-gateway/src/routes/maps.ts` | 修改 (审核状态机) |
| 10 | `backend-gateway/src/routes/glossary.ts` | 修改 (权限控制) |
| 11 | `backend-gateway/src/middleware/auth.ts` | 修改 (白名单清理) |
| 12 | `backend-gateway/package.json` | 修改 (pg 依赖) |
| 13 | `backend-gateway/Dockerfile` | 修改 (libpq) |
| 14 | `docker-compose.yml` | 修改 (PG 容器) |

---

## 七、最终验证得分

```
============================================================
Phase 29-DataSecurity 最终全量验证
============================================================

--- 步骤一：双源对账 ---
  ✅ 管理员登录 role=admin
  ✅ 老账号 PG 双源登录 + 资产平移

--- 步骤二：审核状态机 ---
  ✅ Admin单位 is_public=1, approved
  ✅ Admin地图 is_public=1, approved
  ✅ Player单位 is_public=0, pending
  ✅ Player地图 is_public=0, pending

--- 步骤三：词条库权限 ---
  ✅ 游客GET glossary 5核心技能
  ✅ 普通玩家POST glossary 403
  ✅ 管理员POST glossary 200

============================================================
结果: 8 通过 / 0 失败 / 8 总计
============================================================
```
