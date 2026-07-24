# 机甲战棋 京都报告 — Phase 9 → 17 全量里程碑汇总

> **汇编日期**: 2026-06-21 21:32  
> **覆盖范围**: Phase 9.5 → Phase 17 (9 次大版本迭代)  
> **Git 提交链**: 23 commits，从 `028c7f7` 到 `850a434`  
> **容器**: 9/9 Healthy  
> **服务器**: 106.54.197.69 (lhins-2fs1rzs8)

---

## 一、血统图谱：九阶段演化树

```
Phase 9.5                         可破坏生态单元全面落地
  │  d086b7f                      4 种可破坏地形 + 伤害退化管道
  ▼
Phase 9.6-9.7                     CTM 归一化 + Even-R 拓扑锁死
  │  028c7f7 → dc8a448 → 9c0d940  标准等距平行投影，正逆矩阵对账
  ▼
Phase 10                          万能语法战斗中枢
  │  bd91983                      主谓宾定状补六维插槽，13 阶段伤害管道
  ▼
Phase 11                          万能语法中枢完成
  │  52a7939                      WebSocket掷骰 + 技能预览 + 分步向导 + DKM装备 + AI生成器
  ▼
Phase 12                          装备管线收束 & 手动摇骰闭环
  │  7b9ccb4                      dkm平坦→对象映射 + pending_roll 挂起机制 + AI导入
  ▼
Phase 13a → 13b → 13.5            用户体验收束战役
  │  97e642f → af00223 → 1a43d01  地图/清洗器/悬浮卡/双轴滑槽 + 设备分流/鉴权/装备碰撞 + 黑屏防爆
  ▼
Phase 14                          条件链激活
  │  3e22ea9                      conditionEvaluator AND复合条件 + requires_hp_below + target_on_terrain
  ▼
Phase 15 → 15.5                   剧情战役单机沙盒 + 前端完全体资产收网
  │  10868f3 → cf2a4e4            10 REST端点 + 教学关卡 + 16文件SCP回传缝合
  ▼
Phase 16                          战场Canvas故障诊断与四层修复
  │  f2bd298 → b995671            路由白屏/CSS孤儿选择器/浮动面板/Canvas时序 四层根因链
  ▼
Phase 17                          WebSocket隔离 + AI战术引擎 + 三关闭环
    850a434                       CJS桥接DamagePipe/TerrainMovement + 关卡03 AND条件真机验证
```

---

## 二、七大技术支柱总览

### 支柱 1：地形系统 (Phase 9.5 → 13a → 14 → 17)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| 4种可破坏地形 (forest/fortress/crystal/city_building) | 9.5 | terrainMovement.cjs |
| 伤害退化管道 (explosive×1.0, beam×0.8) | 9.5 | damagePipe.cjs |
| terrainSanitizer 向后兼容清洗器 | 13a | NewBattleView.vue |
| target_on_terrain 条件链 | 14 | conditionEvaluator.cjs |
| 可破坏地形真机验证 (city_building→rubble) | 17 | test_phase17_integration.js |

### 支柱 2：等距渲染管线 (Phase 9.6-9.7 → 16)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| CTM标准等距平行投影 `transform(scaleX,0,shearX,scaleY,0,0)` | 9.6 | HexGridCanvas.vue |
| canvasPosToHex 原子化逆矩阵 | 9.7 | HexGridCanvas.vue |
| 双轴平移滑槽 (X/Y slider) | 13a | HexGridCanvas.vue |
| ResizeObserver + rAF×2 Canvas时序修复 | 16 | HexGridCanvas.vue |

**当前基准参数**:
```
iso=ON, shearX=0.25, shearY=0.44, scaleX=1.00, scaleY=0.39, rot=-24
单元=64×72, 间距=H103% V79% O51%
```

### 支柱 3：伤害管道 (Phase 10 → 13b → 17)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| 13阶段泛化管道 (base→mobility→extras→height→terrain_kind→defense→weapon→armor→roll→final) | 10 | damagePipe.cjs |
| 5种伤害类型 (kinetic/beam/explosive/corrosive/thermal) | 10 | damagePipe.cjs |
| 装备DKM交叉碰撞 (damage_kind×weaponType严格匹配) | 13b | damagePipe.cjs |
| CJS桥接至ESM (AI引擎使用) | 17 | campaignManager.js |

### 支柱 4：万能技能系统 (Phase 10-12 → 14)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| 主谓宾定状补6维插槽 (38字段) | 10 | skillExecutor.cjs / glossary-skill-config.json |
| 6步分步创建向导 | 11 | GlossaryView.vue |
| AI技能一键导入 | 12 | GlossaryView.vue |
| conditionEvaluator AND复合条件 (requires_hp_below + requires_unmoved + target_on_terrain) | 14 | conditionEvaluator.cjs |

### 支柱 5：联机战斗 (Phase 11-12)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| WebSocket手动摇骰 (空格拍骰子) | 11 | socketService.js + NewBattleView.vue |
| pending_roll挂起机制 + 60s超时清理 | 12 | battles.js + combatResolver.js |
| is_manual_roll 真机验证 | 17 | test_phase17_integration.js |

### 支柱 6：剧情战役单机沙盒 (Phase 15 → 17)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| campaigns.json关卡配置 | 15 | campaignManager.js |
| 10 REST端点 (list/start/attack/terrain/move/end-turn/state/progress/cleanup) | 15 | routes/campaign.js |
| 阶段推进状态机 (Stage1→2→VICTORY) | 15 | campaignManager.js |
| 完整前端 UI + /campaign路由 | 15.5 | CampaignView.vue |
| WebSocket 100%隔离 (零joinRoom调用) | 17 | CampaignView.vue |
| 启发式AI战术引擎 (开火→寻路→二次开火) | 17 | campaignManager.js |
| 三关闭环集成测试 | 17 | test_phase17_integration.js |

### 支柱 7：前端基础架构 (Phase 13b-16)

| 能力 | 引入阶段 | 核心模块 |
|------|---------|---------|
| PC/Mobile设备分流路由 | 13b | main.js + deviceDetector.js |
| Sidebar退出登录闭环 (localStorage.clear + userStore.clearUser) | 13b | TheSidebar.vue |
| 新建地图10×10~200×200弹窗 | 13b | NewBattlefieldView.vue |
| 装备DKM防爆器 + 全局错误边界 | 13.5 | NewBattleView.vue |
| CSS孤儿选择器清洗 + 浮动面板移出flex容器 | 16 | NewBattleView.vue |

---

## 三、交付物统计

### 文件变更总览

| 阶段 | 新增文件 | 修改文件 | 净增代码行 | 关键主题 |
|------|---------|---------|-----------|---------|
| Phase 9 | 0 | 3 | ~+600/-70 | 地形+CTM+拓扑 |
| Phase 10 | 0 | 7 | +1,505/-591 | 万能语法中枢 |
| Phase 11 | 0 | 13 | +896/-58 | 掷骰/向导/DKM/生成器 |
| Phase 12 | 0 | 5 | +326/-11 | dkm映射+摇骰闭环+AI导入 |
| Phase 13+14 | 2 | 14 | ~+1,324 | UX收束+条件链+防爆 |
| Phase 15+15.5 | 4 | 3 | ~+1,750 | 沙盒+前端资产收网 |
| Phase 16 | 0 | 3 | +核心修复 | Canvas四层修复 |
| Phase 17 | 3 | 3 | +关键功能 | AI引擎+三关测试 |
| **合计** | **9+** | **51+** | **~+7,400** | |

### 9个阶段实际产出能力矩阵

| 能力域 | Phase 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 可破坏地形 | ✅ | | | | | | | | ✅ |
| CTM等距渲染 | ✅ | | | | | | | ✅ | |
| 鼠标拾取 | ✅ | | | | | | | ✅ | |
| 双轴滑槽 | | | | | ✅ | | | ✅ | |
| 13阶伤害管道 | | ✅ | | | ✅ | | | | ✅ |
| DKM交叉碰撞 | | ✅ | | ✅ | ✅ | | | | ✅ |
| 万能技能插槽 | | ✅ | ✅ | ✅ | | ✅ | | | |
| 手动摇骰 | | | ✅ | ✅ | | | | | ✅ |
| 技能预览卡片 | | | ✅ | | | | | | |
| 分步创建向导 | | | ✅ | | | | | | |
| AI技能生成器 | | | ✅ | | | | | | |
| 复合条件评估 | | | | | | ✅ | | | ✅ |
| 设备分流 | | | | | ✅ | | | | |
| 退出登录 | | | | | ✅ | | | | |
| 剧情沙盒 | | | | | | | ✅ | | ✅ |
| AI战术引擎 | | | | | | | | | ✅ |
| 黑屏防爆 | | | | | ✅ | | | ✅ | |
| WebSocket隔离 | | | | | | | | | ✅ |
| 集成测试 | | | | | | | ✅ | ✅ | ✅ |

---

## 四、Git 全提交链 (23 commits)

```
850a434  Phase 17: WebSocket隔离 + AI战术引擎 + 三关闭环集成测试
065b648  chore: 清理调试文件
b995671  Phase 16 Hotfix: 战场端渲染崩溃修复
f2bd298  Phase 16: 视觉大一统与核心渲染/鼠标交互完全复活
cf2a4e4  Merge remote 'origin/main' with Phase 15.5 complete frontend
10868f3  Phase 15.5: 前端完全体资产收网与向后兼容补全
3e22ea9  Phase 14: 激活 conditionEvaluator 复合条件链
c6c1334  Phase 13.5: 装备属性交叉碰撞
af00223  Phase 13-A: 设备 UI 差异化定向分流
1a43d01  Phase 14: 整备室出击黑屏修复
b238351  Phase 13.5: Sidebar auth + New Map 10-200
42e17f9  chore: 移除滑槽补丁备份文件
7b5cfee  Phase 13 UI扩展: HexGridCanvas 双轴平移滑槽
fcac62d  Phase 13 hotfix: /api/map/list SQLite查询
97e642f  Phase 13: 补丁战役
7b9ccb4  Phase 12: 装备dkm映射 + 手动摇骰闭环 + AI导入
52a7939  Phase 11: 万能语法中枢完成
bd91983  Phase 10: 万能语法战斗中枢
9c0d940  Phase 9.7: Even-R 拓扑步长锁死
dc8a448  Phase 9.6: 紧急修复X轴失效
d086b7f  Phase 9.5: 可破坏生态单元全面落地
028c7f7  紧急修复: 鼠标逆矩阵拾取
18f5936  Phase 9: 批量地形刷与视口水平死锁
```

---

## 五、基础设施状态

### 服务容器 (9/9)

| 容器 | 端口 | 核心职责 |
|------|------|---------|
| mecha-frontend | 8081 | Nginx + Vue3 SPA (dist/) |
| mecha-combat | 3004 | 战斗API + 战役沙盒 + 技能系统 |
| mecha-auth | — | JWT 鉴权 |
| mecha-battle-db | — | 战斗数据持久化 (SQLite) |
| mecha-map | — | 地图数据服务 (SQLite) |
| mecha-online-battle | — | 在线对战 |
| mecha-hangar | — | 格纳库 |
| mecha-comm | — | WebSocket 通信 |
| nginx-ssl | — | SSL 反向代理 |

### 核心配置路径

| 配置 | 路径 |
|------|------|
| 词条库 | `services/combat-service/src/config/glossary-skill-config.json` v5.0 |
| 关卡配置 | `services/combat-service/src/config/campaigns.json` v2.0 |
| 伤害管道 | `services/combat-service/src/services/combatCore/damagePipe.cjs` |
| 条件评估器 | `services/combat-service/src/services/combatCore/conditionEvaluator.cjs` |
| 地形移动 | `services/combat-service/src/services/combatCore/terrainMovement.cjs` |
| 技能执行器 | `services/combat-service/src/services/combatCore/skillExecutor.cjs` |
| 战役管理器 | `services/combat-service/src/services/campaignManager.js` |

---

## 六、三关真机验证结果 (Phase 17)

```
🎉 ALL TESTS PASSED! (3/3)

✅ [Level01] 全要素语法拆除
   Terrain: city_building → rubble (explosive attack)
   AI actions: 4

✅ [Level02] 命运的空格拍击
   AI actions: 3
   manual_roll: true
   pending_roll 机制正常

✅ [Level03] 绝地潜行复句
   requires_unmoved: true
   requires_hp_below: 75
   conditionEvaluator AND 精准评估通过
   AI actions: 4
```

---

## 七、当前能力边界

### ✅ 已具备

1. **标准等距六角格渲染** — CTM矩阵 + Even-R正逆对账，鼠标指哪打哪
2. **可破坏地形系统** — 4种可破坏地形，explosive/beam全额伤害，退化管道
3. **13阶段伤害管道** — 主谓宾定状补万能插槽，5种伤害类型，DKM交叉碰撞
4. **万能技能系统** — 38字段JSON造句创造技能，6步向导，AI生成器，一键导入
5. **复合条件评估** — requires_hp_below + requires_unmoved + target_on_terrain AND短路
6. **手动摇骰系统** — 空格拍骰子 → WebSocket广播 → pending_roll 60s超时清理
7. **剧情战役沙盒** — 10 REST端点，阶段推进状态机，支持多关配置表
8. **AI战术引擎** — 开火判定(DamagePipe) → 智能寻路(高防地形) → 移动后二次开火
9. **WebSocket隔离** — CampaignView 100% REST闭环，零连接冲突
10. **设备分流** — PC/Mobile 独立路由和战场容器
11. **前端防爆体系** — 装备DKM空值反填 + 全局错误边界 + Canvas时序修复

### ⬜ 后续扩展点

| 优先级 | 能力 | 描述 |
|--------|------|------|
| P0 | 剧情10关完整剧本 | Phase 18: 多分支叙事，评分系统 |
| P1 | 装备耐久系统 | 当前 durability 已配置但未消耗生效 |
| P1 | AI行动动画 | 前端可视化敌方移动/攻击过程 |
| P2 | 联机PvP复通 | Phase 19: WebSocket兼容性修复，房间机制重连 |
| P2 | 移动端战场开发 | MobileBattleView 独立触控交互 |
| P3 | 地图缩略图预览 | 加载下拉中显示地形布局缩略图 |

---

## 八、编码规范演进

经历了 9 个阶段的打磨，项目形成了三条不可逾越的红线：

### 战棋开发终极宪法 v2.0

1. **渲染管线沙盒化** — Canvas是单向数据管道的终点，严禁读取Vue ref/reactive或全局Store
2. **坐标转换纯净化** — hexUtils.js是唯一数学真理，严禁硬编码六边形常量
3. **显式依赖与数据解耦** — 禁止幽灵函数，依赖必须作为参数显式传入

### 防爆兜底文化

- **装备DKM空值反填**: 每个槽位必有 `{ damage_kind_modifiers: { kinetic:0, beam:0, explosive:0, corrosive:0 } }`
- **try/catch覆盖**: 所有管道关键阶段 + 全局错误边界
- **CSS无孤儿选择器**: CI 应加入 CSS 语法 lint
- **Docker必须rebuild**: mecha-frontend 无 volume mount，镜像内置dist

---

## 九、关键教训

| # | 教训 | 来源阶段 |
|---|------|---------|
| 1 | Python补丁的锚点依赖性 — 锚点不在则全链崩溃 | Phase 16 |
| 2 | CSS孤儿选择器静默破坏 — 14个无{}的选择器串联成无效后代规则 | Phase 16 |
| 3 | `position:fixed` 元素不应放在flex容器内 — 仍占据flex流空间 | Phase 16 |
| 4 | `nextTick` 不足以保证Canvas布局完成 — 必须 rAF×2 或 ResizeObserver | Phase 16 |
| 5 | 前线功能需端到端集成测试验证 — 避免"报告声称有、代码实际无" | Phase 15 |
| 6 | WebSocket与REST双通道共存需严格隔离 — 战役沙盒必须零joinRoom | Phase 17 |
| 7 | CJS模块跨规范桥接需 createRequire — ESM环境不能直接 require('.cjs') | Phase 17 |

---

## 十、结语

从 Phase 9 到 Phase 17，九次迭代完成了从一个基础六角格渲染实验到具备完整战斗闭环、AI决策、剧情战役、万能技能系统的机甲战棋游戏的蜕变。

当前项目处于**可玩可用、后端坚如磐石、前端一体成型、三关闭环验证通过**的状态。

---

> **汇编完成，待 Phase 18 新章开启。**
