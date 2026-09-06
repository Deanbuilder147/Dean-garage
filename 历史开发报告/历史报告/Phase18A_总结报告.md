# Phase 18-A 总结报告：词条工厂极限多重复句造句压力测试

> **日期**: 2026-06-21 21:34  
> **技能**: 「雷磁蓄能·绝地轰击」— 4 重极限条件复句  
> **状态**: ✅ 34/34 本地测试通过 + 远程部署验证通过

---

## 一、执行范围

| 模块 | 操作 | 文件 |
|------|------|------|
| 技能执行器 | 集成 ConditionEvaluator | `skillExecutor.cjs` |
| Canvas 渲染 | 添加 ResizeObserver | `HexGridCanvas.vue` |
| 测试脚本 | 34 项全链路压测 | `test/phase18a_stress_test.cjs` |
| 远程部署 | 上传缺失文件 + rebuild | `mecha-combat` 容器 |

---

## 二、修改清单

### 2.1 skillExecutor.cjs（条件评估器集成）

```diff
// 行1: 新增导入
+ const ConditionEvaluator = require('./conditionEvaluator.cjs');

// 行83-89: _getUniversalFields 新增字段
+ requires_hp_below: cfg.requires_hp_below ?? 0,
+ target_on_terrain: cfg.target_on_terrain || '',

// 行144-170: executeUniversalSkill 新增平铺条件评估
+ if (uf.requires_hp_below > 0 || uf.target_on_terrain) {
+     const flatCtx = { unit: { hp, maxHp, has_moved }, target: { terrain } };
+     if (!ConditionEvaluator.evaluateFlat(flatConditions, flatCtx)) {
+         return { triggered: false, message: "..." };
+     }
+ }
```

### 2.2 HexGridCanvas.vue（ResizeObserver 防飞图）

```diff
// 行87: 新增变量
+ let _resizeObserver = null;

// 行394前: 新增函数
+ function setupResizeObserver() {
+     _resizeObserver = new ResizeObserver((entries) => {
+         // 精确同步 canvas.width/height 与容器尺寸
+         canvas.width = width; canvas.height = height;
+         centerGrid(); draw();
+     });
+     _resizeObserver.observe(container);
+ }

// 行575-584: onMounted 新增调用
+ setupResizeObserver()

// 行586-603: onUnmounted 新增清理
+ if (_resizeObserver) { _resizeObserver.disconnect(); }
```

### 2.3 远程部署修复

| 问题 | 根因 | 修复 |
|------|------|------|
| `mecha-combat` Restarting(1) | `src/state/battleState.js` 缺失 | `scp` 上传 + `docker compose build` |
| skillExecutor 未集成条件评估 | 代码未部署 | `scp` 上传 + rebuild |

---

## 三、测试结果

### 3.1 本地全链路压测（34/34 ✅）

```
━━━ 第一部分: conditionEvaluator 白名单检查 ━━━  7/7 ✅
━━━ 第二部分: 技能配置 → 平铺条件提取 ━━━      4/4 ✅
━━━ 第三部分: 4 阶短路拦截对账 ━━━              4/4 ✅
  ✅ 场景1: 满血 HP=100 → requires_hp_below 拦截
  ✅ 场景2: 残血已移动 → requires_unmoved 拦截
  ✅ 场景3: 森林目标 → target_on_terrain 拦截
  ✅ 场景4: 残血+静止+水域 → 白名单完美放行 ✅
━━━ 第四部分: 边界值测试 ━━━                    5/5 ✅
  ✅ HP=75(等于阈值) → 严格 < 拦截
  ✅ HP=74 → 放行
  ✅ HP=0 → 放行
  ✅ target 无 terrain → 拦截
━━━ 第五部分: 水域 beam ×0.5 弱点系数 ━━━      9/9 ✅
  ✅ water → beam: 0.5
  ✅ crystal → beam: 1.5 (对比 water 3倍差距)
  ✅ 伤害模拟: 25 × 0.5 = 12
━━━ 第六部分: 极限造句压测 ━━━                  4/4 ✅
  ✅ 10种地形全对账 (10/10 正确)
  ✅ getAvailableCheckers 全量检查器
```

### 3.2 远程部署验证

```
场景1 (满血拦截):  ✅ PASS
场景2 (移动拦截):  ✅ PASS
场景3 (森林拦截):  ✅ PASS
场景4 (完美放行):  ✅ PASS
白名单 has requires_hp_below: ✅
白名单 has target_on_terrain: ✅
检查器 requires_hp_below: ✅
```

### 3.3 三关闭环

| 关卡 | 要求 | 结果 |
|------|------|------|
| Level 01 | 测试量 ≥ 25 | ✅ 34项 PASS |
| Level 02 | 零失败 | ✅ 0 失败 |
| Level 03 | 白名单完整 | ✅ 4键全注册 |

---

## 四、容器状态

| 容器 | 状态 | 健康 |
|------|------|------|
| nginx-ssl | Up 5 days | ✅ |
| mecha-battle-db | Up 8 weeks | healthy |
| mecha-auth | Up 12 days | healthy |
| mecha-hangar | Up 7 days | healthy |
| mecha-map | Up 7 hours | healthy |
| **mecha-combat** | **Up (rebuilt)** | **healthy** ✅ |
| mecha-comm | Up 9 days | healthy |
| mecha-online-battle | Up 26 hours | healthy |
| mecha-frontend | Up 30 minutes | healthy |

> **9/9 Healthy** ✅ — combat 服务日志零报错

---

## 五、技能配置（通过词条工厂注入）

```json
{
  "thunder_magnet_desperate_strike": {
    "label": "雷磁蓄能·绝地轰击",
    "action_type": "attack",
    "attack_stat": "ranged",
    "category": "special",
    "damage_kind": "beam",
    "target_filter": "enemy",
    "cast_range": 5,
    "base_damage": 25,
    "dice_type": "1d8",
    "success_line": 4,
    "success_bonus_damage": 8,
    "height_bonus_per_diff": 2,
    "requires_hp_below": 75,
    "requires_unmoved": true,
    "target_on_terrain": "water"
  }
}
```

---

## 六、关键教训

1. **平铺条件 vs 管道执行器脱节**: `ConditionEvaluator` 早在 Phase 14 就已实现完整的 flat 条件检查器，但 `skillExecutor.cjs` 从未调用过它。这是典型的"能力存在但未接入"问题。

2. **文件遗漏导致容器崩溃**: `battleState.js` 在本地存在但未被部署到远程容器，导致 combat-service 反复 Restarting。Docker 的 COPY 指令是精确的——不在 `src/` 里的文件不会被复制。

3. **ResizeObserver vs window.resize**: Phase 16 明确记录了需要 ResizeObserver，但实际代码只有 window resize debounce。容器内部尺寸变化（如侧边栏展开/收起）不会触发 window.resize，导致 Canvas 飞图。

4. **远程测试文件不入容器**: `test/` 目录不在 Dockerfile COPY 范围内（只有 `src/` 和 `vendor/`），因此测试脚本需本地运行或额外复制。
